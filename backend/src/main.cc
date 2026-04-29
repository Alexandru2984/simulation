#include <drogon/drogon.h>
#include "WeatherSim.h"
#include "WeatherController.h"
#include "SeedController.h"
#include "GridSim.h"
#include "GridController.h"
#include "WeatherProxy.h"

void broadcastWeather();

// 20 cities spread across the globe for data assimilation
static const struct { float lat, lon; } ASSIM_CITIES[] = {
    {51.5f, -0.1f},   {40.7f, -74.0f},  {35.7f, 139.7f},  {-33.9f, 151.2f},
    {48.9f, 2.3f},    {55.8f, 37.6f},   {19.1f, 72.9f},   {-23.5f, -46.6f},
    {1.3f,  103.8f},  {30.1f, 31.2f},   {-26.2f, 28.0f},  {64.1f, -21.9f},
    {25.2f, 55.3f},   {41.0f, 28.9f},   {-34.6f, -58.4f}, {59.9f, 10.7f},
    {45.5f, -73.6f},  {31.2f, 121.5f},  {-4.3f, 15.3f},   {-33.5f, -70.6f},
};

static void scheduleAssimilation() {
    // Fetch OWM for each city and nudge the GridSim
    const auto& key = WeatherProxy::apiKey();
    if (key.empty()) return;

    for (auto& city : ASSIM_CITIES) {
        std::ostringstream path;
        path << "/data/2.5/weather?lat=" << city.lat << "&lon=" << city.lon
             << "&appid=" << key << "&units=metric";

        auto client = drogon::HttpClient::newHttpClient("http://api.openweathermap.org");
        auto req    = drogon::HttpRequest::newHttpRequest();
        req->setMethod(drogon::Get);
        req->setPath(path.str());

        float capLat = city.lat, capLon = city.lon;
        client->sendRequest(req, [capLat, capLon](
                drogon::ReqResult res, const drogon::HttpResponsePtr& resp) {
            if (res != drogon::ReqResult::Ok || !resp || resp->statusCode() != drogon::k200OK)
                return;
            try {
                auto j = drogon::utils::fromString<Json::Value>(std::string(resp->body()));
                float T = j["main"]["temp"].asFloat();
                float P = j["main"]["pressure"].asFloat();
                float H = j["main"]["humidity"].asFloat() / 100.0f;
                float U = j["wind"]["speed"].asFloat()
                          * std::cos((j["wind"]["deg"].asFloat() - 180.0f) * 3.14159f / 180.0f);
                float V = j["wind"]["speed"].asFloat()
                          * std::sin((j["wind"]["deg"].asFloat() - 180.0f) * 3.14159f / 180.0f);
                GridSim::instance().assimilate(capLat, capLon, T, P, U, V, H);
            } catch (...) {}
        }, 10.0);
    }
}

int main() {
    WeatherSim::instance().start();
    GridSim::instance().start();

    auto& app = drogon::app();
    app.setLogPath("/home/micu/simulation/logs")
       .setLogLevel(trantor::Logger::kWarn)
       .addListener("127.0.0.1", 8094)
       .setThreadNum(4)
       .setClientMaxBodySize(1024 * 1024);

    app.getLoop()->runEvery(1.0, []() { broadcastWeather(); });
    app.getLoop()->runEvery(1.0, []() { GridWsController::broadcastGrid(); });
    // Data assimilation: nudge grid toward real OWM observations every 5 minutes
    app.getLoop()->runEvery(300.0, []() { scheduleAssimilation(); });
    // Also run once at startup (after a short delay)
    app.getLoop()->runAfter(5.0, []() { scheduleAssimilation(); });

    LOG_INFO << "Weather Simulation Backend starting on 127.0.0.1:8094";
    app.run();

    WeatherSim::instance().stop();
    GridSim::instance().stop();
    return 0;
}
