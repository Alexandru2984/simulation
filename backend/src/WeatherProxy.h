#pragma once
#include <drogon/HttpController.h>
#include <string>
#include <unordered_map>
#include <mutex>
#include <chrono>

// Caches a single string payload with a TTL
struct CacheEntry {
    std::string body;
    std::chrono::steady_clock::time_point expires;
};

class WeatherProxy : public drogon::HttpController<WeatherProxy> {
public:
    METHOD_LIST_BEGIN
        ADD_METHOD_TO(WeatherProxy::realtime, "/api/weather/realtime", drogon::Get, drogon::Options);
        ADD_METHOD_TO(WeatherProxy::search,   "/api/weather/search",   drogon::Get, drogon::Options);
    METHOD_LIST_END

    // GET /api/weather/realtime?lat=&lon=
    void realtime(const drogon::HttpRequestPtr&,
                  std::function<void(const drogon::HttpResponsePtr&)>&&);

    // GET /api/weather/search?q=
    void search(const drogon::HttpRequestPtr&,
                std::function<void(const drogon::HttpResponsePtr&)>&&);

    static const std::string& apiKey();

private:
    // 5-minute in-process cache with a hard entry cap. The keys include user
    // input, so leaving this map unbounded would permit memory exhaustion.
    static constexpr std::size_t MAX_CACHE_ENTRIES = 256;
    static std::mutex               cacheMtx_;
    static std::unordered_map<std::string, CacheEntry> cache_;

    static std::string cacheGet(const std::string& key);
    static void        cachePut(const std::string& key, std::string body,
                                int ttlSeconds = 300);

    static drogon::HttpResponsePtr corsJson(const std::string& body,
                                            drogon::HttpStatusCode code = drogon::k200OK);
    static drogon::HttpResponsePtr errorResp(const std::string& msg,
                                             drogon::HttpStatusCode code = drogon::k500InternalServerError);
};
