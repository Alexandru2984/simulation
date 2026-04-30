#pragma once
#include <array>
#include <atomic>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

class GridSim {
public:
    static constexpr int ROWS = 36;
    static constexpr int COLS = 72;
    static constexpr int SIZE = ROWS * COLS;

    struct Cell {
        float T = 0;   // temperature °C
        float P = 0;   // pressure hPa
        float U = 0;   // wind east component m/s
        float V = 0;   // wind north component m/s
        float H = 0;   // relative humidity [0,1]
        float R = 0;   // precipitation mm/h
    };

    struct Nudge {
        float T = 0, P = 0, U = 0, V = 0, H = 0;
        float weight = 0;
    };

    // Compact simulation snapshot (for history ring buffer and forecast)
    struct Snapshot {
        long long step;
        float     simTime;
        std::array<Cell, SIZE> grid;
    };

    // Event types for direct injection
    enum class EventType { CYCLONE, HEAT_DOME, COLD_OUTBREAK, BLOCKING_HIGH, TORNADO };

    static GridSim& instance();

    void start();
    void stop();
    void setSpeed(float s);
    float speed()   const { return speed_.load(); }
    float simTime() const { return simTime_; }

    std::string getStateJson() const;
    std::array<Cell, SIZE> getGrid() const;
    long long tick() const { return tick_.load(); }

    // Forecast: deep-copies current state, runs N steps (max 200) on the copy,
    // returns JSON array of snapshots (one every 10 steps).
    std::string getForecast(int steps) const;

    // History: returns JSON array of the last `limit` stored snapshots.
    std::string getHistory(int limit = 30) const;

    // Soft assimilation (OWM data) — Gaussian stencil, gradual drain
    void assimilate(float lat, float lon,
                    float T, float P, float U, float V, float H);

    // Hard injection (user events) — directly modifies grid for immediate visual effect
    void inject(float lat, float lon, EventType type, float intensity = 1.0f);

    // Helper geometry — static so physicsStep can use them without an instance
    static float cellLat(int r) { return -87.5f + r * 5.0f; }
    static float cellLon(int c) { return -177.5f + c * 5.0f; }
    static int   idx(int r, int c)  { return r * COLS + c; }
    static int   wrapC(int c)       { return (c + COLS) % COLS; }
    static int   clampR(int r)      { return r < 0 ? 0 : (r >= ROWS ? ROWS - 1 : r); }

private:
    GridSim();
    ~GridSim();

    void loop();
    void step(float dt);
    void initGrid();
    void drainNudges();
    void recordHistory();

    // Pure physics step — operates on an external grid copy, no member-state side effects.
    // Nudges are NOT applied here (only in the live step() path).
    static std::array<Cell, SIZE> physicsStep(
        const std::array<Cell, SIZE>& cur,
        float simTime, float dt);

    std::array<Cell, SIZE>  grid_;
    std::array<Nudge, SIZE> nudge_;
    mutable std::mutex      mutex_;

    std::thread            thread_;
    std::atomic<bool>      running_{false};
    std::atomic<float>     speed_{1.0f};
    std::atomic<long long> tick_{0};

    float simTime_{0.0f};

    // Zonal mean pressure per row (updated each step, used for storm detection)
    std::array<float, ROWS> zonalMeanP_{};

    // History ring buffer — stores one snapshot every 30 ticks (~3 s real time)
    static constexpr int HISTORY_CAP = 120;
    std::array<Snapshot, HISTORY_CAP> history_{};
    int histHead_{0};    // next write index
    int histCount_{0};   // number of valid entries (up to HISTORY_CAP)
    mutable std::mutex histMtx_;
};


