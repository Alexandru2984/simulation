#pragma once
#include <array>
#include <atomic>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

class GridSim {
public:
    static constexpr int ROWS = 18;
    static constexpr int COLS = 36;
    static constexpr int SIZE = ROWS * COLS;

    struct Cell {
        float T = 0;   // temperature °C
        float P = 0;   // pressure hPa
        float U = 0;   // wind east component m/s
        float V = 0;   // wind north component m/s
        float H = 0;   // relative humidity [0,1]
        float R = 0;   // precipitation mm/h
    };

    // Pending nudge accumulated from data assimilation
    struct Nudge {
        float T = 0, P = 0, U = 0, V = 0, H = 0;
        float weight = 0;  // total Gaussian weight applied
    };

    static GridSim& instance();

    void start();
    void stop();
    void setSpeed(float s);
    float speed() const { return speed_.load(); }

    std::string getStateJson() const;
    std::array<Cell, SIZE> getGrid() const;
    long long tick() const { return tick_.load(); }

    // Data assimilation: nudge the grid toward an observation at (lat, lon).
    // Uses a Gaussian stencil (radius 2 cells) so no sharp discontinuities.
    // Thread-safe — can be called from any thread.
    void assimilate(float lat, float lon,
                    float T, float P, float U, float V, float H);

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
    void drainNudges();   // apply pending nudges smoothly into the grid

    std::array<Cell, SIZE>  grid_;
    std::array<Nudge, SIZE> nudge_;  // accumulated observations waiting to be drained
    mutable std::mutex      mutex_;

    std::thread            thread_;
    std::atomic<bool>      running_{false};
    std::atomic<float>     speed_{1.0f};
    std::atomic<long long> tick_{0};

    float simTime_{0.0f};
};

