#pragma once

#include <drogon/HttpController.h>

// POST /api/client-errors      browser error reports (see ClientErrors.h)
// GET  /api/ops/client-errors  operator summary; 127.0.0.1 only, 404 at the edge
class ClientErrorController : public drogon::HttpController<ClientErrorController> {
public:
    METHOD_LIST_BEGIN
        ADD_METHOD_TO(ClientErrorController::report,  "/api/client-errors",     drogon::Post);
        ADD_METHOD_TO(ClientErrorController::summary, "/api/ops/client-errors", drogon::Get);
    METHOD_LIST_END

    void report(const drogon::HttpRequestPtr& req,
                std::function<void(const drogon::HttpResponsePtr&)>&& cb) const;
    void summary(const drogon::HttpRequestPtr& req,
                 std::function<void(const drogon::HttpResponsePtr&)>&& cb) const;
};
