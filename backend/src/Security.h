#pragma once

#include <drogon/drogon.h>
#include <charconv>
#include <cmath>
#include <cstdlib>
#include <functional>
#include <system_error>
#include <string>
#include <string_view>
#include "RateLimiter.h"

namespace Security {

// ── Pure checks (unit-testable without drogon request objects) ───────────────

// Strict origin check used for mutations: the header must equal the allowed
// origin exactly — absent or foreign origins are rejected.
inline bool originAllowed(std::string_view origin, std::string_view allowed) {
    return origin == allowed;
}

inline bool isJsonContentType(std::string_view contentType) {
    constexpr std::string_view expected = "application/json";
    const auto semicolon = contentType.find(';');
    auto mediaType = contentType.substr(0, semicolon);
    while (!mediaType.empty() && (mediaType.front() == ' ' || mediaType.front() == '\t'))
        mediaType.remove_prefix(1);
    while (!mediaType.empty() && (mediaType.back() == ' ' || mediaType.back() == '\t'))
        mediaType.remove_suffix(1);

    if (mediaType.size() != expected.size()) return false;
    for (std::size_t i = 0; i < expected.size(); ++i) {
        char c = mediaType[i];
        if (c >= 'A' && c <= 'Z') c = static_cast<char>(c - 'A' + 'a');
        if (c != expected[i]) return false;
    }
    return true;
}

inline bool finiteInRange(double value, double minimum, double maximum) {
    return std::isfinite(value) && value >= minimum && value <= maximum;
}

inline bool parseFiniteDouble(std::string_view input, double& value) {
    if (input.empty() || input.size() > 64) return false;
    const char* begin = input.data();
    const char* end = begin + input.size();
    const auto result = std::from_chars(begin, end, value, std::chars_format::general);
    return result.ec == std::errc{} && result.ptr == end && std::isfinite(value);
}

inline bool parseIntInRange(std::string_view input, int minimum, int maximum,
                            int& value) {
    if (input.empty() || input.size() > 16) return false;
    const char* begin = input.data();
    const char* end = begin + input.size();
    const auto result = std::from_chars(begin, end, value);
    return result.ec == std::errc{} && result.ptr == end &&
           value >= minimum && value <= maximum;
}

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
    return isJsonContentType(req->getHeader("Content-Type"));
}

inline bool requireJsonPostAccess(
    const drogon::HttpRequestPtr& req,
    const std::function<void(const drogon::HttpResponsePtr&)>& cb) {
    const auto origin = req->getHeader("Origin");
    if (!originAllowed(origin, allowedOrigin())) {
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
    const std::function<void(const drogon::HttpResponsePtr&)>& cb,
    RateLimiter* limiter = nullptr) {
    if (!requireJsonPostAccess(req, cb)) return false;

    const auto& token = mutationToken();
    if (!token.empty() && req->getHeader("X-Simulation-Token") != token) {
        cb(json("{\"error\":\"unauthorized\"}", drogon::k401Unauthorized));
        return false;
    }

    // Global budget checked last so rejected junk doesn't drain tokens
    if (limiter && !limiter->allow()) {
        cb(json("{\"error\":\"rate limited\"}", drogon::k429TooManyRequests));
        return false;
    }

    return true;
}

}  // namespace Security
