#pragma once

#include <drogon/drogon.h>
#include <cstdlib>
#include <functional>
#include <string>
#include <string_view>

namespace Security {

inline const std::string& allowedOrigin() {
    static const std::string origin = [] {
        const char* env = std::getenv("SIM_ALLOWED_ORIGIN");
        return std::string(env && *env ? env : "https://simulation.micutu.com");
    }();
    return origin;
}

inline const std::string& mutationToken() {
    static const std::string token = [] {
        const char* env = std::getenv("SIM_MUTATION_TOKEN");
        return std::string(env && *env ? env : "");
    }();
    return token;
}

inline void addCorsHeaders(const drogon::HttpResponsePtr& resp,
                           const std::string& methods = "GET, POST, OPTIONS") {
    resp->addHeader("Access-Control-Allow-Origin", allowedOrigin());
    resp->addHeader("Access-Control-Allow-Methods", methods);
    resp->addHeader("Access-Control-Allow-Headers", "Content-Type, X-Simulation-Token");
}

inline drogon::HttpResponsePtr json(const std::string& body,
                                    drogon::HttpStatusCode code = drogon::k200OK,
                                    const std::string& methods = "GET, POST, OPTIONS") {
    auto resp = drogon::HttpResponse::newHttpResponse();
    resp->setStatusCode(code);
    resp->setContentTypeCode(drogon::CT_APPLICATION_JSON);
    addCorsHeaders(resp, methods);
    resp->setBody(body);
    return resp;
}

inline bool hasAllowedOrigin(const drogon::HttpRequestPtr& req) {
    const auto origin = req->getHeader("Origin");
    return origin.empty() || origin == allowedOrigin();
}

inline bool hasJsonContentType(const drogon::HttpRequestPtr& req) {
    const auto contentType = req->getHeader("Content-Type");
    constexpr std::string_view expected = "application/json";
    return contentType.size() >= expected.size() &&
           contentType.compare(0, expected.size(), expected) == 0;
}

inline bool requireJsonPostAccess(
    const drogon::HttpRequestPtr& req,
    const std::function<void(const drogon::HttpResponsePtr&)>& cb) {
    const auto origin = req->getHeader("Origin");
    if (origin != allowedOrigin()) {
        cb(json("{\"error\":\"forbidden origin\"}", drogon::k403Forbidden));
        return false;
    }

    if (!hasJsonContentType(req)) {
        cb(json("{\"error\":\"content type must be application/json\"}",
                drogon::k415UnsupportedMediaType));
        return false;
    }

    return true;
}

inline bool requireMutationAccess(
    const drogon::HttpRequestPtr& req,
    const std::function<void(const drogon::HttpResponsePtr&)>& cb) {
    if (!requireJsonPostAccess(req, cb)) return false;

    const auto& token = mutationToken();
    if (!token.empty() && req->getHeader("X-Simulation-Token") != token) {
        cb(json("{\"error\":\"unauthorized\"}", drogon::k401Unauthorized));
        return false;
    }

    return true;
}

}  // namespace Security
