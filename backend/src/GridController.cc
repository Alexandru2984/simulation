#include "GridController.h"
#include "GridSim.h"
#include "RuntimeInfo.h"
#include "Security.h"
#include <drogon/drogon.h>
#include <mutex>
#include <set>

static std::mutex                                    wsGridMtx;
static std::set<drogon::WebSocketConnectionPtr>      wsGridClients;

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
    if (!Security::requireMutationAccess(req, cb)) return;

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

    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
        cb(jsonResp("{\"error\":\"bad coordinates\"}", drogon::k400BadRequest)); return;
    }

    GridSim::EventType type;
    if      (typeStr == "cyclone")       type = GridSim::EventType::CYCLONE;
    else if (typeStr == "heat_dome")     type = GridSim::EventType::HEAT_DOME;
    else if (typeStr == "cold_outbreak") type = GridSim::EventType::COLD_OUTBREAK;
    else if (typeStr == "blocking_high") type = GridSim::EventType::BLOCKING_HIGH;
    else if (typeStr == "tornado")       type = GridSim::EventType::TORNADO;
    else { cb(jsonResp("{\"error\":\"unknown type\"}", drogon::k400BadRequest)); return; }

    GridSim::instance().inject(lat, lon, type, std::max(0.1f, std::min(3.0f, intensity)));
    cb(jsonResp("{\"ok\":true}"));
}

void GridWsController::handleNewConnection(
    const drogon::HttpRequestPtr& req,
    const drogon::WebSocketConnectionPtr& conn)
{
    auto origin = req->getHeader("Origin");
    if (!origin.empty() && origin != Security::allowedOrigin()) {
        conn->shutdown(drogon::CloseCode::kViolation, "forbidden origin");
        return;
    }
    std::lock_guard<std::mutex> lk(wsGridMtx);
    wsGridClients.insert(conn);
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
    std::string json = GridSim::instance().getStateJson();
    std::vector<drogon::WebSocketConnectionPtr> clients;
    {
        std::lock_guard<std::mutex> lk(wsGridMtx);
        clients.assign(wsGridClients.begin(), wsGridClients.end());
    }
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
    if (j && (*j).isMember("steps") && (*j)["steps"].isInt()) {
        steps = std::max(1, std::min(200, (*j)["steps"].asInt()));
    }
    cb(jsonResp(GridSim::instance().getForecast(steps)));
}

void GridRestController::getHistory(
    const drogon::HttpRequestPtr& req,
    std::function<void(const drogon::HttpResponsePtr&)>&& cb) const
{
    int limit = 30;  // default: last 30 snapshots (~90 real seconds)
    auto limitStr = req->getParameter("limit");
    if (!limitStr.empty()) {
        try { limit = std::max(1, std::min(120, std::stoi(limitStr))); }
        catch (...) {}
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

    char buf[512];
    snprintf(buf, sizeof(buf),
        "{\"tick\":%lld,\"simTime\":%.1f,\"simSpeed\":%.1f,"
        "\"rows\":%d,\"cols\":%d,\"gridCells\":%d,"
        "\"wsClients\":%zu,\"uptimeSeconds\":%lld,"
        "\"version\":\"1.0\",\"status\":\"ok\"}",
        (long long)sim.tick(),
        (double)sim.simTime(),
        (double)sim.speed(),
        GridSim::ROWS, GridSim::COLS, GridSim::SIZE,
        clients,
        RuntimeInfo::uptimeSeconds());
    cb(jsonResp(buf));
}
