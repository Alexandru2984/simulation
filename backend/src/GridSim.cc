#include "GridSim.h"
#include <cmath>
#include <chrono>
#include <algorithm>
#include <sstream>
#include <iomanip>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

static constexpr float OMEGA = 7.2921e-5f;  // Earth rotation rad/s
static constexpr float DT    = 0.05f;        // physics timestep seconds
static constexpr float PHYSICS_HZ = 10.0f;   // real-time steps per second

GridSim& GridSim::instance() {
    static GridSim inst;
    return inst;
}

GridSim::GridSim() { initGrid(); }
GridSim::~GridSim() { stop(); }

void GridSim::initGrid() {
    for (int r = 0; r < ROWS; r++) {
        float lat = cellLat(r);
        float latR = lat * (float)M_PI / 180.0f;
        for (int c = 0; c < COLS; c++) {
            Cell& cell = grid_[idx(r, c)];
            // Initialise temperature: hot equator, cold poles
            cell.T = 30.0f * std::pow(std::cos(latR), 1.5f) - 10.0f;
            cell.P = 1013.25f + 1.2f * (cell.T - 15.0f);
            cell.U = 0.0f;
            cell.V = 0.0f;
            // Humidity: tropics moister, poles drier
            cell.H = 0.3f + 0.4f * std::pow(std::cos(latR), 2.0f);
            cell.R = 0.0f;
        }
    }
}

void GridSim::start() {
    if (running_.exchange(true)) return;
    thread_ = std::thread(&GridSim::loop, this);
}

void GridSim::stop() {
    running_.store(false);
    if (thread_.joinable()) thread_.join();
}

void GridSim::setSpeed(float s) {
    speed_.store(std::max(0.5f, std::min(50.0f, s)));
}

// ── Physics step ─────────────────────────────────────────────────────────────
void GridSim::step(float dt) {
    std::array<Cell, SIZE> next = grid_;

    // Hour angle: one sim-day = 3600 real seconds (fast cycle)
    float simDay = 3600.0f;
    float hourAngle0 = (simTime_ / simDay) * 2.0f * (float)M_PI;

    for (int r = 0; r < ROWS; r++) {
        float latDeg = cellLat(r);
        float latR   = latDeg * (float)M_PI / 180.0f;
        float sinLat = std::sin(latR);
        float cosLat = std::cos(latR);

        // Coriolis parameter
        float f = 2.0f * OMEGA * sinLat;

        // Grid spacing in metres (approx)
        float dy = 10.0f * 111000.0f;
        float dx = dy * std::max(cosLat, 0.05f);  // shrinks near poles

        for (int c = 0; c < COLS; c++) {
            float lonR = cellLon(c) * (float)M_PI / 180.0f;

            int i  = idx(r, c);
            int rU = clampR(r + 1), rD = clampR(r - 1);
            int cR = wrapC(c + 1),  cL = wrapC(c - 1);

            const Cell& cur = grid_[i];
            const Cell& nN  = grid_[idx(rU, c)];
            const Cell& nS  = grid_[idx(rD, c)];
            const Cell& nE  = grid_[idx(r, cR)];
            const Cell& nW  = grid_[idx(r, cL)];

            // ── 1. Solar insolation ───────────────────────────────────────
            float ha = hourAngle0 + lonR;
            float solar = cosLat * std::cos(ha);
            float T_eq  = 38.0f * cosLat * cosLat - 25.0f;  // -25°C poles, +13°C equator
            float dT_solar = (T_eq + 18.0f * std::max(0.0f, solar) - cur.T) * 0.003f * dt;

            // ── 2. Thermal diffusion ──────────────────────────────────────
            float T_avg = 0.25f * (nN.T + nS.T + nE.T + nW.T);
            float dT_diff = (T_avg - cur.T) * 0.12f * dt;

            // ── 3. Pressure relaxation toward temperature ─────────────────
            float P_target = 1013.25f + 1.5f * (cur.T - 15.0f);
            float dP = (P_target - cur.P) * 0.8f * dt;

            // ── 4. Wind from pressure gradient + Coriolis ─────────────────
            //    Use hPa/degree directly, tuned coefficient for visual realism
            float dPdx = (nE.P - nW.P) * 0.5f;   // hPa per 10° lon
            float dPdy = (nN.P - nS.P) * 0.5f;   // hPa per 10° lat
            float pgfScale = 0.08f;               // tuned: produces 5-30 m/s winds

            float dU = (-dPdx * pgfScale + f * 1e5f * cur.V) * dt;
            float dV = (-dPdy * pgfScale - f * 1e5f * cur.U) * dt;

            float friction = 0.08f;
            float newU = cur.U * (1.0f - friction * dt) + dU;
            float newV = cur.V * (1.0f - friction * dt) + dV;

            // Clamp wind speed
            float spd = std::sqrt(newU * newU + newV * newV);
            if (spd > 70.0f) { newU *= 70.0f / spd; newV *= 70.0f / spd; }

            // ── 5. Temperature advection (upwind) ────────────────────────
            float dT_adv = 0.0f;
            if (dx > 0.0f) {
                dT_adv += (cur.U > 0)
                    ? -cur.U * (cur.T - nW.T) / dx * dt
                    : -cur.U * (nE.T - cur.T) / dx * dt;
            }
            dT_adv += (cur.V > 0)
                ? -cur.V * (cur.T - nS.T) / dy * dt
                : -cur.V * (nN.T - cur.T) / dy * dt;

            // ── 6. Humidity & precipitation ───────────────────────────────
            // Evaporation when warm, condensation+rain when supersaturated
            float evap = (1.0f - cur.H) * 0.004f * std::max(0.0f, cur.T) * dt;
            float H_new = cur.H + evap;
            // Humidity advection
            float H_avg = 0.25f * (nN.H + nS.H + nE.H + nW.H);
            H_new += (H_avg - cur.H) * 0.03f * dt;

            float H_sat = 0.80f - 0.005f * std::max(0.0f, cur.T - 25.0f);
            float precip = 0.0f;
            if (H_new > H_sat) {
                precip = (H_new - H_sat) * 25.0f;
                H_new  = H_sat * 0.97f;
            }
            H_new = std::max(0.0f, std::min(1.0f, H_new));

            // ── Accumulate ───────────────────────────────────────────────
            float newT = cur.T + dT_solar + dT_diff + dT_adv;
            newT = std::max(-80.0f, std::min(60.0f, newT));  // physical bounds

            next[i].T = newT;
            next[i].P = std::max(940.0f, std::min(1060.0f, cur.P + dP));
            next[i].U = newU;
            next[i].V = newV;
            next[i].H = H_new;
            next[i].R = precip;
        }
    }

    {
        std::lock_guard<std::mutex> lk(mutex_);
        grid_ = next;
    }

    simTime_ += dt * speed_.load();
    tick_++;
}

