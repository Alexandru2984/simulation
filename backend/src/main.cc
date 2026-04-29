#include <drogon/drogon.h>
#include "WeatherSim.h"
#include "WeatherController.h"
#include "SeedController.h"

// Forward declaration from WeatherController.cc
void broadcastWeather();

int main() {
    // Start the weather simulation thread
    WeatherSim::instance().start();

    auto& app = drogon::app();

    app.setLogPath("/home/micu/simulation/logs")
       .setLogLevel(trantor::Logger::kWarn)
       .addListener("127.0.0.1", 8094)
       .setThreadNum(4)
       .setClientMaxBodySize(1024 * 1024);

    // Broadcast weather state to all WebSocket clients every second
    app.getLoop()->runEvery(1.0, []() {
        broadcastWeather();
    });

    LOG_INFO << "Weather Simulation Backend starting on 127.0.0.1:8094";
    app.run();

    WeatherSim::instance().stop();
    return 0;
}
