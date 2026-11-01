#include "OpenWeatherClient.h"

#include "OpenWeatherResponse.h"
#include "RateLimiter.h"
#include "Security.h"
#include "TtlCache.h"

#include <drogon/drogon.h>
#include <cstdio>
#include <cstdlib>

namespace OpenWeather {
namespace {

constexpr std::size_t MAX_UPSTREAM_BODY = 128 * 1024;
constexpr std::chrono::seconds CACHE_TTL{300};
constexpr double TIMEOUT_SECONDS = 8.0;

TtlCache& cache() {
    // Keys include user input; the cap bounds memory regardless of traffic.
    static TtlCache instance(512);
    return instance;
}

using Normalizer = bool (*)(const std::string&, std::string&);

void fetchCached(const std::string& cacheKey, const std::string& pathAndQuery,
                 Normalizer normalize, FetchCallback cb) {
    if (auto cached = cache().get(cacheKey)) {
        cb(FetchStatus::Ok, *cached);
        return;
    }
    if (apiKey().empty()) {
        cb(FetchStatus::NotConfigured, {});
        return;
    }
    if (!userBudget().allow()) {
        cb(FetchStatus::RateLimited, {});
        return;
    }

    auto req = drogon::HttpRequest::newHttpRequest();
    req->setMethod(drogon::Get);
    // The path is pre-encoded here; Drogon must send it verbatim.
    req->setPathEncode(false);
    req->setPath(pathAndQuery + "&appid=" + Security::percentEncode(apiKey()));

    client()->sendRequest(
        req,
        [cacheKey, normalize, cb = std::move(cb)](drogon::ReqResult result,
                                                   const drogon::HttpResponsePtr& resp) {
            if (result != drogon::ReqResult::Ok || !resp ||
                resp->statusCode() != drogon::k200OK) {
                cb(FetchStatus::UpstreamFailed, {});
                return;
            }
            if (resp->body().size() > MAX_UPSTREAM_BODY) {
                cb(FetchStatus::TooLarge, {});
                return;
            }
            std::string normalized;
            if (!normalize(std::string(resp->body()), normalized)) {
                cb(FetchStatus::InvalidPayload, {});
                return;
            }
            cache().put(cacheKey, normalized, CACHE_TTL);
            cb(FetchStatus::Ok, normalized);
        },
        TIMEOUT_SECONDS);
}

}  // namespace

const std::string& apiKey() {
    static const std::string key = [] {
        const char* value = std::getenv("OPENWEATHER_API_KEY");
        std::string k = value ? value : "";
        if (k == "YOUR_KEY_HERE" || k == "change-me" || k == "changeme") k.clear();
        return k;
    }();
    return key;
}

const drogon::HttpClientPtr& client() {
    // OPENWEATHER_BASE_URL exists for integration tests against a local fake;
    // production leaves it unset.
    static const auto instance = [] {
        const char* base = std::getenv("OPENWEATHER_BASE_URL");
        return drogon::HttpClient::newHttpClient(
            base && *base ? base : "https://api.openweathermap.org");
    }();
    return instance;
}

RateLimiter& userBudget() {
    // OpenWeather's free tier allows 60 calls/minute in total; assimilation
    // uses 20 calls every 5 minutes, leaving headroom below the hard limit.
    static RateLimiter limiter(40.0, 10.0);
    return limiter;
}

std::string roundedCoordinate(double value) {
    char buf[32];
    std::snprintf(buf, sizeof(buf), "%.2f", value);
    // "-0.00" and "0.00" must share one cache entry.
    if (std::string_view(buf) == "-0.00") return "0.00";
    return buf;
}

void fetchRealtime(double lat, double lon, FetchCallback cb) {
    const std::string latStr = roundedCoordinate(lat);
    const std::string lonStr = roundedCoordinate(lon);
    fetchCached("rt:" + latStr + "," + lonStr,
                "/data/2.5/weather?lat=" + latStr + "&lon=" + lonStr + "&units=metric",
                &OpenWeatherResponse::normalizeRealtime, std::move(cb));
}

void fetchSearch(const std::string& normalizedQuery, FetchCallback cb) {
    fetchCached("geo:" + normalizedQuery,
                "/geo/1.0/direct?q=" + Security::percentEncode(normalizedQuery) +
                    "&limit=5",
                &OpenWeatherResponse::normalizeSearch, std::move(cb));
}

}  // namespace OpenWeather
