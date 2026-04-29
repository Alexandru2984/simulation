#pragma once
#include <drogon/drogon.h>
#include <drogon/WebSocketController.h>
#include "WeatherSim.h"

// ── REST controller ──────────────────────────────────────────────────────────
class WeatherRestController : public drogon::HttpController<WeatherRestController> {
public:
    METHOD_LIST_BEGIN
        ADD_METHOD_TO(WeatherRestController::getWeather, "/api/weather", drogon::Get, drogon::Options);
    METHOD_LIST_END

    void getWeather(const drogon::HttpRequestPtr& req,
                    std::function<void(const drogon::HttpResponsePtr&)>&& cb);
};

// ── WebSocket controller ─────────────────────────────────────────────────────
class WeatherWsController : public drogon::WebSocketController<WeatherWsController> {
public:
    WS_PATH_LIST_BEGIN
        WS_PATH_ADD("/ws/weather");
    WS_PATH_LIST_END

    void handleNewMessage(const drogon::WebSocketConnectionPtr& conn,
                          std::string&& msg,
                          const drogon::WebSocketMessageType& type) override;

    void handleNewConnection(const drogon::HttpRequestPtr& req,
                             const drogon::WebSocketConnectionPtr& conn) override;

    void handleConnectionClosed(const drogon::WebSocketConnectionPtr& conn) override;
};
