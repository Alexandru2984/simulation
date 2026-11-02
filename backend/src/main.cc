#include <drogon/drogon.h>
#include <cstdlib>
#include <filesystem>
#include <system_error>
#include "WeatherSim.h"
#include "WeatherController.h"
#include "SeedController.h"
#include "GridSim.h"
#include "GridController.h"
#include "OpenWeatherClient.h"
#include "SdNotify.h"
#include "Security.h"
#include "AssimilationStatus.h"
#include "OpenWeatherObservation.h"

void broadcastWeather();

// Snapshot locations. The systemd unit sets both variables to the project's
// state/ directory, the only one it makes writable. Without them, files go to
// state/ under the working directory: fine for a local run, and never the
// live state by accident. Startup warns when a default is in use.
static bool usingDefaultPath(const char* variable) {
    const char* env = std::getenv(variable);
    return !(env && *env);
}

static std::string absolutePath(const std::string& path) {
    std::error_code ec;
    const auto full = std::filesystem::absolute(path, ec);
    return ec ? path : full.string();
}

static const std::string& statePath() {
    static const std::string path = [] {
        const char* env = std::getenv("SIM_STATE_FILE");
        return std::string(env && *env ? env : "state/grid.snapshot");
    }();
    return path;
}

static const std::string& historyPath() {
    static const std::string path = [] {
        const char* env = std::getenv("SIM_HISTORY_FILE");
        return std::string(env && *env ? env : "state/history.snapshot");
    }();
    return path;
}

static int backendPort() {
    constexpr int fallback = 8094;
    const char* value = std::getenv("PORT_BACKEND");
    if (!value || !*value) return fallback;

    int port = fallback;
    if (!Security::parseIntInRange(value, 1, 65535, port)) {
        LOG_WARN << "Ignoring invalid PORT_BACKEND; using " << fallback;
        return fallback;
    }
    return port;
}

// 20 cities spread across the globe for data assimilation
static const struct { float lat, lon; } ASSIM_CITIES[] = {
    {51.5f, -0.1f},   {40.7f, -74.0f},  {35.7f, 139.7f},  {-33.9f, 151.2f},
    {48.9f, 2.3f},    {55.8f, 37.6f},   {19.1f, 72.9f},   {-23.5f, -46.6f},
    {1.3f,  103.8f},  {30.1f, 31.2f},   {-26.2f, 28.0f},  {64.1f, -21.9f},
    {25.2f, 55.3f},   {41.0f, 28.9f},   {-34.6f, -58.4f}, {59.9f, 10.7f},
    {45.5f, -73.6f},  {31.2f, 121.5f},  {-4.3f, 15.3f},   {-33.5f, -70.6f},
};

static void scheduleAssimilation() {
    // Fetch OWM for each city and nudge the GridSim. Assimilation is scheduled
    // (20 calls / 5 min), so it bypasses the user-facing upstream budget.
    const auto& key = OpenWeather::apiKey();
    if (key.empty()) return;
    AssimilationStatus::instance().markAttempt();

    const auto& client = OpenWeather::client();
    for (auto& city : ASSIM_CITIES) {
        auto req = drogon::HttpRequest::newHttpRequest();
        req->setMethod(drogon::Get);
        req->setPathEncode(false);
        req->setPath("/data/2.5/weather?lat=" + OpenWeather::roundedCoordinate(city.lat) +
                     "&lon=" + OpenWeather::roundedCoordinate(city.lon) +
                     "&units=metric&appid=" + Security::percentEncode(key));

        float capLat = city.lat, capLon = city.lon;
        client->sendRequest(req, [capLat, capLon](
                drogon::ReqResult res, const drogon::HttpResponsePtr& resp) {
            auto& status = AssimilationStatus::instance();
            if (res != drogon::ReqResult::Ok || !resp ||
                resp->statusCode() != drogon::k200OK) {
                status.recordUpstreamFailure();
                return;
            }
            if (resp->body().size() > 64 * 1024) {
                status.recordValidationFailure();
                return;
            }

            const auto json = resp->getJsonObject();
            OpenWeatherObservation observation;
            if (!json || !parseOpenWeatherObservation(*json, observation)) {
                status.recordValidationFailure();
                return;
            }

            float U = 0.0f, V = 0.0f;
            windComponents(observation.windSpeed, observation.windDirection, U, V);
            GridSim::instance().assimilate(
                capLat, capLon,
                static_cast<float>(observation.temperature),
                static_cast<float>(observation.pressure), U, V,
                static_cast<float>(observation.humidity / 100.0));
            status.recordAccepted();
        }, 10.0);
    }
}

