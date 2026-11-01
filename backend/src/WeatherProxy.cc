#include "WeatherProxy.h"
#include "OpenWeatherClient.h"
#include "Security.h"
#include <drogon/drogon.h>

namespace {

drogon::HttpResponsePtr corsJson(const std::string& body,
                                 drogon::HttpStatusCode code = drogon::k200OK) {
    auto resp = Security::json(body, code, "GET, OPTIONS");
    if (code == drogon::k200OK) {
        // Upstream answers are cached for 5 minutes server-side; let the
        // browser and Cloudflare reuse them briefly as well.
        resp->addHeader("Cache-Control", "public, max-age=120");
    } else {
        resp->addHeader("Cache-Control", "no-store");
    }
    return resp;
}

drogon::HttpResponsePtr errorResp(const char* code, drogon::HttpStatusCode status) {
    return corsJson(std::string("{\"error\":\"") + code + "\"}", status);
}

// Maps a gateway outcome to the public error contract.
drogon::HttpResponsePtr fetchResponse(OpenWeather::FetchStatus status,
                                      const std::string& body) {
    using OpenWeather::FetchStatus;
    switch (status) {
    case FetchStatus::Ok:             return corsJson(body);
    case FetchStatus::NotConfigured:  return errorResp("api_key_not_configured", drogon::k503ServiceUnavailable);
    case FetchStatus::RateLimited:    return errorResp("upstream_rate_limited", drogon::k429TooManyRequests);
    case FetchStatus::UpstreamFailed: return errorResp("upstream_failed", drogon::k502BadGateway);
    case FetchStatus::TooLarge:       return errorResp("upstream_response_too_large", drogon::k502BadGateway);
    case FetchStatus::InvalidPayload: return errorResp("upstream_invalid_payload", drogon::k502BadGateway);
    }
    return errorResp("upstream_failed", drogon::k502BadGateway);
}

}  // namespace

const std::string& WeatherProxy::apiKey() {
    return OpenWeather::apiKey();
}

// ── GET /api/weather/realtime?lat=&lon= ───────────────────────────────────────
void WeatherProxy::realtime(
    const drogon::HttpRequestPtr& req,
    std::function<void(const drogon::HttpResponsePtr&)>&& cb)
{
    if (req->method() == drogon::Options) { cb(corsJson("{}")); return; }

    const auto latStr = req->getParameter("lat");
    const auto lonStr = req->getParameter("lon");
    if (latStr.empty() || lonStr.empty()) {
        cb(errorResp("lat_and_lon_required", drogon::k400BadRequest));
        return;
    }

    double lat = 0.0, lon = 0.0;
    if (!Security::parseFiniteDouble(latStr, lat) ||
        !Security::parseFiniteDouble(lonStr, lon)) {
        cb(errorResp("invalid_lat_lon", drogon::k400BadRequest));
        return;
    }
    if (!Security::finiteInRange(lat, -90.0, 90.0) ||
        !Security::finiteInRange(lon, -180.0, 180.0)) {
        cb(errorResp("lat_lon_out_of_range", drogon::k400BadRequest));
        return;
    }

    OpenWeather::fetchRealtime(lat, lon,
        [cb = std::move(cb)](OpenWeather::FetchStatus status, const std::string& body) {
            cb(fetchResponse(status, body));
        });
}

// ── GET /api/weather/search?q= ────────────────────────────────────────────────
void WeatherProxy::search(
    const drogon::HttpRequestPtr& req,
    std::function<void(const drogon::HttpResponsePtr&)>&& cb)
{
    if (req->method() == drogon::Options) { cb(corsJson("{}")); return; }

    std::string query;
    if (!Security::normalizeSearchQuery(req->getParameter("q"), query)) {
        cb(errorResp("invalid_query", drogon::k400BadRequest));
        return;
    }

    OpenWeather::fetchSearch(query,
        [cb = std::move(cb)](OpenWeather::FetchStatus status, const std::string& body) {
            cb(fetchResponse(status, body));
        });
}
