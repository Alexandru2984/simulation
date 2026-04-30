#pragma once
#include <drogon/HttpController.h>
#include <drogon/WebSocketController.h>

// REST: GET /api/grid/state
class GridRestController : public drogon::HttpController<GridRestController> {
public:
    METHOD_LIST_BEGIN
        ADD_METHOD_TO(GridRestController::getState, "/api/grid/state", drogon::Get);
        ADD_METHOD_TO(GridRestController::inject,   "/api/grid/inject", drogon::Post, drogon::Options);
    METHOD_LIST_END
    void getState(const drogon::HttpRequestPtr&,
                  std::function<void(const drogon::HttpResponsePtr&)>&&) const;
    void inject(const drogon::HttpRequestPtr&,
                std::function<void(const drogon::HttpResponsePtr&)>&&);
};

// WebSocket: /ws/grid  — broadcasts full grid JSON every second
class GridWsController : public drogon::WebSocketController<GridWsController> {
public:
    WS_PATH_LIST_BEGIN
        WS_PATH_ADD("/ws/grid");
    WS_PATH_LIST_END
    void handleNewMessage(const drogon::WebSocketConnectionPtr&,
                          std::string&&,
                          const drogon::WebSocketMessageType&) override;
    void handleNewConnection(const drogon::HttpRequestPtr&,
                             const drogon::WebSocketConnectionPtr&) override;
    void handleConnectionClosed(const drogon::WebSocketConnectionPtr&) override;

    static void broadcastGrid();
};

