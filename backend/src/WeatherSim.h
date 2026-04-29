#pragma once
#include <atomic>
#include <mutex>
#include <random>
#include <cmath>
#include <ctime>
#include <thread>

struct WeatherState {
    double temperature;    // °C
    double pressure;       // hPa
    double wind_speed;     // m/s
    double wind_direction; // degrees [0, 360)
    long long timestamp;   // unix seconds
};

class WeatherSim {
public:
    static WeatherSim& instance();

    void start();
    void stop();

    WeatherState current() const;

    // Seed the simulation from real weather data (e.g. OpenWeather)
    void seed(double temp, double pressure, double wind_speed, double wind_dir);

    // Simulation speed multiplier (1x = real-time, 10x = 10s per tick)
    void setSpeed(double multiplier);

private:
    WeatherSim();
    ~WeatherSim();

    void loop();

    // Internal state
    mutable std::mutex mtx_;
    WeatherState state_{};
    std::atomic<bool> running_{false};
    std::thread thread_;

    // RNG
    mutable std::mt19937 rng_;
    std::normal_distribution<double> noise_{0.0, 0.5};
    std::uniform_real_distribution<double> wind_kick_{-2.0, 2.0};

    // Wind momentum
    double vx_{3.0}, vy_{2.0};

    // Simulation time counter (seconds)
    long long tick_{0};

    // Speed multiplier
    std::atomic<double> speed_{1.0};

    // Seed base (updated when seed() is called)
    double seedTemp_{T_BASE};

    static constexpr double T_BASE    = 20.0;
    static constexpr double T_AMP     = 10.0;
    static constexpr double T_PERIOD  = 3600.0; // 1 hour
    static constexpr double P_BASE    = 1013.25;
    static constexpr double P_K       = 0.12;
    static constexpr double WIND_MOM  = 0.95;
};
