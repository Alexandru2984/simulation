#pragma once
#include <drogon/HttpController.h>
#include <string>

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

    // Kept for callers that only need to know whether a key is configured.
    static const std::string& apiKey();
};
