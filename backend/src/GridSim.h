#pragma once
#include <array>
#include <atomic>
#include <mutex>
#include <string>
#include <thread>

class GridSim {
public:
    static constexpr int ROWS = 18;   // latitudes: -85° to +85° step 10°
    static constexpr int COLS = 36;   // longitudes: -175° to +175° step 10°
    static constexpr int SIZE = ROWS * COLS;

    struct Cell {
        float T = 0;   // temperature °C
        float P = 0;   // pressure hPa
        float U = 0;   // wind east component m/s
        float V = 0;   // wind north component m/s
        float H = 0;   // relative humidity [0,1]
        float R = 0;   // precipitation mm/h
    };

    static GridSim& instance();

    void start();
    void stop();
    void setSpeed(float s);
    float speed() const { return speed_.load(); }

    // Thread-safe JSON snapshot of the full grid
    std::string getStateJson() const;

    // Thread-safe copy of grid (for tests)
    std::array<Cell, SIZE> getGrid() const;
    long long tick() const { return tick_.load(); }

    // Grid geometry helpers (public for tests)
    float cellLat(int r) const { return -85.0f + r * 10.0f; }
    float cellLon(int c) const { return -175.0f + c * 10.0f; }
    int   idx(int r, int c)    const { return r * COLS + c; }
    int   wrapC(int c)         const { return (c + COLS) % COLS; }
    int   clampR(int r)        const { return r < 0 ? 0 : (r >= ROWS ? ROWS - 1 : r); }

private:
    GridSim();
    ~GridSim();

    void loop();
    void step(float dt);
    void initGrid();

    std::array<Cell, SIZE> grid_;
    mutable std::mutex     mutex_;

    std::thread            thread_;
    std::atomic<bool>      running_{false};
    std::atomic<float>     speed_{1.0f};
    std::atomic<long long> tick_{0};

    float simTime_{0.0f};  // accumulated simulation time in seconds
};
