#include "HealthController.h"
#include "GridSim.h"
#include "Security.h"
#include "WeatherSim.h"
#include <chrono>
#include <cstdio>

namespace {

const auto START_TIME = std::chrono::steady_clock::now();

long long uptimeSeconds() {
    return std::chrono::duration_cast<std::chrono::seconds>(
        std::chrono::steady_clock::now() - START_TIME).count();
}

}  // namespace

void HealthController::healthz(
    const drogon::HttpRequestPtr&,
    std::function<void(const drogon::HttpResponsePtr&)>&& cb) const
{
    char body[160];
    std::snprintf(body, sizeof(body),
        "{\"status\":\"ok\",\"service\":\"weather_backend\",\"uptimeSeconds\":%lld}",
        uptimeSeconds());
    cb(Security::json(body, drogon::k200OK, "GET, OPTIONS"));
}

void HealthController::readyz(
    const drogon::HttpRequestPtr&,
    std::function<void(const drogon::HttpResponsePtr&)>&& cb) const
{
    const auto gridTick = GridSim::instance().tick();
    const auto weather = WeatherSim::instance().current();
    const bool ready = gridTick > 0 && weather.timestamp > 0;

    char body[240];
    std::snprintf(body, sizeof(body),
        "{\"status\":\"%s\",\"gridTick\":%lld,\"weatherTimestamp\":%lld,\"uptimeSeconds\":%lld}",
        ready ? "ready" : "starting",
        (long long)gridTick,
        weather.timestamp,
        uptimeSeconds());

    cb(Security::json(body, ready ? drogon::k200OK : drogon::k503ServiceUnavailable,
                      "GET, OPTIONS"));
}
