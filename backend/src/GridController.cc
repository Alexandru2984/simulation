#include "GridController.h"
#include "GridSim.h"
#include <drogon/drogon.h>
#include <mutex>
#include <set>

// ── WebSocket connection registry ────────────────────────────────────────────
static std::mutex                                    wsGridMtx;
static std::set<drogon::WebSocketConnectionPtr>      wsGridClients;

void GridRestController::getState(
    const drogon::HttpRequestPtr&,
    std::function<void(const drogon::HttpResponsePtr&)>&& cb) const
{
    auto resp = drogon::HttpResponse::newHttpResponse();
    resp->setStatusCode(drogon::k200OK);
    resp->setContentTypeCode(drogon::CT_APPLICATION_JSON);
    resp->addHeader("Access-Control-Allow-Origin", "*");
    resp->setBody(GridSim::instance().getStateJson());
    cb(resp);
}

void GridWsController::handleNewConnection(
    const drogon::HttpRequestPtr&,
    const drogon::WebSocketConnectionPtr& conn)
{
    std::lock_guard<std::mutex> lk(wsGridMtx);
    wsGridClients.insert(conn);
    // Send current state immediately on connect
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
