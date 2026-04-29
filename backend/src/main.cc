#include <drogon/drogon.h>
#include "WeatherSim.h"
#include "WeatherController.h"
#include "SeedController.h"
#include "GridSim.h"
#include "GridController.h"

void broadcastWeather();

int main() {
    WeatherSim::instance().start();
    GridSim::instance().start();

    auto& app = drogon::app();

    app.setLogPath("/home/micu/simulation/logs")
       .setLogLevel(trantor::Logger::kWarn)
       .addListener("127.0.0.1", 8094)
       .setThreadNum(4)
       .setClientMaxBodySize(1024 * 1024);

    // Broadcast single-point weather every second
    app.getLoop()->runEvery(1.0, []() {
        broadcastWeather();
    });

    // Broadcast full grid every second
    app.getLoop()->runEvery(1.0, []() {
        GridWsController::broadcastGrid();
    });

    LOG_INFO << "Weather Simulation Backend starting on 127.0.0.1:8094";
    app.run();

    WeatherSim::instance().stop();
    GridSim::instance().stop();
    return 0;
}
