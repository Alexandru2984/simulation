#include "GridController.h"
#include "AssimilationStatus.h"
#include "EventLog.h"
#include "GridSim.h"
#include "RuntimeInfo.h"
#include "Security.h"
#include "WsHub.h"
#include <drogon/drogon.h>
#include <chrono>

namespace {

WsHub& gridHub() {
    static WsHub hub(256);
    return hub;
}

long long unixNow() {
    return std::chrono::duration_cast<std::chrono::seconds>(
        std::chrono::system_clock::now().time_since_epoch()).count();
}

FrameExtras currentExtras() {
    FrameExtras extras;
    extras.speed      = GridSim::instance().speed();
    extras.viewers    = gridHub().size();
    extras.serverTime = unixNow();
    extras.events     = EventLog::instance().json(extras.serverTime);
    return extras;
}

}  // namespace

std::size_t GridWsController::viewerCount() {
    return gridHub().size();
}

static drogon::HttpResponsePtr jsonResp(const std::string& body,
                                        drogon::HttpStatusCode code = drogon::k200OK) {
    return Security::json(body, code);
}

void GridRestController::getState(
    const drogon::HttpRequestPtr&,
    std::function<void(const drogon::HttpResponsePtr&)>&& cb) const
{
    auto resp = jsonResp(GridCodec::composeJson(*GridSim::instance().frame(),
                                                currentExtras()));
    resp->addHeader("Cache-Control", "no-store");
    cb(resp);
}

void GridRestController::inject(
    const drogon::HttpRequestPtr& req,
    std::function<void(const drogon::HttpResponsePtr&)>&& cb)
{
    if (req->method() == drogon::Options) { cb(jsonResp("{}")); return; }
    // Global budget on top of nginx's per-IP 10 r/m
    static RateLimiter injectLimiter(60.0, 10.0);
    if (!Security::requireMutationAccess(req, cb, &injectLimiter)) return;

    auto j = req->jsonObject();
    if (!j) { cb(jsonResp("{\"error\":\"invalid json\"}", drogon::k400BadRequest)); return; }

    if (!(*j).isMember("lat") || !(*j).isMember("lon") || !(*j).isMember("type")) {
        cb(jsonResp("{\"error\":\"missing required fields: lat, lon, type\"}", drogon::k400BadRequest)); return;
    }
    if (!(*j)["lat"].isNumeric() || !(*j)["lon"].isNumeric() || !(*j)["type"].isString()) {
        cb(jsonResp("{\"error\":\"type mismatch\"}", drogon::k400BadRequest)); return;
    }

    float lat = (*j)["lat"].asFloat();
    float lon = (*j)["lon"].asFloat();
    std::string typeStr = (*j)["type"].asString();
    float intensity = ((*j).isMember("intensity") && (*j)["intensity"].isNumeric())
                      ? (*j)["intensity"].asFloat() : 1.0f;

    if ((*j).isMember("intensity") && !(*j)["intensity"].isNumeric()) {
        cb(jsonResp("{\"error\":\"intensity must be numeric\"}",
                    drogon::k400BadRequest));
        return;
    }

    if (!Security::finiteInRange(lat, -90.0, 90.0) ||
        !Security::finiteInRange(lon, -180.0, 180.0) ||
        !Security::finiteInRange(intensity, 0.1, 3.0)) {
        cb(jsonResp("{\"error\":\"coordinates or intensity out of range\"}",
                    drogon::k400BadRequest));
        return;
    }

    // Map to a static identifier so the event log never stores user text.
    struct Known { const char* id; GridSim::EventType type; };
    static constexpr Known KNOWN[] = {
        {"cyclone",       GridSim::EventType::CYCLONE},
        {"heat_dome",     GridSim::EventType::HEAT_DOME},
        {"cold_outbreak", GridSim::EventType::COLD_OUTBREAK},
        {"blocking_high", GridSim::EventType::BLOCKING_HIGH},
        {"tornado",       GridSim::EventType::TORNADO},
    };
    const Known* match = nullptr;
    for (const auto& known : KNOWN)
        if (typeStr == known.id) { match = &known; break; }
    if (!match) {
        cb(jsonResp("{\"error\":\"unknown type\"}", drogon::k400BadRequest));
        return;
    }

    GridSim::instance().inject(lat, lon, match->type, intensity);
    EventLog::instance().record(match->id, lat, lon, intensity, unixNow());
    cb(jsonResp("{\"ok\":true}"));
}

void GridWsController::handleNewConnection(
    const drogon::HttpRequestPtr& req,
    const drogon::WebSocketConnectionPtr& conn)
{
    const auto origin = req->getHeader("Origin");
    if (!Security::originAllowed(origin, Security::allowedOrigin())) {
        conn->shutdown(drogon::CloseCode::kViolation, "forbidden origin");
        return;
    }

    // Opt-in compact frames; older clients keep receiving JSON text.
    const bool binary = req->getParameter("format") == "bin1";
    if (!gridHub().add(conn, binary)) {
        conn->shutdown(drogon::CloseCode::kViolation, "connection limit reached");
        return;
    }

    const auto frame = GridSim::instance().frame();
    const auto extras = currentExtras();
    if (binary)
        conn->send(GridCodec::composeBinary(*frame, extras), drogon::WebSocketMessageType::Binary);
    else
        conn->send(GridCodec::composeJson(*frame, extras));
}

