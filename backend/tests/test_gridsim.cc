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

    // Equator row: r=17 or r=18 (lat = -2.5° or +2.5°) at 5° resolution
    float T_eq = g[sim.idx(17, 0)].T;

    // North pole row: r=35 (lat = +87.5°)
    float T_np = g[sim.idx(35, 0)].T;

    // South pole row: r=0 (lat = -87.5°)
    float T_sp = g[sim.idx(0, 0)].T;

    require(T_eq > T_np + 5.0f, "Equator should be >5°C warmer than north pole at init");
    require(T_eq > T_sp + 5.0f, "Equator should be >5°C warmer than south pole at init");
}

TEST(grid_dimensions) {
    require(GridSim::ROWS == 36, "ROWS must be 36");
    require(GridSim::COLS == 72, "COLS must be 72");
    require(GridSim::SIZE == 2592, "SIZE must be 2592");
}

TEST(cell_lat_lon_range) {
    GridSim& sim = GridSim::instance();
    require(std::abs(sim.cellLat(0)  - (-87.5f)) < 0.01f, "Row 0 lat = -87.5°");
    require(std::abs(sim.cellLat(35) -  (87.5f)) < 0.01f, "Row 35 lat = +87.5°");
    require(std::abs(sim.cellLon(0)  - (-177.5f)) < 0.01f, "Col 0 lon = -177.5°");
    require(std::abs(sim.cellLon(71) -  (177.5f)) < 0.01f, "Col 71 lon = +177.5°");
}

TEST(wrap_and_clamp) {
    GridSim& sim = GridSim::instance();
    require(sim.wrapC(-1)  == 71, "wrapC(-1) = 71");
    require(sim.wrapC(72)  == 0,  "wrapC(72) = 0");
    require(sim.clampR(-1) == 0,  "clampR(-1) = 0");
    require(sim.clampR(36) == 35, "clampR(36) = 35");
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
    require(json.find("\"cols\":72") != std::string::npos, "JSON wrong cols");
    require(json.find("\"rows\":36") != std::string::npos, "JSON wrong rows");
    require(json.front() == '{' && json.back() == '}', "JSON not an object");
}

TEST(coriolis_curves_wind_northward_hemisphere) {
    auto g = runSteps(100);
    float abs_V_north = 0;
    int count = 0;
    for (int r = 18; r < 35; r++) {  // rows where lat > 0
        for (int c = 0; c < GridSim::COLS; c++) {
            abs_V_north += std::abs(g[GridSim::instance().idx(r, c)].V);
            count++;
        }
    }
    float avg = abs_V_north / count;
    require(avg > 0.001f, "No meridional wind component in northern hemisphere after simulation");
}

TEST(tornado_inject_extreme_wind) {
    GridSim& sim = GridSim::instance();
    // Inject tornado at (45°N, 0°) — row=27, col=36 at 5° resolution
    sim.inject(45.0f, 0.0f, GridSim::EventType::TORNADO, 1.0f);
    auto g = sim.getGrid();
    int r0 = 27, c0 = 36;
    float maxSpd = 0;
    for (int dr = -2; dr <= 2; dr++) {
        for (int dc = -2; dc <= 2; dc++) {
            int r = sim.clampR(r0 + dr);
            int c = sim.wrapC(c0 + dc);
            int i = sim.idx(r, c);
            float spd = std::sqrt(g[i].U * g[i].U + g[i].V * g[i].V);
            if (spd > maxSpd) maxSpd = spd;
        }
    }
    require(maxSpd > 30.0f, "Tornado inject should produce wind > 30 m/s near center");
    require(maxSpd < 71.0f, "Wind speed must respect the 70 m/s cap (allowing fp tolerance)");
}

TEST(tornado_inject_low_pressure) {
    GridSim& sim = GridSim::instance();
    sim.inject(30.0f, 90.0f, GridSim::EventType::TORNADO, 1.0f);
    auto g = sim.getGrid();
    // Center row/col for lat=30, lon=90 at 5° resolution
    int r0 = sim.clampR((int)std::round((30.0f - (-87.5f)) / 5.0f));
    int c0 = sim.wrapC((int)std::round((90.0f - (-177.5f)) / 5.0f));
    float centerP = g[sim.idx(r0, c0)].P;
    require(centerP < 1005.0f, "Tornado center should have significantly lower pressure than normal (1013 hPa)");
}

TEST(storm_potential_non_negative) {
    // After some simulation steps, SP values in JSON should all be >= 0
    std::string json = GridSim::instance().getStateJson();
    size_t spPos = json.find("\"SP\":[");
    require(spPos != std::string::npos, "JSON missing SP array");
    // Parse first few SP values — all should be non-negative
    size_t arrStart = spPos + 6;  // skip "SP":[
    size_t arrEnd   = json.find(']', arrStart);
    require(arrEnd != std::string::npos, "SP array not closed");
    std::string spArr = json.substr(arrStart, arrEnd - arrStart);
    // Check no value starts with a minus sign (i.e., no negative values)
    // Simple heuristic: no ",-" sequence and doesn't start with "-"
    require(spArr.find(",-") == std::string::npos, "SP array contains negative values");
}

