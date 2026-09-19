#include "WeatherProxy.h"
#include "Security.h"
#include <drogon/drogon.h>
#include <cstdlib>
#include <cmath>
#include <algorithm>
#include <sstream>

namespace {

const drogon::HttpClientPtr& owmClient() {
    static const auto client =
        drogon::HttpClient::newHttpClient("https://api.openweathermap.org");
    return client;
}

RateLimiter& proxyUpstreamLimiter() {
    // Cached responses do not consume this budget. This caps aggregate work
    // across source IPs and protects the shared upstream API allowance.
    static RateLimiter limiter(40.0, 10.0);
    return limiter;
}

}  // namespace

// ── Static members ────────────────────────────────────────────────────────────
std::mutex WeatherProxy::cacheMtx_;
std::unordered_map<std::string, CacheEntry> WeatherProxy::cache_;

const std::string& WeatherProxy::apiKey() {
    static std::string key = []() -> std::string {
        const char* k = std::getenv("OPENWEATHER_API_KEY");
        return k ? k : "";
    }();
    return key;
}

// ── Cache helpers ─────────────────────────────────────────────────────────────
std::string WeatherProxy::cacheGet(const std::string& key) {
    std::lock_guard<std::mutex> lk(cacheMtx_);
    auto it = cache_.find(key);
    if (it == cache_.end()) return {};
    if (std::chrono::steady_clock::now() > it->second.expires) {
        cache_.erase(it);
        return {};
    }
    return it->second.body;
}

void WeatherProxy::cachePut(const std::string& key, std::string body, int ttlSeconds) {
    std::lock_guard<std::mutex> lk(cacheMtx_);
    const auto now = std::chrono::steady_clock::now();
    for (auto it = cache_.begin(); it != cache_.end();) {
        if (it->second.expires <= now) it = cache_.erase(it);
        else ++it;
    }

    if (cache_.find(key) == cache_.end() && cache_.size() >= MAX_CACHE_ENTRIES) {
        const auto oldest = std::min_element(
            cache_.begin(), cache_.end(),
            [](const auto& lhs, const auto& rhs) {
                return lhs.second.expires < rhs.second.expires;
            });
        if (oldest != cache_.end()) cache_.erase(oldest);
    }
    cache_[key] = {
        std::move(body),
        now + std::chrono::seconds(ttlSeconds)
    };
}

// ── Response helpers ──────────────────────────────────────────────────────────
drogon::HttpResponsePtr WeatherProxy::corsJson(const std::string& body,
                                                drogon::HttpStatusCode code) {
    return Security::json(body, code, "GET, OPTIONS");
}

drogon::HttpResponsePtr WeatherProxy::errorResp(const std::string& msg,
                                                  drogon::HttpStatusCode code) {
    return corsJson("{\"error\":\"" + msg + "\"}", code);
}

