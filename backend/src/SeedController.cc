#include "SeedController.h"
#include <drogon/HttpClient.h>
#include <cstdlib>
#include <cmath>

// ── Preset city data (fallback when OpenWeather is unavailable) ───────────────
struct CityPreset {
    const char* name;
    const char* country;
    double lat, lon;
    double temp, pressure, wind_speed, wind_dir;
};

static const CityPreset PRESETS[] = {
    {"Bucharest",     "RO",  44.43,  26.10,  18.0, 1015.0, 3.5,  90.0},
    {"London",        "GB",  51.51,  -0.13,  12.0, 1010.0, 5.0, 225.0},
    {"Tokyo",         "JP",  35.68, 139.70,  22.0, 1013.0, 2.5, 180.0},
    {"New York",      "US",  40.71, -74.01,  15.0, 1012.0, 4.0, 270.0},
    {"Sydney",        "AU", -33.87, 151.21,  25.0, 1018.0, 4.5,  45.0},
    {"Dubai",         "AE",  25.20,  55.27,  38.0, 1008.0, 7.0, 135.0},
    {"Moscow",        "RU",  55.75,  37.62,   5.0, 1020.0, 6.0, 315.0},
    {"Mumbai",        "IN",  19.08,  72.88,  32.0, 1006.0, 8.0,  60.0},
    {"Cape Town",     "ZA", -33.93,  18.42,  20.0, 1016.0, 9.0, 200.0},
    {"Buenos Aires",  "AR", -34.60, -58.38,  22.0, 1014.0, 4.0, 110.0},
    {"Reykjavik",     "IS",  64.13, -21.82,   3.0, 1005.0,10.0, 280.0},
    {"Singapore",     "SG",   1.29, 103.85,  30.0, 1010.0, 3.0,  30.0},
};
static const int N_PRESETS = sizeof(PRESETS) / sizeof(PRESETS[0]);

// ── Helpers ───────────────────────────────────────────────────────────────────

static const std::string ALLOWED_ORIGIN = "https://simulation.micutu.com";

static void corsHeaders(const drogon::HttpResponsePtr& r) {
    r->addHeader("Access-Control-Allow-Origin",  ALLOWED_ORIGIN);
    r->addHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
}

static const CityPreset* nearestPreset(double lat, double lon) {
    const CityPreset* best = &PRESETS[0];
    double bestDist = 1e18;
    for (int i = 0; i < N_PRESETS; ++i) {
        double dlat = PRESETS[i].lat - lat;
        double dlon = PRESETS[i].lon - lon;
        double d = dlat * dlat + dlon * dlon;
        if (d < bestDist) { bestDist = d; best = &PRESETS[i]; }
    }
    return best;
}

static Json::Value presetJson(const CityPreset& p) {
    Json::Value v;
    v["name"]          = p.name;
    v["country"]       = p.country;
    v["lat"]           = p.lat;
    v["lon"]           = p.lon;
    v["temperature"]   = p.temp;
    v["pressure"]      = p.pressure;
    v["wind_speed"]    = p.wind_speed;
    v["wind_direction"]= p.wind_dir;
    return v;
}

// ── /api/weather/seed ─────────────────────────────────────────────────────────

