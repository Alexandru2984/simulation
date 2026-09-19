// Unit tests for the point weather simulation
#include "WeatherSim.h"
#include "test_framework.h"
#include <chrono>
#include <cmath>
#include <thread>

TEST(seed_reflects_immediately) {
    auto& sim = WeatherSim::instance();
    sim.seed(25.0, 1002.0, 5.0, 90.0);
    auto s = sim.current();
    require(std::abs(s.temperature - 25.0) < 1e-9, "seed temperature must be visible");
    require(std::abs(s.pressure - 1002.0) < 1e-9, "seed pressure must be visible");
    require(std::abs(s.wind_speed - 5.0) < 1e-9, "seed wind speed must be visible");
    require(std::abs(s.wind_direction - 90.0) < 1e-9, "seed wind direction must be visible");
}

TEST(current_returns_independent_snapshot) {
    auto& sim = WeatherSim::instance();
    sim.seed(10.0, 1000.0, 3.0, 45.0);
    auto a = sim.current();
    sim.seed(20.0, 990.0, 6.0, 180.0);
    auto b = sim.current();
    require(std::abs(a.temperature - 10.0) < 1e-9, "first snapshot must keep its values");
    require(std::abs(b.temperature - 20.0) < 1e-9, "second snapshot must see the new seed");
}

TEST(speed_clamped_to_range) {
    auto& sim = WeatherSim::instance();
    sim.setSpeed(1000.0);
    require(std::abs(sim.speed() - 50.0) < 1e-9, "speed must clamp at 50x");
    sim.setSpeed(0.0001);
    require(std::abs(sim.speed() - 0.1) < 1e-9, "speed must clamp at 0.1x");
    sim.setSpeed(1.0);
}

TEST(fractional_speed_advances_model_time) {
    auto& sim = WeatherSim::instance();
    sim.stop();
    sim.seed(20.0, 1013.25, 3.0, 0.0);
    sim.setSpeed(0.5);
    const double before = sim.modelTime();

    sim.start();
    for (int i = 0; i < 100 && sim.modelTime() == before; ++i)
        std::this_thread::sleep_for(std::chrono::milliseconds(10));
    sim.stop();

    const double advanced = sim.modelTime() - before;
    require(advanced >= 0.5, "0.5x speed must advance model time");
    require(std::fmod(advanced, 0.5) < 1e-9,
            "fractional speed must not be rounded to whole ticks");
    sim.setSpeed(1.0);
}

TEST(loop_produces_fresh_state) {
    auto& sim = WeatherSim::instance();
    sim.start();
    long long ts = 0;
    for (int i = 0; i < 150 && ts == 0; i++) {
        ts = sim.current().timestamp;
        std::this_thread::sleep_for(std::chrono::milliseconds(20));
    }
    sim.stop();
    require(ts > 0, "running loop must stamp the state with a timestamp");
}

int main() {
    printf("\n=== WeatherSim Unit Tests ===\n\n");

    RUN(seed_reflects_immediately);
    RUN(current_returns_independent_snapshot);
    RUN(speed_clamped_to_range);
    RUN(fractional_speed_advances_model_time);
    RUN(loop_produces_fresh_state);   // keep last: starts/stops the sim thread

    printf("\n=== %d passed, %d failed ===\n\n", passed, failed);
    return failed > 0 ? 1 : 0;
}