// ── GET /api/weather/realtime?lat=&lon= ───────────────────────────────────────
void WeatherProxy::realtime(
    const drogon::HttpRequestPtr& req,
    std::function<void(const drogon::HttpResponsePtr&)>&& cb)
{
    // OPTIONS preflight
    if (req->method() == drogon::Options) { cb(corsJson("{}")); return; }

    auto latStr = req->getParameter("lat");
    auto lonStr = req->getParameter("lon");
    if (latStr.empty() || lonStr.empty()) {
        cb(errorResp("lat and lon required", drogon::k400BadRequest)); return;
    }

    double lat = 0.0, lon = 0.0;
    if (!Security::parseFiniteDouble(latStr, lat) ||
        !Security::parseFiniteDouble(lonStr, lon)) {
        cb(errorResp("invalid lat/lon", drogon::k400BadRequest)); return;
    }

    if (!Security::finiteInRange(lat, -90.0, 90.0) ||
        !Security::finiteInRange(lon, -180.0, 180.0)) {
        cb(errorResp("lat/lon out of range", drogon::k400BadRequest)); return;
    }

    // Round to 2 decimals for cache key
    std::ostringstream ck;
    ck << "rt:" << std::fixed;
    ck.precision(2);
    ck << lat << "," << lon;
    std::string cacheKey = ck.str();

    if (auto cached = cacheGet(cacheKey); !cached.empty()) {
        cb(corsJson(cached)); return;
    }

    const auto& key = apiKey();
    if (key.empty()) {
        cb(errorResp("API key not configured", drogon::k503ServiceUnavailable)); return;
    }
    if (!proxyUpstreamLimiter().allow()) {
        cb(errorResp("upstream rate limited", drogon::k429TooManyRequests)); return;
    }

    // Build OWM URL
    std::ostringstream url;
    url << "/data/2.5/weather?lat=" << lat << "&lon=" << lon
        << "&appid=" << key << "&units=metric";

    auto owmReq = drogon::HttpRequest::newHttpRequest();
    owmReq->setMethod(drogon::Get);
    owmReq->setPath(url.str());

    owmClient()->sendRequest(owmReq, [cb, cacheKey](drogon::ReqResult res,
                                                const drogon::HttpResponsePtr& resp) {
        if (res != drogon::ReqResult::Ok || !resp || resp->statusCode() != drogon::k200OK) {
            cb(corsJson("{\"error\":\"upstream_failed\"}", drogon::k502BadGateway)); return;
        }
        if (resp->body().size() > 128 * 1024) {
            cb(corsJson("{\"error\":\"upstream_response_too_large\"}",
                        drogon::k502BadGateway));
            return;
        }
        std::string body = std::string(resp->body());
        cachePut(cacheKey, body, 300);
        cb(corsJson(body));
    }, 8.0);  // 8s timeout
}

// ── GET /api/weather/search?q= ────────────────────────────────────────────────
void WeatherProxy::search(
    const drogon::HttpRequestPtr& req,
    std::function<void(const drogon::HttpResponsePtr&)>&& cb)
{
    if (req->method() == drogon::Options) { cb(corsJson("{}")); return; }

    auto q = req->getParameter("q");
    if (q.size() < 2 || q.size() > 100) {
        cb(errorResp("query must be 2–100 chars", drogon::k400BadRequest)); return;
    }

    // Sanitise: remove characters that could break URL
    std::string safe;
    for (char c : q)
        if (std::isalnum((unsigned char)c) || c == ' ' || c == ',' || c == '-')
            safe += c;
    if (safe.empty()) {
        cb(errorResp("invalid query", drogon::k400BadRequest)); return;
    }

    std::string cacheKey = "geo:" + safe;
    if (auto cached = cacheGet(cacheKey); !cached.empty()) {
        cb(corsJson(cached)); return;
    }

    const auto& key = apiKey();
    if (key.empty()) {
        cb(errorResp("API key not configured", drogon::k503ServiceUnavailable)); return;
    }
    if (!proxyUpstreamLimiter().allow()) {
        cb(errorResp("upstream rate limited", drogon::k429TooManyRequests)); return;
    }

    // URL-encode spaces as +
    std::string encoded;
    for (char c : safe) encoded += (c == ' ') ? '+' : c;

    std::string path = "/geo/1.0/direct?q=" + encoded + "&limit=5&appid=" + key;

    auto owmReq = drogon::HttpRequest::newHttpRequest();
    owmReq->setMethod(drogon::Get);
    owmReq->setPath(path);

    owmClient()->sendRequest(owmReq, [cb, cacheKey](drogon::ReqResult res,
                                                const drogon::HttpResponsePtr& resp) {
        if (res != drogon::ReqResult::Ok || !resp || resp->statusCode() != drogon::k200OK) {
            cb(corsJson("{\"error\":\"upstream_failed\"}", drogon::k502BadGateway)); return;
        }
        if (resp->body().size() > 128 * 1024) {
            cb(corsJson("{\"error\":\"upstream_response_too_large\"}",
                        drogon::k502BadGateway));
            return;
        }
        std::string body = std::string(resp->body());
        cachePut(cacheKey, body, 300);
        cb(corsJson(body));
    }, 8.0);
}
