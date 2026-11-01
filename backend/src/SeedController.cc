#include "SeedController.h"
#include "GridSim.h"
#include "OpenWeatherClient.h"
#include "OpenWeatherObservation.h"
#include "OpenWeatherResponse.h"
#include "Security.h"
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

static void corsHeaders(const drogon::HttpResponsePtr& r) {
    Security::addCorsHeaders(r);
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
    // Global budget on top of nginx's per-IP limits
    static RateLimiter seedLimiter(120.0, 20.0);
    if (!Security::requireMutationAccess(req, cb, &seedLimiter)) return;

    auto j = req->jsonObject();
    if (!j) {
        cb(Security::error(drogon::k400BadRequest, "invalid_json"));
        return;
    }
    if (!(*j).isMember("lat") || !(*j).isMember("lon")) {
        cb(Security::error(drogon::k400BadRequest, "missing_fields", "lat and lon are required"));
        return;
    }
    if (!(*j)["lat"].isNumeric() || !(*j)["lon"].isNumeric()) {
        cb(Security::error(drogon::k400BadRequest, "invalid_type", "lat and lon must be numbers"));
        return;
    }

    double lat = (*j)["lat"].asDouble();
    double lon = (*j)["lon"].asDouble();
    if (!Security::finiteInRange(lat, -90.0, 90.0) ||
        !Security::finiteInRange(lon, -180.0, 180.0)) {
        cb(Security::error(drogon::k400BadRequest, "lat_lon_out_of_range"));
        return;
    }

    auto fallbackResponse = [lat, lon](bool triedApi) {
        const CityPreset* p = nearestPreset(lat, lon);
        WeatherSim::instance().seed(p->temp, p->pressure, p->wind_speed, p->wind_dir);

        Json::Value out;
        out["status"]        = "ok";
        out["source"]        = triedApi ? "fallback_after_api_error" : "fallback_preset";
        out["city"]          = p->name;
        out["temperature"]   = p->temp;
        out["pressure"]      = p->pressure;
        out["wind_speed"]    = p->wind_speed;
        out["wind_direction"]= p->wind_dir;
        auto resp = drogon::HttpResponse::newHttpJsonResponse(out);
        corsHeaders(resp);
        return resp;
    };

    if (OpenWeather::apiKey().empty()) {
        cb(fallbackResponse(false));
        return;
    }

    // Same gateway as the realtime popup: one cache entry per ~1 km cell and a
    // shared upstream budget, so seeding cannot exhaust the API key's quota.
    OpenWeather::fetchRealtime(lat, lon,
        [cb = std::move(cb), fallbackResponse](OpenWeather::FetchStatus status,
                                               const std::string& body) {
            Json::Value json;
            OpenWeatherObservation observation;
            if (status == OpenWeather::FetchStatus::Ok &&
                OpenWeatherResponse::parseJson(body, json) &&
                parseOpenWeatherObservation(json, observation)) {
                WeatherSim::instance().seed(observation.temperature,
                                            observation.pressure,
                                            observation.windSpeed,
                                            observation.windDirection);

                Json::Value out;
                out["status"]         = "ok";
                out["source"]         = "openweather";
                out["city"]           = observation.city;
                out["temperature"]    = observation.temperature;
                out["pressure"]       = observation.pressure;
                out["wind_speed"]     = observation.windSpeed;
                out["wind_direction"] = observation.windDirection;
                auto resp = drogon::HttpResponse::newHttpJsonResponse(out);
                corsHeaders(resp);
                cb(resp);
                return;
            }
            cb(fallbackResponse(true));
        });
}

// ── /api/weather/locations ────────────────────────────────────────────────────

void SeedController::getLocations(
    const drogon::HttpRequestPtr&,
    std::function<void(const drogon::HttpResponsePtr&)>&& cb)
{
    Json::Value list(Json::arrayValue);
    for (int i = 0; i < N_PRESETS; ++i)
        list.append(presetJson(PRESETS[i]));

    Json::Value out;
    out["locations"] = list;
    auto resp = drogon::HttpResponse::newHttpJsonResponse(out);
    corsHeaders(resp);
    resp->addHeader("Cache-Control", "public, max-age=3600");  // static presets
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
    // Speed changes are global for every viewer — keep the budget tight
    static RateLimiter speedLimiter(20.0, 6.0);
    if (!Security::requireMutationAccess(req, cb, &speedLimiter)) return;

    auto j = req->jsonObject();
    if (!j) {
        cb(Security::error(drogon::k400BadRequest, "invalid_json"));
        return;
    }
    if (!(*j).isMember("value")) {
        cb(Security::error(drogon::k400BadRequest, "missing_fields", "value is required"));
        return;
    }
    if (!(*j)["value"].isNumeric()) {
        cb(Security::error(drogon::k400BadRequest, "invalid_type", "value must be a number"));
        return;
    }

    double value = (*j)["value"].asDouble();
    if (!Security::finiteInRange(value, 0.5, 50.0)) {
        cb(Security::error(drogon::k400BadRequest, "out_of_range",
                           "value must be between 0.5 and 50"));
        return;
    }

    // Drive both sims — the HUD readout and the grid the globe renders.
    // Keep both simulation engines on the same validated multiplier.
    WeatherSim::instance().setSpeed(value);
    GridSim::instance().setSpeed(static_cast<float>(value));

    Json::Value out;
    out["status"] = "ok";
    out["speed"]  = value;
    auto resp = drogon::HttpResponse::newHttpJsonResponse(out);
    corsHeaders(resp);
    cb(resp);
}
