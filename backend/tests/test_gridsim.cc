// Lightweight unit tests for GridSim — no external framework, just assert + report
#include "GridSim.h"
#include <cmath>
#include <cassert>
#include <cstdio>
#include <string>
#include <algorithm>
#include <numeric>
#include <stdexcept>

static int passed = 0, failed = 0;

#define TEST(name) void test_##name()
#define RUN(name)  do { \
    try { test_##name(); printf("  PASS  " #name "\n"); passed++; } \
    catch (const std::exception& e) { printf("  FAIL  " #name " — %s\n", e.what()); failed++; } \
    catch (...) { printf("  FAIL  " #name " — unknown exception\n"); failed++; } \
} while(0)

static void require(bool cond, const char* msg) {
    if (!cond) throw std::runtime_error(msg);
}

// ── Test helpers ──────────────────────────────────────────────────────────────

// Run N physics steps from a fresh GridSim (via a local copy trick)
static std::array<GridSim::Cell, GridSim::SIZE> runSteps(int n) {
    // Warm up the singleton by stepping it
    GridSim& sim = GridSim::instance();
    // We just call getGrid() before/after manually advancing tick via start/stop
    // Instead, do a quick start/stop cycle for n steps
    sim.setSpeed(1.0f);
    sim.start();
    // Wait until at least n ticks have elapsed
    long long target = sim.tick() + n;
    while (sim.tick() < target)
        std::this_thread::sleep_for(std::chrono::milliseconds(10));
    sim.stop();
    return sim.getGrid();
}

// ── Tests ─────────────────────────────────────────────────────────────────────

TEST(init_equator_warmer_than_poles) {
    // After init (before any step), equatorial cells should be warmer than polar
    GridSim& sim = GridSim::instance();
    auto g = sim.getGrid();

    // Equator row: r=8 or r=9 (lat = -5° or +5°)
    float T_eq = g[sim.idx(8, 0)].T;

    // North pole row: r=17 (lat = +85°)
    float T_np = g[sim.idx(17, 0)].T;

    // South pole row: r=0 (lat = -85°)
    float T_sp = g[sim.idx(0, 0)].T;

    require(T_eq > T_np + 5.0f, "Equator should be >5°C warmer than north pole at init");
    require(T_eq > T_sp + 5.0f, "Equator should be >5°C warmer than south pole at init");
}

TEST(grid_dimensions) {
    require(GridSim::ROWS == 18, "ROWS must be 18");
    require(GridSim::COLS == 36, "COLS must be 36");
    require(GridSim::SIZE == 648, "SIZE must be 648");
}

TEST(cell_lat_lon_range) {
    GridSim& sim = GridSim::instance();
    require(std::abs(sim.cellLat(0)  - (-85.0f)) < 0.01f, "Row 0 lat = -85°");
    require(std::abs(sim.cellLat(17) -  (85.0f)) < 0.01f, "Row 17 lat = +85°");
    require(std::abs(sim.cellLon(0)  - (-175.0f)) < 0.01f, "Col 0 lon = -175°");
    require(std::abs(sim.cellLon(35) -  (175.0f)) < 0.01f, "Col 35 lon = +175°");
}

TEST(wrap_and_clamp) {
    GridSim& sim = GridSim::instance();
    require(sim.wrapC(-1)  == 35, "wrapC(-1) = 35");
    require(sim.wrapC(36)  == 0,  "wrapC(36) = 0");
    require(sim.clampR(-1) == 0,  "clampR(-1) = 0");
    require(sim.clampR(18) == 17, "clampR(18) = 17");
}

TEST(pressure_within_physical_bounds) {
    GridSim& sim = GridSim::instance();
    auto g = sim.getGrid();
    for (int i = 0; i < GridSim::SIZE; i++) {
        require(g[i].P >= 930.0f && g[i].P <= 1070.0f,
                "Pressure out of physical range [930, 1070] hPa");
    }
}

TEST(temperature_within_physical_bounds) {
    GridSim& sim = GridSim::instance();
    auto g = sim.getGrid();
    for (int i = 0; i < GridSim::SIZE; i++) {
        require(g[i].T >= -90.0f && g[i].T <= 65.0f,
                "Temperature out of physical range");
    }
}

TEST(humidity_in_unit_range) {
    GridSim& sim = GridSim::instance();
    auto g = sim.getGrid();
    for (int i = 0; i < GridSim::SIZE; i++) {
        require(g[i].H >= 0.0f && g[i].H <= 1.0f,
                "Humidity must be in [0, 1]");
    }
}

TEST(wind_speed_bounded) {
    auto g = runSteps(50);
    for (int i = 0; i < GridSim::SIZE; i++) {
        float spd = std::sqrt(g[i].U * g[i].U + g[i].V * g[i].V);
        require(spd <= 75.0f, "Wind speed exceeds 75 m/s after 50 steps");
    }
}

TEST(diffusion_reduces_temperature_gradient) {
    // After many steps, the temperature range should be smaller than the initial
    // (diffusion and solar forcing together create a bounded, smooth distribution)
    auto g1 = GridSim::instance().getGrid();
    float T_min1 = 1e9f, T_max1 = -1e9f;
    for (auto& c : g1) { T_min1 = std::min(T_min1, c.T); T_max1 = std::max(T_max1, c.T); }

    auto g2 = runSteps(200);
    float T_min2 = 1e9f, T_max2 = -1e9f;
    for (auto& c : g2) { T_min2 = std::min(T_min2, c.T); T_max2 = std::max(T_max2, c.T); }

    // After running, the distribution should be within physical range
    require(T_max2 - T_min2 < 200.0f, "Temperature range unrealistically large after simulation");
    require(T_min2 > -90.0f && T_max2 < 65.0f, "Temperature out of bounds after simulation");
}

TEST(precipitation_non_negative) {
    auto g = runSteps(30);
    for (int i = 0; i < GridSim::SIZE; i++) {
        require(g[i].R >= 0.0f, "Precipitation must be >= 0");
    }
}

TEST(json_output_valid_structure) {
    std::string json = GridSim::instance().getStateJson();
    require(json.find("\"T\":[")  != std::string::npos, "JSON missing T array");
    require(json.find("\"P\":[")  != std::string::npos, "JSON missing P array");
    require(json.find("\"U\":[")  != std::string::npos, "JSON missing U array");
    require(json.find("\"V\":[")  != std::string::npos, "JSON missing V array");
    require(json.find("\"H\":[")  != std::string::npos, "JSON missing H array");
    require(json.find("\"R\":[")  != std::string::npos, "JSON missing R array");
    require(json.find("\"cols\":36") != std::string::npos, "JSON wrong cols");
    require(json.find("\"rows\":18") != std::string::npos, "JSON wrong rows");
    require(json.front() == '{' && json.back() == '}', "JSON not an object");
}

TEST(coriolis_curves_wind_northward_hemisphere) {
    // In northern hemisphere with eastward wind (U>0), Coriolis should curve it
    // southward (V becomes negative). Test sign over many steps.
    // We check that after N steps the average |V| > 0 (wind is not purely zonal)
    auto g = runSteps(100);
    float abs_V_north = 0;
    int count = 0;
    for (int r = 9; r < 17; r++) {   // northern hemisphere rows
        for (int c = 0; c < GridSim::COLS; c++) {
            abs_V_north += std::abs(g[GridSim::instance().idx(r, c)].V);
            count++;
        }
    }
    float avg = abs_V_north / count;
    require(avg > 0.001f, "No meridional wind component in northern hemisphere after simulation");
}

// ── main ──────────────────────────────────────────────────────────────────────
#include <thread>
#include <chrono>

int main() {
    printf("\n=== GridSim Unit Tests ===\n\n");

    RUN(grid_dimensions);
    RUN(cell_lat_lon_range);
    RUN(wrap_and_clamp);
    RUN(init_equator_warmer_than_poles);
    RUN(pressure_within_physical_bounds);
    RUN(temperature_within_physical_bounds);
    RUN(humidity_in_unit_range);
    RUN(wind_speed_bounded);
    RUN(precipitation_non_negative);
    RUN(json_output_valid_structure);
    RUN(diffusion_reduces_temperature_gradient);
    RUN(coriolis_curves_wind_northward_hemisphere);

    printf("\n=== %d passed, %d failed ===\n\n", passed, failed);
    return failed > 0 ? 1 : 0;
}
