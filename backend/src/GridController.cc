#include "GridController.h"
#include "GridSim.h"
#include <drogon/drogon.h>
#include <mutex>
#include <set>

static std::mutex                                    wsGridMtx;
static std::set<drogon::WebSocketConnectionPtr>      wsGridClients;

static drogon::HttpResponsePtr jsonResp(const std::string& body,
                                        drogon::HttpStatusCode code = drogon::k200OK) {
    auto r = drogon::HttpResponse::newHttpResponse();
    r->setStatusCode(code);
    r->setContentTypeCode(drogon::CT_APPLICATION_JSON);
    r->addHeader("Access-Control-Allow-Origin", "*");
    r->addHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    r->addHeader("Access-Control-Allow-Headers", "Content-Type");
    r->setBody(body);
    return r;
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

    auto j = req->jsonObject();
    if (!j) { cb(jsonResp("{\"error\":\"invalid json\"}", drogon::k400BadRequest)); return; }

    float lat = (*j)["lat"].asFloat();
    float lon = (*j)["lon"].asFloat();
    std::string typeStr = (*j)["type"].asString();
    float intensity = (*j).get("intensity", 1.0f).asFloat();

    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
        cb(jsonResp("{\"error\":\"bad coordinates\"}", drogon::k400BadRequest)); return;
    }

    GridSim::EventType type;
    if      (typeStr == "cyclone")       type = GridSim::EventType::CYCLONE;
    else if (typeStr == "heat_dome")     type = GridSim::EventType::HEAT_DOME;
    else if (typeStr == "cold_outbreak") type = GridSim::EventType::COLD_OUTBREAK;
    else if (typeStr == "blocking_high") type = GridSim::EventType::BLOCKING_HIGH;
    else { cb(jsonResp("{\"error\":\"unknown type\"}", drogon::k400BadRequest)); return; }

    GridSim::instance().inject(lat, lon, type, std::max(0.1f, std::min(3.0f, intensity)));
    cb(jsonResp("{\"ok\":true}"));
}

void GridWsController::handleNewConnection(
    const drogon::HttpRequestPtr&,
    const drogon::WebSocketConnectionPtr& conn)
{
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
    std::lock_guard<std::mutex> lk(wsGridMtx);
    for (auto& conn : wsGridClients)
        conn->send(json);
}

