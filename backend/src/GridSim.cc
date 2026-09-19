#include "GridSim.h"
#include <cmath>
#include <chrono>
#include <algorithm>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <fstream>
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

// Speed scales the number of fixed-dt steps per tick; simTime advances by dt
// inside step(), so the multiplier is applied exactly once.
int GridSim::stepsForTick(float speed, float& accum) {
    accum += std::max(0.0f, speed);
    int steps = static_cast<int>(accum);
    accum -= static_cast<float>(steps);
    return steps;
}

// ── Pure physics step (static) ────────────────────────────────────────────────
// No member state; safe to call from getForecast() on a copy.
std::array<GridSim::Cell, GridSim::SIZE> GridSim::physicsStep(
    const std::array<Cell, SIZE>& grid,
    double simTime, float dt)
{
    std::array<Cell, SIZE> next = grid;

    constexpr double simDay = 3600.0;
    const float hourAngle0 = static_cast<float>(
        (std::fmod(simTime, simDay) / simDay) * 2.0 * M_PI);

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
    std::lock_guard<std::mutex> lk(mutex_);
    grid_ = physicsStep(grid_, simTime_, dt);
    drainNudges();
    simTime_ += dt;
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

// ── Snapshot persistence ──────────────────────────────────────────────────────
// Version 2 layout: magic "GSNP", u32 version, i32 rows, i32 cols,
// f64 simTime, i64 tick,
// then ROWS×COLS Cell records (6 floats each). Host byte order — snapshots only
// ever move between restarts on the same machine. The loader also accepts the
// version 1 layout, which stored simTime as f32.
namespace {
constexpr char     SNAP_MAGIC[4] = {'G', 'S', 'N', 'P'};
constexpr uint32_t SNAP_VERSION  = 2;
constexpr uint32_t SNAP_VERSION_LEGACY = 1;
}

static_assert(sizeof(GridSim::Cell) == 6 * sizeof(float),
              "Cell must stay tightly packed for snapshot I/O");

bool GridSim::saveState(const std::string& path) const {
    std::array<Cell, SIZE> g;
    double simTime;
    int64_t tick;
    {
        std::lock_guard<std::mutex> lk(mutex_);
        g       = grid_;
        simTime = simTime_;
        tick    = tick_.load();
    }

    const std::string tmp = path + ".tmp";
    {
        std::ofstream out(tmp, std::ios::binary | std::ios::trunc);
        if (!out) return false;
        const int32_t rows = ROWS, cols = COLS;
        out.write(SNAP_MAGIC, sizeof(SNAP_MAGIC));
        out.write(reinterpret_cast<const char*>(&SNAP_VERSION), sizeof(SNAP_VERSION));
        out.write(reinterpret_cast<const char*>(&rows), sizeof(rows));
        out.write(reinterpret_cast<const char*>(&cols), sizeof(cols));
        out.write(reinterpret_cast<const char*>(&simTime), sizeof(simTime));
        out.write(reinterpret_cast<const char*>(&tick), sizeof(tick));
        out.write(reinterpret_cast<const char*>(g.data()), sizeof(g));
        out.flush();
        if (!out) { std::remove(tmp.c_str()); return false; }
    }
    if (std::rename(tmp.c_str(), path.c_str()) != 0) {
        std::remove(tmp.c_str());
        return false;
    }
    return true;
}

bool GridSim::loadState(const std::string& path) {
    std::ifstream in(path, std::ios::binary);
    if (!in) return false;

    char magic[4] = {};
    uint32_t version = 0;
    int32_t rows = 0, cols = 0;
    double simTime = 0.0;
    int64_t tick = 0;
    std::array<Cell, SIZE> g;

    in.read(magic, sizeof(magic));
    in.read(reinterpret_cast<char*>(&version), sizeof(version));
    in.read(reinterpret_cast<char*>(&rows), sizeof(rows));
    in.read(reinterpret_cast<char*>(&cols), sizeof(cols));
    if (!in) return false;
    if (std::memcmp(magic, SNAP_MAGIC, sizeof(SNAP_MAGIC)) != 0) return false;
    if ((version != SNAP_VERSION && version != SNAP_VERSION_LEGACY) ||
        rows != ROWS || cols != COLS)
        return false;

    if (version == SNAP_VERSION_LEGACY) {
        float legacySimTime = 0.0f;
        in.read(reinterpret_cast<char*>(&legacySimTime), sizeof(legacySimTime));
        simTime = legacySimTime;
    } else {
        in.read(reinterpret_cast<char*>(&simTime), sizeof(simTime));
    }
    in.read(reinterpret_cast<char*>(&tick), sizeof(tick));
    in.read(reinterpret_cast<char*>(g.data()), sizeof(g));
    if (!in || in.gcount() != static_cast<std::streamsize>(sizeof(g))) return false;
    if (in.peek() != std::char_traits<char>::eof()) return false;  // trailing bytes

    if (!std::isfinite(simTime) || simTime < 0.0 || tick < 0) return false;
    for (const Cell& c : g) {
        if (!std::isfinite(c.T) || !std::isfinite(c.P) || !std::isfinite(c.U) ||
            !std::isfinite(c.V) || !std::isfinite(c.H) || !std::isfinite(c.R))
            return false;
    }

    // Clamp to the same physical bounds the simulation enforces. The wind
    // check needs a rounding margin: physicsStep's own renormalisation can
    // leave speeds a few ULP above 70, and those must load back bit-exact.
    for (Cell& c : g) {
        c.T = std::clamp(c.T, -80.0f, 60.0f);
        c.P = std::clamp(c.P, 940.0f, 1060.0f);
        const float spd = std::sqrt(c.U * c.U + c.V * c.V);
        if (spd > 70.7f) { c.U *= 70.0f / spd; c.V *= 70.0f / spd; }
        c.H = std::clamp(c.H, 0.0f, 1.0f);
        c.R = std::max(0.0f, c.R);
    }

    std::lock_guard<std::mutex> lk(mutex_);
    grid_    = g;
    simTime_ = simTime;
    tick_.store(tick);
    return true;
}

// ── History persistence ───────────────────────────────────────────────────────
// Layout: magic "GHIS", u32 version, i32 rows, i32 cols, i32 count, then
// `count` entries of (i64 step, f64 simTime, ROWS×COLS Cell records),
// oldest first. Version 1 history files used f32 simTime and remain readable.
// Same host-only, atomic-write contract as the grid snapshot.
namespace {
constexpr char     HIST_MAGIC[4] = {'G', 'H', 'I', 'S'};
constexpr uint32_t HIST_VERSION  = 2;
constexpr uint32_t HIST_VERSION_LEGACY = 1;
}

bool GridSim::saveHistory(const std::string& path) const {
    const auto snaps = copyHistory(-1);

    const std::string tmp = path + ".tmp";
    {
        std::ofstream out(tmp, std::ios::binary | std::ios::trunc);
        if (!out) return false;
        const int32_t rows = ROWS, cols = COLS;
        const int32_t count = static_cast<int32_t>(snaps.size());
        out.write(HIST_MAGIC, sizeof(HIST_MAGIC));
        out.write(reinterpret_cast<const char*>(&HIST_VERSION), sizeof(HIST_VERSION));
        out.write(reinterpret_cast<const char*>(&rows), sizeof(rows));
        out.write(reinterpret_cast<const char*>(&cols), sizeof(cols));
        out.write(reinterpret_cast<const char*>(&count), sizeof(count));
        for (const Snapshot& s : snaps) {
            const int64_t step = s.step;
            out.write(reinterpret_cast<const char*>(&step), sizeof(step));
            out.write(reinterpret_cast<const char*>(&s.simTime), sizeof(s.simTime));
            out.write(reinterpret_cast<const char*>(s.grid.data()), sizeof(s.grid));
        }
        out.flush();
        if (!out) { std::remove(tmp.c_str()); return false; }
    }
    if (std::rename(tmp.c_str(), path.c_str()) != 0) {
        std::remove(tmp.c_str());
        return false;
    }
    return true;
}

bool GridSim::loadHistory(const std::string& path) {
    std::ifstream in(path, std::ios::binary);
    if (!in) return false;

    char magic[4] = {};
    uint32_t version = 0;
    int32_t rows = 0, cols = 0, count = 0;
    in.read(magic, sizeof(magic));
    in.read(reinterpret_cast<char*>(&version), sizeof(version));
    in.read(reinterpret_cast<char*>(&rows), sizeof(rows));
    in.read(reinterpret_cast<char*>(&cols), sizeof(cols));
    in.read(reinterpret_cast<char*>(&count), sizeof(count));
    if (!in) return false;
    if (std::memcmp(magic, HIST_MAGIC, sizeof(HIST_MAGIC)) != 0) return false;
    if ((version != HIST_VERSION && version != HIST_VERSION_LEGACY) ||
        rows != ROWS || cols != COLS)
        return false;
    if (count < 0 || count > HISTORY_CAP) return false;

    std::vector<Snapshot> snaps(count);
    for (int n = 0; n < count; n++) {
        int64_t step = -1;
        in.read(reinterpret_cast<char*>(&step), sizeof(step));
        if (version == HIST_VERSION_LEGACY) {
            float legacySimTime = 0.0f;
            in.read(reinterpret_cast<char*>(&legacySimTime), sizeof(legacySimTime));
            snaps[n].simTime = legacySimTime;
        } else {
            in.read(reinterpret_cast<char*>(&snaps[n].simTime), sizeof(snaps[n].simTime));
        }
        in.read(reinterpret_cast<char*>(snaps[n].grid.data()), sizeof(snaps[n].grid));
        if (!in || step < 0 || !std::isfinite(snaps[n].simTime)) return false;
        snaps[n].step = step;
        for (const Cell& c : snaps[n].grid) {
            if (!std::isfinite(c.T) || !std::isfinite(c.P) || !std::isfinite(c.U) ||
                !std::isfinite(c.V) || !std::isfinite(c.H) || !std::isfinite(c.R))
                return false;
        }
    }
    if (in.peek() != std::char_traits<char>::eof()) return false;  // trailing bytes

    std::lock_guard<std::mutex> lk(histMtx_);
    for (int n = 0; n < count; n++) history_[n] = snaps[n];
    histHead_  = count % HISTORY_CAP;
    histCount_ = count;
    return true;
}

// ── Main loop ─────────────────────────────────────────────────────────────────
void GridSim::loop() {
    using clock = std::chrono::steady_clock;
    constexpr auto interval = std::chrono::milliseconds(
        static_cast<int>(1000.0f / PHYSICS_HZ));

    while (running_.load()) {
        auto t0 = clock::now();

        int steps = stepsForTick(speed_.load(), stepAccum_);
        for (int i = 0; i < steps; i++) step(DT);

        // Record history snapshot every 30 ticks (~3 real seconds)
        if (tick_.load() % 30 == 0) recordHistory();

        auto elapsed = clock::now() - t0;
        auto sleep   = interval - elapsed;
        if (sleep > std::chrono::milliseconds(0))
            std::this_thread::sleep_for(sleep);
    }
}

#ifdef GRID_SIM_TESTING
void GridSim::runTestSteps(int steps) {
    stop();
    setSpeed(1.0f);
    for (int i = 0; i < steps; i++) {
        step(DT);
        if (tick_.load() % 30 == 0) recordHistory();
    }
}
#endif

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

double GridSim::simTime() const {
    std::lock_guard<std::mutex> lk(mutex_);
    return simTime_;
}

// ── Forecast ─────────────────────────────────────────────────────────────────
// Runs N physics steps on a deep copy of current state (no sleep, no nudges).
// Returns JSON array of snapshots, one per 10 steps.
std::string GridSim::getForecast(int steps) const {
    steps = std::max(1, std::min(200, steps));

    // Deep copy under lock
    std::array<Cell, SIZE> g;
    double st;
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
        st += static_cast<double>(DT);

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
// Oldest-first copy of the last `limit` snapshots (all of them for limit < 0).
std::vector<GridSim::Snapshot> GridSim::copyHistory(int limit) const {
    std::vector<Snapshot> snaps;
    std::lock_guard<std::mutex> lk(histMtx_);
    int count = (limit < 0) ? histCount_ : std::min(limit, histCount_);
    int startIdx = ((histHead_ - count) % HISTORY_CAP + HISTORY_CAP) % HISTORY_CAP;
    snaps.reserve(count);
    for (int n = 0; n < count; n++)
        snaps.push_back(history_[(startIdx + n) % HISTORY_CAP]);
    return snaps;
}

std::string GridSim::getHistory(int limit) const {
    limit = std::max(1, std::min(limit, HISTORY_CAP));

    // Copy under lock, serialize outside — the sim thread records history
    // every 30 ticks and must not wait behind ~7 MB of string building.
    const auto snaps = copyHistory(limit);
    if (snaps.empty()) return "[]";

    std::ostringstream os;
    os << std::fixed << std::setprecision(1);
    os << '[';
    for (std::size_t n = 0; n < snaps.size(); n++) {
        const Snapshot& snap = snaps[n];
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
    // Copy under lock, serialize outside — same pattern as getForecast().
    std::array<Cell, SIZE> g;
    double simTime;
    long long tick;
    {
        std::lock_guard<std::mutex> lk(mutex_);
        g       = grid_;
        simTime = simTime_;
        tick    = tick_.load();
    }

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
       << "\"tick\":"     << tick          << ','
       << "\"cols\":"     << COLS          << ','
       << "\"rows\":"     << ROWS          << ','
       << "\"simTime\":"  << simTime       << ','
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
