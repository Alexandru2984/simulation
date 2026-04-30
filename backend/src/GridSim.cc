#include "GridSim.h"
#include <cmath>
#include <chrono>
#include <algorithm>
#include <sstream>
#include <iomanip>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

static constexpr float OMEGA      = 7.2921e-5f;  // Earth rotation rad/s
static constexpr float DT         = 0.05f;        // physics timestep seconds
static constexpr float PHYSICS_HZ = 10.0f;        // real-time steps per second

GridSim& GridSim::instance() {
    static GridSim inst;
    return inst;
}

GridSim::GridSim() { initGrid(); nudge_.fill(Nudge{}); }
GridSim::~GridSim() { stop(); }

void GridSim::initGrid() {
    for (int r = 0; r < ROWS; r++) {
        float lat  = cellLat(r);
        float latR = lat * (float)M_PI / 180.0f;
        for (int c = 0; c < COLS; c++) {
            Cell& cell = grid_[idx(r, c)];
            cell.T = 30.0f * std::pow(std::cos(latR), 1.5f) - 10.0f;
            cell.P = 1013.25f + 1.2f * (cell.T - 15.0f);
            cell.U = 0.0f;
            cell.V = 0.0f;
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

// ── Pure physics step (static) ────────────────────────────────────────────────
// No member state; safe to call from getForecast() on a copy.
std::array<GridSim::Cell, GridSim::SIZE> GridSim::physicsStep(
    const std::array<Cell, SIZE>& grid,
    float simTime, float dt)
{
    std::array<Cell, SIZE> next = grid;

    float simDay    = 3600.0f;
    float hourAngle0 = (simTime / simDay) * 2.0f * (float)M_PI;

    for (int r = 0; r < ROWS; r++) {
        float latDeg = cellLat(r);
        float latR   = latDeg * (float)M_PI / 180.0f;
        float sinLat = std::sin(latR);
        float cosLat = std::cos(latR);

        float f  = 2.0f * OMEGA * sinLat;   // Coriolis
        float dy = 5.0f * 111000.0f;         // metres per 5° lat
        float dx = dy * std::max(cosLat, 0.05f);

        for (int c = 0; c < COLS; c++) {
            float lonR = cellLon(c) * (float)M_PI / 180.0f;

            int i  = idx(r, c);
            int rU = clampR(r + 1), rD = clampR(r - 1);
            int cR = wrapC(c + 1),  cL = wrapC(c - 1);

            const Cell& cur = grid[i];
            const Cell& nN  = grid[idx(rU, c)];
            const Cell& nS  = grid[idx(rD, c)];
            const Cell& nE  = grid[idx(r, cR)];
            const Cell& nW  = grid[idx(r, cL)];

            // 1. Solar insolation
            float ha      = hourAngle0 + lonR;
            float solar   = cosLat * std::cos(ha);
            float T_eq    = 38.0f * cosLat * cosLat - 25.0f;
            float dT_solar = (T_eq + 18.0f * std::max(0.0f, solar) - cur.T) * 0.003f * dt;

            // 2. Thermal diffusion
            float T_avg  = 0.25f * (nN.T + nS.T + nE.T + nW.T);
            float dT_diff = (T_avg - cur.T) * 0.12f * dt;

            // 3. Pressure relaxation toward temperature
            float P_target = 1013.25f + 1.5f * (cur.T - 15.0f);
            float dP       = (P_target - cur.P) * 0.8f * dt;

            // 4. Wind from pressure gradient force + Coriolis
            float dPdx   = (nE.P - nW.P) * 0.5f;
            float dPdy   = (nN.P - nS.P) * 0.5f;
            float pgfScale = 0.08f;
            float dU = (-dPdx * pgfScale + f * 1e5f * cur.V) * dt;
            float dV = (-dPdy * pgfScale - f * 1e5f * cur.U) * dt;

            float friction = 0.08f;
            float newU = cur.U * (1.0f - friction * dt) + dU;
            float newV = cur.V * (1.0f - friction * dt) + dV;

            float spd = std::sqrt(newU * newU + newV * newV);
            if (spd > 70.0f) { newU *= 70.0f / spd; newV *= 70.0f / spd; }

            // 5. Temperature advection (upwind scheme)
            float dT_adv = 0.0f;
            if (dx > 0.0f) {
                dT_adv += (cur.U > 0)
                    ? -cur.U * (cur.T - nW.T) / dx * dt
                    : -cur.U * (nE.T - cur.T) / dx * dt;
            }
            dT_adv += (cur.V > 0)
                ? -cur.V * (cur.T - nS.T) / dy * dt
                : -cur.V * (nN.T - cur.T) / dy * dt;

            // 6. Humidity & precipitation
            float evap = (1.0f - cur.H) * 0.004f * std::max(0.0f, cur.T) * dt;
            float H_new = cur.H + evap;
            float H_avg = 0.25f * (nN.H + nS.H + nE.H + nW.H);
            H_new += (H_avg - cur.H) * 0.03f * dt;

            float H_sat  = 0.80f - 0.005f * std::max(0.0f, cur.T - 25.0f);
            float precip = 0.0f;
            if (H_new > H_sat) {
                precip = (H_new - H_sat) * 25.0f;
                H_new  = H_sat * 0.97f;
            }
            H_new = std::max(0.0f, std::min(1.0f, H_new));

            // Latent heat release: condensation warms surrounding air (real atmospheric physics)
            float dT_latent = precip * 0.05f;

            float newT = cur.T + dT_solar + dT_diff + dT_adv + dT_latent;
            newT = std::max(-80.0f, std::min(60.0f, newT));

            next[i].T = newT;
            next[i].P = std::max(940.0f, std::min(1060.0f, cur.P + dP));
            next[i].U = newU;
            next[i].V = newV;
            next[i].H = H_new;
            next[i].R = precip;
        }
    }
    return next;
}

// ── Live physics step ─────────────────────────────────────────────────────────
void GridSim::step(float dt) {
    std::array<Cell, SIZE> next = physicsStep(grid_, simTime_, dt);
    {
        std::lock_guard<std::mutex> lk(mutex_);
        grid_ = next;
        drainNudges();
    }
    simTime_ += dt * speed_.load();
    tick_++;
}

// ── Data assimilation ─────────────────────────────────────────────────────────
void GridSim::assimilate(float lat, float lon,
                          float T, float P, float U, float V, float H) {
    int r0 = std::clamp((int)std::round((lat  - (-87.5f)) / 5.0f), 0, ROWS - 1);
    int c0 = ((int)std::round((lon - (-177.5f)) / 5.0f) + COLS) % COLS;

    std::lock_guard<std::mutex> lk(mutex_);
    for (int dr = -2; dr <= 2; dr++) {
        for (int dc = -2; dc <= 2; dc++) {
            int r = clampR(r0 + dr);
            int c = wrapC(c0 + dc);
            float w = std::exp(-(dr*dr + dc*dc) / (2.0f * 2.25f));
            Nudge& n = nudge_[idx(r, c)];
            n.T      += (T - grid_[idx(r,c)].T) * w;
            n.P      += (P - grid_[idx(r,c)].P) * w;
            n.U      += (U - grid_[idx(r,c)].U) * w;
            n.V      += (V - grid_[idx(r,c)].V) * w;
            n.H      += (H - grid_[idx(r,c)].H) * w;
            n.weight += w;
        }
    }
}

// ── Nudge drain ───────────────────────────────────────────────────────────────
void GridSim::drainNudges() {
    constexpr float RELAX_RATE  = 0.015f;
    constexpr float MAX_DELTA_T = 0.5f;
    for (int i = 0; i < SIZE; i++) {
        Nudge& n = nudge_[i];
        if (n.weight < 1e-6f) continue;
        Cell& cell = grid_[i];
        float dT = std::clamp(n.T * RELAX_RATE, -MAX_DELTA_T, MAX_DELTA_T);
        cell.T = std::clamp(cell.T + dT,           -80.0f, 60.0f);
        cell.P = std::clamp(cell.P + n.P * RELAX_RATE * 0.5f, 940.0f, 1060.0f);
        cell.U += n.U * RELAX_RATE;
        cell.V += n.V * RELAX_RATE;
        cell.H  = std::clamp(cell.H + n.H * RELAX_RATE, 0.0f, 1.0f);
        n.T      *= (1.0f - RELAX_RATE);
        n.P      *= (1.0f - RELAX_RATE);
        n.U      *= (1.0f - RELAX_RATE);
        n.V      *= (1.0f - RELAX_RATE);
        n.H      *= (1.0f - RELAX_RATE);
        n.weight *= (1.0f - RELAX_RATE);
    }
}

// ── Event injection ───────────────────────────────────────────────────────────
void GridSim::inject(float lat, float lon, EventType type, float intensity) {
    int r0 = std::clamp((int)std::round((lat  - (-87.5f)) / 5.0f), 0, ROWS - 1);
    int c0 = ((int)std::round((lon - (-177.5f)) / 5.0f) + COLS) % COLS;
    float latCell = cellLat(r0);

    // TORNADO uses tighter Gaussian (σ=1 cell); others use σ=2
    float sigma2 = (type == EventType::TORNADO) ? 1.0f : 4.0f;

    std::lock_guard<std::mutex> lk(mutex_);

    for (int dr = -3; dr <= 3; dr++) {
        for (int dc = -3; dc <= 3; dc++) {
            int r = clampR(r0 + dr);
            int c = wrapC(c0 + dc);
            float w      = std::exp(-(dr*dr + dc*dc) / (2.0f * sigma2));
            float r_dist = std::sqrt((float)(dr*dr + dc*dc));
            Cell& cell   = grid_[idx(r, c)];

            switch (type) {
            case EventType::CYCLONE: {
                cell.P  = std::max(940.0f, cell.P - 28.0f * intensity * w);
                cell.T -= 2.0f * intensity * w;
                cell.H  = std::min(1.0f, cell.H + 0.3f * w);
                if (r_dist > 0.1f) {
                    float v_max = 25.0f * intensity * w * std::max(0.0f, 1.5f - r_dist / 4.0f);
                    float sign  = (latCell >= 0.0f) ? 1.0f : -1.0f;
                    cell.U += sign * (-float(dr) / r_dist) * v_max;
                    cell.V += sign * ( float(dc) / r_dist) * v_max;
                }
                break;
            }
            case EventType::HEAT_DOME: {
                cell.T  = std::min(60.0f,   cell.T + 18.0f * intensity * w);
                cell.P  = std::min(1060.0f, cell.P +  8.0f * intensity * w);
                cell.H  = std::max(0.0f,    cell.H -  0.2f * w);
                if (r_dist > 0.1f) {
                    float v_max = 8.0f * intensity * w;
                    cell.U += (float(dc) / r_dist) * v_max;
                    cell.V += (float(dr) / r_dist) * v_max;
                }
                break;
            }
            case EventType::COLD_OUTBREAK: {
                cell.T  = std::max(-80.0f,  cell.T - 22.0f * intensity * w);
                cell.P  = std::min(1060.0f, cell.P + 12.0f * intensity * w);
                cell.H  = std::min(1.0f,    cell.H +  0.15f * w);
                if (r_dist > 0.1f) {
                    float v_max = 12.0f * intensity * w;
                    cell.U += (float(dc) / r_dist) * v_max;
                    cell.V += (float(dr) / r_dist) * v_max;
                }
                break;
            }
            case EventType::BLOCKING_HIGH: {
                cell.P  = std::min(1060.0f, cell.P + 22.0f * intensity * w);
                cell.T -= 4.0f * intensity * w;
                cell.H  = std::max(0.0f, cell.H - 0.25f * w);
                if (r_dist > 0.1f) {
                    float v_max = 18.0f * intensity * w;
                    float sign  = (latCell >= 0.0f) ? -1.0f : 1.0f;
                    cell.U += sign * (-float(dr) / r_dist) * v_max;
                    cell.V += sign * ( float(dc) / r_dist) * v_max;
                }
                break;
            }
            case EventType::TORNADO: {
                // Tight vortex: extreme wind, deep pressure drop, high humidity
                cell.P  = std::max(940.0f, cell.P - 30.0f * intensity * w);
                cell.T -= 1.5f * intensity * w;
                cell.H  = std::min(1.0f, cell.H + 0.4f * w);
                if (r_dist > 0.1f) {
                    // v_max peaks at r_dist=0.5 cell, falls off quickly
                    float v_max = 55.0f * intensity * w * std::max(0.0f, 1.8f - r_dist);
                    float sign  = (latCell >= 0.0f) ? 1.0f : -1.0f;
                    cell.U += sign * (-float(dr) / r_dist) * v_max;
                    cell.V += sign * ( float(dc) / r_dist) * v_max;
                    // Clamp per-cell to physical max
                    float spd = std::sqrt(cell.U * cell.U + cell.V * cell.V);
                    if (spd > 70.0f) { cell.U *= 70.0f / spd; cell.V *= 70.0f / spd; }
                }
                break;
            }
            }
        }
    }
}

// ── Main loop ─────────────────────────────────────────────────────────────────
void GridSim::loop() {
    using clock = std::chrono::steady_clock;
    constexpr auto interval = std::chrono::milliseconds(
        static_cast<int>(1000.0f / PHYSICS_HZ));

    while (running_.load()) {
        auto t0 = clock::now();

        int steps = std::max(1, static_cast<int>(speed_.load()));
        for (int i = 0; i < steps; i++) step(DT);

        // Record history snapshot every 30 ticks (~3 real seconds)
        if (tick_.load() % 30 == 0) recordHistory();

        auto elapsed = clock::now() - t0;
        auto sleep   = interval - elapsed;
        if (sleep > std::chrono::milliseconds(0))
            std::this_thread::sleep_for(sleep);
    }
}

// ── History ring buffer ───────────────────────────────────────────────────────
void GridSim::recordHistory() {
    Snapshot snap;
    {
        std::lock_guard<std::mutex> lk(mutex_);
        snap.step    = tick_.load();
        snap.simTime = simTime_;
        snap.grid    = grid_;
    }
    std::lock_guard<std::mutex> lk(histMtx_);
    history_[histHead_] = snap;
    histHead_ = (histHead_ + 1) % HISTORY_CAP;
    if (histCount_ < HISTORY_CAP) histCount_++;
}

// ── Accessors ─────────────────────────────────────────────────────────────────
std::array<GridSim::Cell, GridSim::SIZE> GridSim::getGrid() const {
    std::lock_guard<std::mutex> lk(mutex_);
    return grid_;
}

// ── Forecast ─────────────────────────────────────────────────────────────────
// Runs N physics steps on a deep copy of current state (no sleep, no nudges).
// Returns JSON array of snapshots, one per 10 steps.
std::string GridSim::getForecast(int steps) const {
    steps = std::max(1, std::min(200, steps));

    // Deep copy under lock
    std::array<Cell, SIZE> g;
    float st;
    {
        std::lock_guard<std::mutex> lk(mutex_);
        g  = grid_;
        st = simTime_;
    }

    std::ostringstream os;
    os << std::fixed << std::setprecision(1);
    os << "[{\"step\":0,\"simTime\":" << st
       << ",\"rows\":" << ROWS << ",\"cols\":" << COLS
       << ",\"T\":[";
    for (int i = 0; i < SIZE; i++) { os << g[i].T; if (i < SIZE-1) os << ','; }
    os << "],\"P\":[";
    for (int i = 0; i < SIZE; i++) { os << g[i].P; if (i < SIZE-1) os << ','; }
    os << "],\"U\":[";
    for (int i = 0; i < SIZE; i++) { os << g[i].U; if (i < SIZE-1) os << ','; }
    os << "],\"V\":[";
    for (int i = 0; i < SIZE; i++) { os << g[i].V; if (i < SIZE-1) os << ','; }
    os << "],\"H\":[";
    for (int i = 0; i < SIZE; i++) { os << g[i].H; if (i < SIZE-1) os << ','; }
    os << "],\"R\":[";
    for (int i = 0; i < SIZE; i++) { os << g[i].R; if (i < SIZE-1) os << ','; }
    os << "]}";

    for (int s = 1; s <= steps; s++) {
        g   = physicsStep(g, st, DT);
        st += DT;

        if (s % 10 == 0 || s == steps) {
            os << ",{\"step\":" << s << ",\"simTime\":" << st
               << ",\"rows\":" << ROWS << ",\"cols\":" << COLS
               << ",\"T\":[";
            for (int i = 0; i < SIZE; i++) { os << g[i].T; if (i < SIZE-1) os << ','; }
            os << "],\"P\":[";
            for (int i = 0; i < SIZE; i++) { os << g[i].P; if (i < SIZE-1) os << ','; }
            os << "],\"U\":[";
            for (int i = 0; i < SIZE; i++) { os << g[i].U; if (i < SIZE-1) os << ','; }
            os << "],\"V\":[";
            for (int i = 0; i < SIZE; i++) { os << g[i].V; if (i < SIZE-1) os << ','; }
            os << "],\"H\":[";
            for (int i = 0; i < SIZE; i++) { os << g[i].H; if (i < SIZE-1) os << ','; }
            os << "],\"R\":[";
            for (int i = 0; i < SIZE; i++) { os << g[i].R; if (i < SIZE-1) os << ','; }
            os << "]}";
        }
    }
    os << "]";
    return os.str();
}

// ── History retrieval ─────────────────────────────────────────────────────────
std::string GridSim::getHistory(int limit) const {
    limit = std::max(1, std::min(limit, HISTORY_CAP));

    std::lock_guard<std::mutex> lk(histMtx_);
    if (histCount_ == 0) return "[]";

    // Walk backward from most recent (histHead_-1) to oldest within limit
    int count   = std::min(limit, histCount_);
    // Start from oldest of the `count` we'll return
    int startIdx = ((histHead_ - count) % HISTORY_CAP + HISTORY_CAP) % HISTORY_CAP;

    std::ostringstream os;
    os << std::fixed << std::setprecision(1);
    os << '[';
    for (int n = 0; n < count; n++) {
        int i = (startIdx + n) % HISTORY_CAP;
        const Snapshot& snap = history_[i];
        if (n > 0) os << ',';
        os << "{\"step\":" << snap.step
           << ",\"simTime\":" << snap.simTime
           << ",\"rows\":" << ROWS << ",\"cols\":" << COLS
           << ",\"T\":[";
        for (int k = 0; k < SIZE; k++) { os << snap.grid[k].T; if (k<SIZE-1) os<<','; }
        os << "],\"U\":[";
        for (int k = 0; k < SIZE; k++) { os << snap.grid[k].U; if (k<SIZE-1) os<<','; }
        os << "],\"V\":[";
        for (int k = 0; k < SIZE; k++) { os << snap.grid[k].V; if (k<SIZE-1) os<<','; }
        os << "],\"P\":[";
        for (int k = 0; k < SIZE; k++) { os << snap.grid[k].P; if (k<SIZE-1) os<<','; }
        os << "]}";
    }
    os << ']';
    return os.str();
}

// ── JSON state output ─────────────────────────────────────────────────────────
std::string GridSim::getStateJson() const {
    std::lock_guard<std::mutex> lk(mutex_);
    const auto& g = grid_;

    // ── Zonal means for anomaly-based detection ──
    std::array<float, ROWS> zonalP{}, zonalT{};
    for (int r = 0; r < ROWS; r++) {
        float sumP = 0, sumT = 0;
        for (int c = 0; c < COLS; c++) {
            sumP += g[idx(r, c)].P;
            sumT += g[idx(r, c)].T;
        }
        zonalP[r] = sumP / COLS;
        zonalT[r] = sumT / COLS;
    }

    // ── Storm detection ──
    std::string storms = "[";
    bool firstStorm = true;
    for (int r = 1; r < ROWS - 1; r++) {
        for (int c = 0; c < COLS; c++) {
            int i = idx(r, c);
            float P_anom = g[i].P - zonalP[r];
            if (P_anom > -6.0f) continue;
            float windSpd = std::sqrt(g[i].U * g[i].U + g[i].V * g[i].V);
            if (windSpd < 7.0f) continue;
            bool isMin = g[i].P < g[idx(clampR(r-1), c)].P &&
                         g[i].P < g[idx(clampR(r+1), c)].P &&
                         g[i].P < g[idx(r, wrapC(c-1))].P &&
                         g[i].P < g[idx(r, wrapC(c+1))].P;
            if (!isMin) continue;
            char buf[200];
            std::snprintf(buf, sizeof(buf),
                "%s{\"lat\":%.1f,\"lon\":%.1f,\"P\":%.1f,\"anom\":%.1f,\"wind\":%.1f}",
                firstStorm ? "" : ",",
                cellLat(r), cellLon(c), g[i].P, P_anom, windSpd);
            storms += buf;
            firstStorm = false;
        }
    }
    storms += "]";

    // ── Frontal zone detection ──
    // Compute row-mean temperature gradient magnitude to normalize against background.
    // A "frontal zone" is a cell whose gradient exceeds its row mean by 2.5 °C/10°.
    std::array<float, SIZE> gradT{};
    for (int r = 0; r < ROWS; r++) {
        for (int c = 0; c < COLS; c++) {
            int rU = clampR(r + 1), rD = clampR(r - 1);
            int cR = wrapC(c + 1),  cL = wrapC(c - 1);
            float dTdx = (g[idx(r,cR)].T - g[idx(r,cL)].T) * 0.5f;
            float dTdy = (g[idx(rU,c)].T - g[idx(rD,c)].T) * 0.5f;
            gradT[idx(r, c)] = std::sqrt(dTdx*dTdx + dTdy*dTdy);
        }
    }
    std::array<float, ROWS> rowMeanGrad{};
    for (int r = 0; r < ROWS; r++) {
        float sum = 0;
        for (int c = 0; c < COLS; c++) sum += gradT[idx(r, c)];
        rowMeanGrad[r] = sum / COLS;
    }

    std::string fronts = "[";
    bool firstFront = true;
    for (int r = 1; r < ROWS - 1; r++) {
        for (int c = 0; c < COLS; c++) {
            float intensity = gradT[idx(r, c)] - rowMeanGrad[r];
            if (intensity < 2.5f) continue;    // below-threshold: not a front
            char buf[128];
            std::snprintf(buf, sizeof(buf),
                "%s{\"lat\":%.1f,\"lon\":%.1f,\"intensity\":%.2f}",
                firstFront ? "" : ",", cellLat(r), cellLon(c), intensity);
            fronts += buf;
            firstFront = false;
        }
    }
    fronts += "]";

    // ── StormPotential per cell (proxy for convective instability) ──
    // High SP = warm+moist+low-pressure anomaly at same location
    // SP = max(0, warmAnomaly) * H * max(0, pressureAnomaly/5)
    // This favors thunderstorm conditions without claiming CAPE accuracy.

    // ── Global area-weighted stats (cos-lat weighting) ──
    float sumT = 0, sumWind = 0, sumPrecip = 0, totalW = 0;
    for (int r = 0; r < ROWS; r++) {
        float lat = cellLat(r);
        float w   = std::cos(lat * (float)M_PI / 180.0f);
        for (int c = 0; c < COLS; c++) {
            int i = idx(r, c);
            sumT      += g[i].T * w;
            sumWind   += std::sqrt(g[i].U * g[i].U + g[i].V * g[i].V) * w;
            sumPrecip += g[i].R * w;
            totalW    += w;
        }
    }
    float avgT     = sumT     / totalW;
    float avgWind  = sumWind  / totalW;
    float avgPrecip = sumPrecip / totalW;

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
       << "\"tick\":"     << tick_.load()  << ','
       << "\"cols\":"     << COLS          << ','
       << "\"rows\":"     << ROWS          << ','
       << "\"simTime\":"  << simTime_      << ','
       << "\"avgT\":"     << avgT          << ','
       << "\"avgWind\":"  << avgWind       << ','
       << "\"avgPrecip\":" << avgPrecip    << ',';

    arr("T", [](const Cell& c) { return c.T; }); os << ',';
    arr("P", [](const Cell& c) { return c.P; }); os << ',';
    arr("U", [](const Cell& c) { return c.U; }); os << ',';
    arr("V", [](const Cell& c) { return c.V; }); os << ',';
    arr("H", [](const Cell& c) { return c.H; }); os << ',';
    arr("R", [](const Cell& c) { return c.R; }); os << ',';

    // StormPotential: warm+moist+low-pressure anomaly proxy
    os << "\"SP\":[";
    for (int i = 0; i < SIZE; i++) {
        int r = i / COLS;
        float warmAnom = std::max(0.0f, g[i].T - zonalT[r]);
        float presAnom = std::max(0.0f, (zonalP[r] - g[i].P) / 5.0f);
        float sp = warmAnom * g[i].H * presAnom;
        os << std::setprecision(1) << sp;
        if (i < SIZE - 1) os << ',';
    }
    os << ']';

    os << ",\"storms\":"  << storms;
    os << ",\"fronts\":"  << fronts;

    os << '}';
    return os.str();
}
