#include "GridController.h"
#include "GridSim.h"
#include "RuntimeInfo.h"
#include "Security.h"
#include <drogon/drogon.h>
#include <mutex>
#include <set>

static std::mutex                                    wsGridMtx;
static std::set<drogon::WebSocketConnectionPtr>      wsGridClients;
static constexpr std::size_t                         MAX_GRID_WS_CLIENTS = 256;

static drogon::HttpResponsePtr jsonResp(const std::string& body,
                                        drogon::HttpStatusCode code = drogon::k200OK) {
    return Security::json(body, code);
}

void GridRestController::getState(
    const drogon::HttpRequestPtr&,
    std::function<void(const drogon::HttpResponsePtr&)>&& cb) const
{
    cb(jsonResp(GridSim::instance().getStateJson()));
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

    GridSim::EventType type;
    if      (typeStr == "cyclone")       type = GridSim::EventType::CYCLONE;
    else if (typeStr == "heat_dome")     type = GridSim::EventType::HEAT_DOME;
    else if (typeStr == "cold_outbreak") type = GridSim::EventType::COLD_OUTBREAK;
    else if (typeStr == "blocking_high") type = GridSim::EventType::BLOCKING_HIGH;
    else if (typeStr == "tornado")       type = GridSim::EventType::TORNADO;
    else { cb(jsonResp("{\"error\":\"unknown type\"}", drogon::k400BadRequest)); return; }

    GridSim::instance().inject(lat, lon, type, intensity);
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

    bool accepted = false;
    {
        std::lock_guard<std::mutex> lk(wsGridMtx);
        if (wsGridClients.size() < MAX_GRID_WS_CLIENTS) {
            wsGridClients.insert(conn);
            accepted = true;
        }
    }
    if (!accepted) {
        conn->shutdown(drogon::CloseCode::kViolation, "connection limit reached");
        return;
    }
    conn->send(GridSim::instance().getStateJson());
}

void GridWsController::handleConnectionClosed(
    const drogon::WebSocketConnectionPtr& conn)
{
    std::lock_guard<std::mutex> lk(wsGridMtx);
    wsGridClients.erase(conn);
}

void GridWsController::handleNewMessage(
    const drogon::WebSocketConnectionPtr&,
    std::string&&,
    const drogon::WebSocketMessageType&) {}

void GridWsController::broadcastGrid() {
    std::vector<drogon::WebSocketConnectionPtr> clients;
    {
        std::lock_guard<std::mutex> lk(wsGridMtx);
        if (wsGridClients.empty()) return;
        clients.assign(wsGridClients.begin(), wsGridClients.end());
    }
    std::string json = GridSim::instance().getStateJson();
    for (auto& conn : clients)
        conn->send(json);
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
    std::size_t clients;
    { std::lock_guard<std::mutex> lk(wsGridMtx); clients = wsGridClients.size(); }

    char buf[640];
    snprintf(buf, sizeof(buf),
        "{\"tick\":%lld,\"simTime\":%.1f,\"simSpeed\":%.1f,"
        "\"rows\":%d,\"cols\":%d,\"gridCells\":%d,"
        "\"wsClients\":%zu,\"uptimeSeconds\":%lld,"
        "\"version\":\"1.0\",\"gitSha\":\"%s\",\"gitDirty\":%s,"
        "\"buildTimeUtc\":\"%s\",\"status\":\"ok\"}",
        (long long)sim.tick(),
        (double)sim.simTime(),
        (double)sim.speed(),
        GridSim::ROWS, GridSim::COLS, GridSim::SIZE,
        clients,
        RuntimeInfo::uptimeSeconds(),
        RuntimeInfo::buildGitSha(),
        RuntimeInfo::buildGitDirtyJson(),
        RuntimeInfo::buildTimeUtc());
    cb(jsonResp(buf));
}