// ── Main loop ─────────────────────────────────────────────────────────────────
void GridSim::loop() {
    using clock = std::chrono::steady_clock;
    constexpr auto interval = std::chrono::milliseconds(
        static_cast<int>(1000.0f / PHYSICS_HZ));

    while (running_.load()) {
        auto t0 = clock::now();

        // Run multiple physics steps per real tick (speed multiplier)
        int steps = std::max(1, static_cast<int>(speed_.load()));
        for (int i = 0; i < steps; i++) step(DT);

        auto elapsed = clock::now() - t0;
        auto sleep = interval - elapsed;
        if (sleep > std::chrono::milliseconds(0))
            std::this_thread::sleep_for(sleep);
    }
}

// ── Accessors ─────────────────────────────────────────────────────────────────
std::array<GridSim::Cell, GridSim::SIZE> GridSim::getGrid() const {
    std::lock_guard<std::mutex> lk(mutex_);
    return grid_;
}

std::string GridSim::getStateJson() const {
    auto g = getGrid();

    std::ostringstream os;
    os << std::fixed << std::setprecision(2);

    auto arr = [&](const char* key, auto getter) {
        os << "\"" << key << "\":[";
        for (int i = 0; i < SIZE; i++) {
            os << getter(g[i]);
            if (i < SIZE - 1) os << ',';
        }
        os << ']';
    };

    os << '{'
       << "\"tick\":"  << tick_.load() << ','
       << "\"cols\":"  << COLS << ','
       << "\"rows\":"  << ROWS << ',';

    arr("T", [](const Cell& c) { return c.T; }); os << ',';
    arr("P", [](const Cell& c) { return c.P; }); os << ',';
    arr("U", [](const Cell& c) { return c.U; }); os << ',';
    arr("V", [](const Cell& c) { return c.V; }); os << ',';
    arr("H", [](const Cell& c) { return c.H; }); os << ',';
    arr("R", [](const Cell& c) { return c.R; });

    os << '}';
    return os.str();
}