// snake_case codes, matching the ones the handlers return.
static const char* frameworkErrorCode(drogon::HttpStatusCode code) {
    switch (code) {
        case drogon::k400BadRequest:           return "bad_request";
        case drogon::k403Forbidden:            return "forbidden";
        case drogon::k404NotFound:             return "not_found";
        case drogon::k405MethodNotAllowed:     return "method_not_allowed";
        case drogon::k413RequestEntityTooLarge: return "payload_too_large";
        case drogon::k414RequestURITooLarge:   return "uri_too_long";
        case drogon::k431RequestHeaderFieldsTooLarge: return "headers_too_large";
        default:                               return "http_error";
    }
}

static drogon::HttpResponsePtr jsonError(drogon::HttpStatusCode code) {
    auto resp = drogon::HttpResponse::newHttpResponse();
    resp->setStatusCode(code);
    resp->setContentTypeCode(drogon::CT_APPLICATION_JSON);
    resp->setBody(Security::errorBody(frameworkErrorCode(code)));
    return resp;
}

// Called every minute. Logs when saving starts failing and when it recovers,
// not on every attempt, so a read-only directory is visible without
// flooding the journal.
static void saveStatePeriodically() {
    static bool failing = false;
    const bool saved = GridSim::instance().saveState(statePath());
    if (saved == !failing) return;
    failing = !saved;
    if (failing)
        LOG_ERROR << "Cannot save the grid snapshot to " << absolutePath(statePath())
                  << "; state will be lost on restart until this is fixed (retrying every minute)";
    else
        LOG_WARN << "Grid snapshot saving works again: " << absolutePath(statePath());
}

int main() {
    for (const char* variable : {"SIM_STATE_FILE", "SIM_HISTORY_FILE"}) {
        if (usingDefaultPath(variable))
            LOG_WARN << variable << " is not set; using "
                     << absolutePath(std::string(variable) == "SIM_STATE_FILE" ? statePath() : historyPath());
    }
    if (GridSim::instance().loadState(statePath()))
        LOG_INFO << "Restored grid state from " << statePath();
    if (GridSim::instance().loadHistory(historyPath()))
        LOG_INFO << "Restored grid history from " << historyPath();

    WeatherSim::instance().start();
    GridSim::instance().start();

    auto& app = drogon::app();
    const int port = backendPort();
    app.setLogPath("")  // systemd captures stdout/stderr and owns rotation
       // PrivateTmp gives the service a writable, isolated upload directory.
       // Drogon prepares this tree even though this API has no file uploads.
       .setUploadPath("/tmp/simulation-uploads")
       .setLogLevel(trantor::Logger::kWarn)
       .addListener("127.0.0.1", port)
       .setThreadNum(4)
       .setClientMaxBodySize(64 * 1024)
       // Clients never send application messages. Keep control frames working
       // while preventing ignored messages from consuming 128 KiB each.
       .setClientMaxWebSocketMessageSize(4 * 1024)
       // Framework-generated errors are JSON like every handler's, and no
       // response advertises the framework name and version.
       .setCustom404Page(jsonError(drogon::k404NotFound))
       .setCustomErrorHandler([](drogon::HttpStatusCode code, const drogon::HttpRequestPtr&) {
           return jsonError(code);
       })
       .enableServerHeader(false);

    app.getLoop()->runEvery(1.0, []() { broadcastWeather(); });
    app.getLoop()->runEvery(1.0, []() { GridWsController::broadcastGrid(); });
    // Data assimilation: nudge grid toward real OWM observations every 5 minutes
    app.getLoop()->runEvery(300.0, []() { scheduleAssimilation(); });
    // Also run once at startup (after a short delay)
    app.getLoop()->runAfter(5.0, []() { scheduleAssimilation(); });
    // Persist grid state every minute so restarts resume where they left off
    app.getLoop()->runEvery(60.0, []() { saveStatePeriodically(); });

    // systemd supervision: signal readiness, then ping the watchdog from the
    // event loop — a hung loop stops the pings and systemd restarts us.
    app.registerBeginningAdvice([]() {
        SdNotify::ready();
        const double wd = SdNotify::watchdogIntervalSeconds();
        if (wd > 0.0) {
            drogon::app().getLoop()->runEvery(std::max(1.0, wd / 3.0),
                                              []() { SdNotify::watchdog(); });
        }
    });

    LOG_INFO << "Weather Simulation Backend starting on 127.0.0.1:" << port;
    app.run();

    WeatherSim::instance().stop();
    GridSim::instance().stop();
    if (!GridSim::instance().saveState(statePath()))
        LOG_ERROR << "Failed to save grid state to " << absolutePath(statePath());
    if (!GridSim::instance().saveHistory(historyPath()))
        LOG_ERROR << "Failed to save grid history to " << absolutePath(historyPath());
    return 0;
}
