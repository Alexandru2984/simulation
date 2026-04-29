#include "WeatherProxy.h"
#include <drogon/drogon.h>
#include <cstdlib>
#include <cmath>
#include <sstream>

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
    cache_[key] = {
        std::move(body),
        std::chrono::steady_clock::now() + std::chrono::seconds(ttlSeconds)
    };
}

// ── Response helpers ──────────────────────────────────────────────────────────
drogon::HttpResponsePtr WeatherProxy::corsJson(const std::string& body,
                                                drogon::HttpStatusCode code) {
    auto r = drogon::HttpResponse::newHttpResponse();
    r->setStatusCode(code);
    r->setContentTypeCode(drogon::CT_APPLICATION_JSON);
    r->addHeader("Access-Control-Allow-Origin",  "https://simulation.micutu.com");
    r->addHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    r->setBody(body);
    return r;
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

    float lat, lon;
    try { lat = std::stof(latStr); lon = std::stof(lonStr); }
    catch (...) { cb(errorResp("invalid lat/lon", drogon::k400BadRequest)); return; }

    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
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

    // Build OWM URL
    std::ostringstream url;
    url << "/data/2.5/weather?lat=" << lat << "&lon=" << lon
        << "&appid=" << key << "&units=metric";

    auto client = drogon::HttpClient::newHttpClient("http://api.openweathermap.org");
    auto owmReq = drogon::HttpRequest::newHttpRequest();
    owmReq->setMethod(drogon::Get);
    owmReq->setPath(url.str());

    client->sendRequest(owmReq, [cb, cacheKey](drogon::ReqResult res,
                                                const drogon::HttpResponsePtr& resp) {
        if (res != drogon::ReqResult::Ok || !resp || resp->statusCode() != drogon::k200OK) {
            cb(corsJson("{\"error\":\"upstream_failed\"}", drogon::k502BadGateway)); return;
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

    // URL-encode spaces as +
    std::string encoded;
    for (char c : safe) encoded += (c == ' ') ? '+' : c;

    std::string path = "/geo/1.0/direct?q=" + encoded + "&limit=5&appid=" + key;

    auto client = drogon::HttpClient::newHttpClient("http://api.openweathermap.org");
    auto owmReq = drogon::HttpRequest::newHttpRequest();
    owmReq->setMethod(drogon::Get);
    owmReq->setPath(path);

    client->sendRequest(owmReq, [cb, cacheKey](drogon::ReqResult res,
                                                const drogon::HttpResponsePtr& resp) {
        if (res != drogon::ReqResult::Ok || !resp || resp->statusCode() != drogon::k200OK) {
            cb(corsJson("{\"error\":\"upstream_failed\"}", drogon::k502BadGateway)); return;
        }
        std::string body = std::string(resp->body());
        cachePut(cacheKey, body, 300);
        cb(corsJson(body));
    }, 8.0);
}
