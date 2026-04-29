#include "WeatherController.h"
#include <drogon/drogon.h>
#include <json/json.h>
#include <mutex>
#include <set>

// ── Helpers ──────────────────────────────────────────────────────────────────

static Json::Value stateToJson(const WeatherState& s) {
    Json::Value v;
    v["temperature"]    = std::round(s.temperature    * 100.0) / 100.0;
    v["pressure"]       = std::round(s.pressure       * 100.0) / 100.0;
    v["wind_speed"]     = std::round(s.wind_speed     * 100.0) / 100.0;
    v["wind_direction"] = std::round(s.wind_direction * 100.0) / 100.0;
    v["timestamp"]      = (Json::Int64)s.timestamp;
    return v;
}

// ── REST ─────────────────────────────────────────────────────────────────────

void WeatherRestController::getWeather(
    const drogon::HttpRequestPtr& req,
    std::function<void(const drogon::HttpResponsePtr&)>&& cb)
{
    auto s = WeatherSim::instance().current();
    auto resp = drogon::HttpResponse::newHttpJsonResponse(stateToJson(s));
    resp->addHeader("Access-Control-Allow-Origin", "*");
    resp->addHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    cb(resp);
}

// ── WebSocket ────────────────────────────────────────────────────────────────

static std::mutex ws_mtx;
static std::set<drogon::WebSocketConnectionPtr> ws_clients;

void WeatherWsController::handleNewConnection(
    const drogon::HttpRequestPtr& req,
    const drogon::WebSocketConnectionPtr& conn)
{
    {
        std::lock_guard<std::mutex> lk(ws_mtx);
        ws_clients.insert(conn);
    }
    // Send current state immediately
    auto s = WeatherSim::instance().current();
    Json::FastWriter fw;
    conn->send(fw.write(stateToJson(s)));
}

void WeatherWsController::handleNewMessage(
    const drogon::WebSocketConnectionPtr& conn,
    std::string&& msg,
    const drogon::WebSocketMessageType& type)
{
    // Respond to ping with pong; ignore other messages
    if (type == drogon::WebSocketMessageType::Ping)
        conn->send("", drogon::WebSocketMessageType::Pong);
}

void WeatherWsController::handleConnectionClosed(
    const drogon::WebSocketConnectionPtr& conn)
{
    std::lock_guard<std::mutex> lk(ws_mtx);
    ws_clients.erase(conn);
}

// ── Broadcast task (called from main) ────────────────────────────────────────
// Registered as a recurring timer in main.cc

void broadcastWeather() {
    auto s = WeatherSim::instance().current();
    Json::FastWriter fw;
    std::string msg = fw.write(stateToJson(s));
    msg.erase(msg.find_last_not_of("\n") + 1); // trim trailing newline

    std::lock_guard<std::mutex> lk(ws_mtx);
    for (auto& c : ws_clients) {
        if (c->connected())
            c->send(msg);
    }
}
