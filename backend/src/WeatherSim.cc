#include "WeatherSim.h"
#include <chrono>
#include <cmath>

WeatherSim& WeatherSim::instance() {
    static WeatherSim inst;
    return inst;
}

WeatherSim::WeatherSim()
    : rng_(std::random_device{}()) {}

WeatherSim::~WeatherSim() {
    stop();
}

void WeatherSim::start() {
    if (running_.exchange(true)) return; // already running
    thread_ = std::thread([this]{ loop(); });
}

void WeatherSim::stop() {
    running_.store(false);
    if (thread_.joinable()) thread_.join();
}

WeatherState WeatherSim::current() const {
    std::lock_guard<std::mutex> lk(mtx_);
    return state_;
}

void WeatherSim::loop() {
    using namespace std::chrono;
    auto next = steady_clock::now();

    while (running_.load()) {
        next += seconds(1);

        // --- Temperature: sinusoidal + noise ---
        double t = static_cast<double>(tick_);
        double temp = T_BASE
                    + T_AMP * std::sin(2.0 * M_PI * t / T_PERIOD)
                    + noise_(rng_);

        // --- Pressure: inversely proportional to temperature deviation ---
        double pressure = P_BASE - P_K * (temp - T_BASE);

        // --- Wind: exponential moving average of random kicks ---
        vx_ = WIND_MOM * vx_ + (1.0 - WIND_MOM) * wind_kick_(rng_) * 10.0;
        vy_ = WIND_MOM * vy_ + (1.0 - WIND_MOM) * wind_kick_(rng_) * 10.0;

        double speed = std::sqrt(vx_ * vx_ + vy_ * vy_);
        double direction = std::atan2(vy_, vx_) * 180.0 / M_PI;
        if (direction < 0) direction += 360.0;

        long long ts = static_cast<long long>(
            std::chrono::duration_cast<std::chrono::seconds>(
                std::chrono::system_clock::now().time_since_epoch()).count());

        {
            std::lock_guard<std::mutex> lk(mtx_);
            state_ = { temp, pressure, speed, direction, ts };
        }

        ++tick_;
        std::this_thread::sleep_until(next);
    }
}