void SeedController::seedWeather(
    const drogon::HttpRequestPtr& req,
    std::function<void(const drogon::HttpResponsePtr&)>&& cb)
{
    if (req->method() == drogon::Options) {
        auto r = drogon::HttpResponse::newHttpResponse();
        corsHeaders(r);
        cb(r);
        return;
    }

    double lat = 44.43, lon = 26.10;
    auto j = req->jsonObject();
    if (j) {
        if ((*j).isMember("lat") && (*j)["lat"].isNumeric()) lat = (*j)["lat"].asDouble();
        if ((*j).isMember("lon") && (*j)["lon"].isNumeric()) lon = (*j)["lon"].asDouble();
    }
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
        auto r = drogon::HttpResponse::newHttpJsonResponse(Json::Value());
        r->setStatusCode(drogon::k400BadRequest);
        corsHeaders(r);
        cb(r);
        return;
    }

    const char* apiKey = std::getenv("OPENWEATHER_API_KEY");

    auto sendFallback = [=, cb = std::move(cb)](bool tried_api) mutable {
        const CityPreset* p = nearestPreset(lat, lon);
        WeatherSim::instance().seed(p->temp, p->pressure, p->wind_speed, p->wind_dir);

        Json::Value out;
        out["status"]        = "ok";
        out["source"]        = tried_api ? "fallback_after_api_error" : "fallback_preset";
        out["city"]          = p->name;
        out["temperature"]   = p->temp;
        out["pressure"]      = p->pressure;
        out["wind_speed"]    = p->wind_speed;
        out["wind_direction"]= p->wind_dir;
        auto resp = drogon::HttpResponse::newHttpJsonResponse(out);
        corsHeaders(resp);
        cb(resp);
    };

    if (!apiKey || std::string(apiKey).empty() || std::string(apiKey) == "YOUR_KEY_HERE") {
        sendFallback(false);
        return;
    }

    // Try OpenWeather API
    std::string latStr = std::to_string(lat);
    std::string lonStr = std::to_string(lon);
    std::string key(apiKey);

    auto client = drogon::HttpClient::newHttpClient("https://api.openweathermap.org");
    auto owReq  = drogon::HttpRequest::newHttpRequest();
    owReq->setPath("/data/2.5/weather");
    owReq->setParameter("lat",   latStr);
    owReq->setParameter("lon",   lonStr);
    owReq->setParameter("appid", key);
    owReq->setParameter("units", "metric");

    client->sendRequest(owReq, [lat, lon, cb = std::move(cb), sendFallback](
        drogon::ReqResult result, const drogon::HttpResponsePtr& owResp) mutable
    {
        if (result == drogon::ReqResult::Ok && owResp &&
            owResp->getStatusCode() == drogon::k200OK)
        {
            auto json = owResp->getJsonObject();
            if (json && (*json).isMember("main")) {
                double temp     = (*json)["main"]["temp"].asDouble();
                double pressure = (*json)["main"]["pressure"].asDouble();
                double wspeed   = (*json)["wind"]["speed"].asDouble();
                double wdir     = (*json)["wind"].isMember("deg") ?
                                  (*json)["wind"]["deg"].asDouble() : 0.0;
                std::string city= (*json)["name"].asString();

                WeatherSim::instance().seed(temp, pressure, wspeed, wdir);

                Json::Value out;
                out["status"]         = "ok";
                out["source"]         = "openweather";
                out["city"]           = city;
                out["temperature"]    = temp;
                out["pressure"]       = pressure;
                out["wind_speed"]     = wspeed;
                out["wind_direction"] = wdir;
                auto resp = drogon::HttpResponse::newHttpJsonResponse(out);
                corsHeaders(resp);
                cb(resp);
                return;
            }
        }
        // API error → fallback
        sendFallback(true);
    });
}

// ── /api/weather/locations ────────────────────────────────────────────────────

void SeedController::getLocations(
    const drogon::HttpRequestPtr& req,
    std::function<void(const drogon::HttpResponsePtr&)>&& cb)
{
    Json::Value list(Json::arrayValue);
    for (int i = 0; i < N_PRESETS; ++i)
        list.append(presetJson(PRESETS[i]));

    Json::Value out;
    out["locations"] = list;
    auto resp = drogon::HttpResponse::newHttpJsonResponse(out);
    corsHeaders(resp);
    cb(resp);
}

// ── /api/weather/speed ────────────────────────────────────────────────────────

void SeedController::setSpeed(
    const drogon::HttpRequestPtr& req,
    std::function<void(const drogon::HttpResponsePtr&)>&& cb)
{
    if (req->method() == drogon::Options) {
        auto r = drogon::HttpResponse::newHttpResponse();
        corsHeaders(r);
        cb(r);
        return;
    }

    double value = 1.0;
    auto j = req->jsonObject();
    if (j && (*j).isMember("value") && (*j)["value"].isNumeric()) {
        value = (*j)["value"].asDouble();
    }
    value = std::max(0.1, std::min(100.0, value));

    WeatherSim::instance().setSpeed(value);

    Json::Value out;
    out["status"] = "ok";
    out["speed"]  = value;
    auto resp = drogon::HttpResponse::newHttpJsonResponse(out);
    corsHeaders(resp);
    cb(resp);
}