void GridWsController::handleConnectionClosed(
    const drogon::WebSocketConnectionPtr& conn)
{
    gridHub().remove(conn);
}

void GridWsController::handleNewMessage(
    const drogon::WebSocketConnectionPtr& conn,
    std::string&&,
    const drogon::WebSocketMessageType&)
{
    // Clients send no application messages; any frame (normally a pong)
    // proves the client is still reading.
    WsHub::touch(conn);
}

void GridWsController::broadcastGrid() {
    std::vector<drogon::WebSocketConnectionPtr> text, binary;
    gridHub().collect(text, binary);
    if (text.empty() && binary.empty()) return;

    const auto frame = GridSim::instance().frame();
    const auto extras = currentExtras();
    if (!text.empty()) {
        const std::string json = GridCodec::composeJson(*frame, extras);
        for (const auto& conn : text) conn->send(json);
    }
    if (!binary.empty()) {
        const std::string bin = GridCodec::composeBinary(*frame, extras);
        for (const auto& conn : binary)
            conn->send(bin, drogon::WebSocketMessageType::Binary);
    }
}

void GridRestController::forecast(
    const drogon::HttpRequestPtr& req,
    std::function<void(const drogon::HttpResponsePtr&)>&& cb) const
{
    if (req->method() == drogon::Options) { cb(jsonResp("{}")); return; }
    if (!Security::requireJsonPostAccess(req, cb)) return;

    int steps = 100;  // default: 100 steps → 10 snapshots
    auto j = req->jsonObject();
    if (!j) {
        cb(jsonResp("{\"error\":\"invalid json\"}", drogon::k400BadRequest));
        return;
    }
    if ((*j).isMember("steps")) {
        if (!(*j)["steps"].isInt()) {
            cb(jsonResp("{\"error\":\"type mismatch\"}", drogon::k400BadRequest));
            return;
        }
        steps = std::max(1, std::min(200, (*j)["steps"].asInt()));
    }
    static RateLimiter forecastLimiter(30.0, 5.0);
    if (!forecastLimiter.allow()) {
        cb(jsonResp("{\"error\":\"rate limited\"}", drogon::k429TooManyRequests));
        return;
    }
    cb(jsonResp(GridSim::instance().getForecast(steps)));
}

void GridRestController::getHistory(
    const drogon::HttpRequestPtr& req,
    std::function<void(const drogon::HttpResponsePtr&)>&& cb) const
{
    int limit = 30;  // default: last 30 snapshots (~90 real seconds)
    const auto limitStr = req->getParameter("limit");
    if (!limitStr.empty()) {
        if (!Security::parseIntInRange(limitStr, 1, 120, limit)) {
            cb(jsonResp("{\"error\":\"limit must be an integer from 1 to 120\"}",
                        drogon::k400BadRequest));
            return;
        }
    }
    static RateLimiter historyLimiter(30.0, 10.0);
    if (!historyLimiter.allow()) {
        cb(jsonResp("{\"error\":\"rate limited\"}", drogon::k429TooManyRequests));
        return;
    }
    cb(jsonResp(GridSim::instance().getHistory(limit)));
}

void GridRestController::getMetrics(
    const drogon::HttpRequestPtr&,
    std::function<void(const drogon::HttpResponsePtr&)>&& cb) const
{
    auto& sim = GridSim::instance();
    const std::size_t clients = gridHub().size();

    const auto& assimilation = AssimilationStatus::instance();
    char buf[1024];
    snprintf(buf, sizeof(buf),
        "{\"tick\":%lld,\"simTime\":%.1f,\"simSpeed\":%.1f,"
        "\"rows\":%d,\"cols\":%d,\"gridCells\":%d,"
        "\"wsClients\":%zu,\"uptimeSeconds\":%lld,"
        "\"assimilationLastAttemptUnix\":%lld,"
        "\"assimilationLastSuccessUnix\":%lld,"
        "\"assimilationAccepted\":%llu,"
        "\"assimilationUpstreamFailures\":%llu,"
        "\"assimilationValidationFailures\":%llu,"
        "\"version\":\"1.0\",\"gitSha\":\"%s\",\"gitDirty\":%s,"
        "\"buildTimeUtc\":\"%s\",\"status\":\"ok\"}",
        (long long)sim.tick(),
        (double)sim.simTime(),
        (double)sim.speed(),
        GridSim::ROWS, GridSim::COLS, GridSim::SIZE,
        clients,
        RuntimeInfo::uptimeSeconds(),
        (long long)assimilation.lastAttemptUnix(),
        (long long)assimilation.lastSuccessUnix(),
        (unsigned long long)assimilation.accepted(),
        (unsigned long long)assimilation.upstreamFailures(),
        (unsigned long long)assimilation.validationFailures(),
        RuntimeInfo::buildGitSha(),
        RuntimeInfo::buildGitDirtyJson(),
        RuntimeInfo::buildTimeUtc());
    cb(jsonResp(buf));
}