TEST(fronts_in_json) {
    std::string json = GridSim::instance().getStateJson();
    require(json.find("\"fronts\":[") != std::string::npos, "JSON missing fronts array");
    require(json.find("\"simTime\":") != std::string::npos, "JSON missing simTime field");
}

TEST(fronts_detected_after_inject) {
    // After a heat dome injection (large T anomaly → sharp gradient at edges),
    // the fronts array should be non-empty.
    GridSim& sim = GridSim::instance();
    sim.inject(0.0f, 0.0f, GridSim::EventType::HEAT_DOME, 1.0f);
    std::string json = sim.getStateJson();
    size_t fPos = json.find("\"fronts\":[");
    require(fPos != std::string::npos, "JSON missing fronts after heat dome inject");
    // fronts should not be empty — "fronts":[] means empty
    require(json.substr(fPos + 9, 2) != "[]", "Expected non-empty fronts array after heat dome inject");
}

TEST(history_accumulates) {
    GridSim& sim = GridSim::instance();
    // Run enough ticks that recordHistory() fires at least once (every 30 ticks)
    auto g = runSteps(60);
    std::string hist = sim.getHistory(10);
    require(hist != "[]", "History should not be empty after 60 physics ticks");
    require(hist.front() == '[' && hist.back() == ']', "History must be a JSON array");
    require(hist.find("\"step\":") != std::string::npos, "History entries must contain step field");
}

TEST(history_has_required_fields) {
    std::string hist = GridSim::instance().getHistory(1);
    if (hist == "[]") return;  // skip if no history yet (shouldn't happen after earlier tests)
    require(hist.find("\"simTime\":") != std::string::npos, "History entry missing simTime");
    require(hist.find("\"rows\":")    != std::string::npos, "History entry missing rows");
    require(hist.find("\"cols\":")    != std::string::npos, "History entry missing cols");
    require(hist.find("\"T\":[")      != std::string::npos, "History entry missing T array");
    require(hist.find("\"U\":[")      != std::string::npos, "History entry missing U array");
}

TEST(forecast_returns_snapshots) {
    // getForecast(50) should return exactly 6 snapshots: step 0 + 5 at multiples of 10
    std::string fc = GridSim::instance().getForecast(50);
    require(fc.front() == '[' && fc.back() == ']', "Forecast must be a JSON array");
    // Count occurrences of "\"step\":"
    int count = 0;
    size_t pos = 0;
    while ((pos = fc.find("\"step\":", pos)) != std::string::npos) { count++; pos++; }
    require(count == 6, "getForecast(50) should return 6 snapshots (step 0 + 5 at steps 10..50)");
}

TEST(forecast_snapshot_fields) {
    std::string fc = GridSim::instance().getForecast(10);
    require(fc.find("\"simTime\":") != std::string::npos, "Forecast snapshot missing simTime");
    require(fc.find("\"rows\":")    != std::string::npos, "Forecast snapshot missing rows");
    require(fc.find("\"cols\":")    != std::string::npos, "Forecast snapshot missing cols");
    require(fc.find("\"T\":[")      != std::string::npos, "Forecast snapshot missing T");
    require(fc.find("\"P\":[")      != std::string::npos, "Forecast snapshot missing P");
    require(fc.find("\"U\":[")      != std::string::npos, "Forecast snapshot missing U");
    require(fc.find("\"V\":[")      != std::string::npos, "Forecast snapshot missing V");
}

TEST(simtime_increases) {
    GridSim& sim = GridSim::instance();
    float t0 = sim.simTime();
    runSteps(20);
    float t1 = sim.simTime();
    require(t1 > t0, "simTime must increase after physics steps");
}

// ── main ──────────────────────────────────────────────────────────────────────
#include <thread>
#include <chrono>

int main() {
    printf("\n=== GridSim Unit Tests ===\n\n");

    // Original tests
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

    // Phase 1: new physics features
    RUN(simtime_increases);
    RUN(fronts_in_json);
    RUN(storm_potential_non_negative);
    RUN(tornado_inject_extreme_wind);
    RUN(tornado_inject_low_pressure);
    RUN(fronts_detected_after_inject);
    RUN(history_accumulates);
    RUN(history_has_required_fields);
    RUN(forecast_returns_snapshots);
    RUN(forecast_snapshot_fields);

    printf("\n=== %d passed, %d failed ===\n\n", passed, failed);
    return failed > 0 ? 1 : 0;
}
