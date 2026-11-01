#include "WeatherController.h"
#include "Security.h"
#include "WsHub.h"
#include <drogon/drogon.h>
#include <json/json.h>

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
    if (req->method() == drogon::Options) {
        auto resp = drogon::HttpResponse::newHttpResponse();
        Security::addCorsHeaders(resp, "GET, OPTIONS");
        cb(resp);
        return;
    }
    auto s = WeatherSim::instance().current();
    auto resp = drogon::HttpResponse::newHttpJsonResponse(stateToJson(s));
    Security::addCorsHeaders(resp, "GET, OPTIONS");
    cb(resp);
}

// ── WebSocket ────────────────────────────────────────────────────────────────

// Superseded by the "point" readout in grid frames; kept for tabs still
// running an older frontend, so it only gets the legacy share of slots.
static WsHub& weatherHub() {
    static WsHub hub(WsHub::maxLegacyClients());
    return hub;
}

static std::string stateMessage() {
    Json::StreamWriterBuilder builder;
    builder["indentation"] = "";
    return Json::writeString(builder, stateToJson(WeatherSim::instance().current()));
}

void WeatherWsController::handleNewConnection(
    const drogon::HttpRequestPtr& req,
    const drogon::WebSocketConnectionPtr& conn)
{
    const auto origin = req->getHeader("Origin");
    if (!Security::originAllowed(origin, Security::allowedOrigin())) {
        conn->shutdown(drogon::CloseCode::kViolation, "forbidden origin");
        return;
    }
    if (!weatherHub().add(conn)) {
        conn->shutdown(WsHub::kTryAgainLater, "simulation is full");
        return;
    }
    conn->send(stateMessage());
}

void WeatherWsController::handleNewMessage(
    const drogon::WebSocketConnectionPtr& conn,
    std::string&&,
    const drogon::WebSocketMessageType&)
{
    // Drogon answers pings itself; any client frame (normally a pong) proves
    // the client is still reading.
    WsHub::touch(conn);
}

void WeatherWsController::handleConnectionClosed(
    const drogon::WebSocketConnectionPtr& conn)
{
    weatherHub().remove(conn);
}

// ── Broadcast task (registered as a recurring timer in main.cc) ──────────────
void broadcastWeather() {
    const auto clients = weatherHub().collect()[WsHub::Json];
    if (clients.empty()) return;

    const std::string msg = stateMessage();
    for (const auto& conn : clients) conn->send(msg);
}
