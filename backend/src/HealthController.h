#pragma once

#include <drogon/HttpController.h>

class HealthController : public drogon::HttpController<HealthController> {
public:
    METHOD_LIST_BEGIN
        ADD_METHOD_TO(HealthController::healthz, "/api/healthz", drogon::Get);
        ADD_METHOD_TO(HealthController::readyz,  "/api/readyz",  drogon::Get);
        ADD_METHOD_TO(HealthController::version, "/api/version", drogon::Get);
    METHOD_LIST_END

    void healthz(const drogon::HttpRequestPtr& req,
                 std::function<void(const drogon::HttpResponsePtr&)>&& cb) const;
    void readyz(const drogon::HttpRequestPtr& req,
                std::function<void(const drogon::HttpResponsePtr&)>&& cb) const;
    void version(const drogon::HttpRequestPtr& req,
                 std::function<void(const drogon::HttpResponsePtr&)>&& cb) const;
};
