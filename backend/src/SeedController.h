#pragma once
#include <drogon/drogon.h>
#include "WeatherSim.h"

class SeedController : public drogon::HttpController<SeedController> {
public:
    METHOD_LIST_BEGIN
        ADD_METHOD_TO(SeedController::seedWeather,   "/api/weather/seed",      drogon::Get, drogon::Options);
        ADD_METHOD_TO(SeedController::getLocations,  "/api/weather/locations", drogon::Get, drogon::Options);
        ADD_METHOD_TO(SeedController::setSpeed,      "/api/weather/speed",     drogon::Get, drogon::Options);
    METHOD_LIST_END

    // GET /api/weather/seed?lat=44.4&lon=26.1
    void seedWeather(const drogon::HttpRequestPtr& req,
                     std::function<void(const drogon::HttpResponsePtr&)>&& cb);

    // GET /api/weather/locations
    void getLocations(const drogon::HttpRequestPtr& req,
                      std::function<void(const drogon::HttpResponsePtr&)>&& cb);

    // GET /api/weather/speed?value=5
    void setSpeed(const drogon::HttpRequestPtr& req,
                  std::function<void(const drogon::HttpResponsePtr&)>&& cb);
};
