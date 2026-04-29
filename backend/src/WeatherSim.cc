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

void WeatherSim::seed(double temp, double pressure, double wind_speed, double wind_dir) {
    double rad = wind_dir * M_PI / 180.0;
    std::lock_guard<std::mutex> lk(mtx_);
    seedTemp_    = temp;
    state_.temperature    = temp;
    state_.pressure       = pressure;
    state_.wind_speed     = wind_speed;
    state_.wind_direction = wind_dir;
    vx_ = wind_speed * std::cos(rad);
    vy_ = wind_speed * std::sin(rad);
    // Align sinusoidal phase so next tick continues naturally from seed temp
    double ratio = std::max(-1.0, std::min(1.0, (temp - T_BASE) / T_AMP));
    tick_ = static_cast<long long>(T_PERIOD * std::asin(ratio) / (2.0 * M_PI));
}

void WeatherSim::setSpeed(double multiplier) {
    speed_.store(std::max(0.1, std::min(50.0, multiplier)));
}

void WeatherSim::loop() {
    using namespace std::chrono;
    auto next = steady_clock::now();

    while (running_.load()) {
        next += seconds(1);

        // --- Temperature: sinusoidal around seed base + noise ---
        double t = static_cast<double>(tick_);
        double base = seedTemp_;
        double temp = base
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
        // Advance by speed multiplier (extra ticks per second)
        long long extra = static_cast<long long>(speed_.load()) - 1;
        tick_ += extra;
        std::this_thread::sleep_until(next);
    }
}
