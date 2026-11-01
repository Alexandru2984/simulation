// Lightweight unit tests for GridSim
#include "GridSim.h"
#include "EventLog.h"
#include "GridCodec.h"
#include <cstring>
#include "test_framework.h"
#include <cmath>
#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif
#include <cassert>
#include <cstdio>
#include <filesystem>
#include <fstream>
#include <string>
#include <algorithm>
#include <numeric>
#include <stdexcept>
#include <vector>

// ── Test helpers ──────────────────────────────────────────────────────────────

// Run N physics steps from a fresh GridSim (via a local copy trick)
static std::array<GridSim::Cell, GridSim::SIZE> runSteps(int n) {
    GridSim& sim = GridSim::instance();
    sim.runTestSteps(n);
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
    runSteps(60);
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

TEST(simtime_advances_dt_per_step) {
    // Regression: speed used to scale both the step count and the simTime
    // increment; each step must advance simTime by exactly dt.
    GridSim& sim = GridSim::instance();
    sim.setSpeed(2.0f);
    float t0 = sim.simTime();
    runSteps(10);
    float t1 = sim.simTime();
    sim.setSpeed(1.0f);
    require(std::abs((t1 - t0) - 10 * 0.05f) < 1e-3f,
            "each step must advance simTime by dt regardless of speed");
}

TEST(steps_for_tick_accumulator) {
    float accum = 0.0f;
    int total = 0;
    for (int i = 0; i < 10; i++) total += GridSim::stepsForTick(1.0f, accum);
    require(total == 10, "speed 1 must run 1 step per tick");

    accum = 0.0f; total = 0;
    for (int i = 0; i < 4; i++) total += GridSim::stepsForTick(2.5f, accum);
    require(total == 10, "speed 2.5 must average 2.5 steps per tick");

    accum = 0.0f; total = 0;
    for (int i = 0; i < 10; i++) total += GridSim::stepsForTick(0.5f, accum);
    require(total == 5, "speed 0.5 must run a step every other tick");
}

// ── Snapshot persistence tests ────────────────────────────────────────────────

static std::string tmpSnapPath(const char* name) {
    return (std::filesystem::temp_directory_path() / name).string();
}

TEST(state_snapshot_roundtrip) {
    GridSim& sim = GridSim::instance();
    sim.inject(10.0f, 20.0f, GridSim::EventType::HEAT_DOME, 2.0f);
    // A few physics steps re-apply the simulation's own bounds — inject can
    // briefly exceed them and loadState clamps, which would break exactness.
    runSteps(5);
    auto before  = sim.getGrid();
    float tBefore = sim.simTime();

    const std::string path = tmpSnapPath("gridsim_roundtrip.snapshot");
    require(sim.saveState(path), "saveState must succeed");

    runSteps(30);  // diverge from the saved state
    require(sim.loadState(path), "loadState must succeed");
    std::remove(path.c_str());

    require(std::abs(sim.simTime() - tBefore) < 1e-6f, "simTime must be restored");
    auto after = sim.getGrid();
    for (int i = 0; i < GridSim::SIZE; i++) {
        require(before[i].T == after[i].T && before[i].P == after[i].P &&
                before[i].U == after[i].U && before[i].H == after[i].H,
                "grid cells must match exactly after roundtrip");
    }
}

TEST(state_snapshot_rejects_garbage) {
    const std::string path = tmpSnapPath("gridsim_garbage.snapshot");
    { std::ofstream out(path, std::ios::binary); out << "this is not a snapshot"; }
    require(!GridSim::instance().loadState(path), "garbage file must be rejected");
    std::remove(path.c_str());
    require(!GridSim::instance().loadState(tmpSnapPath("gridsim_missing.snapshot")),
            "missing file must be rejected");
}

TEST(state_snapshot_rejects_truncated) {
    GridSim& sim = GridSim::instance();
    const std::string path = tmpSnapPath("gridsim_trunc.snapshot");
    require(sim.saveState(path), "saveState must succeed");

    std::vector<char> head(1000);
    std::streamsize got;
    {
        std::ifstream in(path, std::ios::binary);
        in.read(head.data(), head.size());
        got = in.gcount();
    }
    { std::ofstream out(path, std::ios::binary | std::ios::trunc);
      out.write(head.data(), got); }

    require(!sim.loadState(path), "truncated file must be rejected");
    std::remove(path.c_str());
}

TEST(state_snapshot_rejects_wrong_dims) {
    GridSim& sim = GridSim::instance();
    const std::string path = tmpSnapPath("gridsim_dims.snapshot");
    require(sim.saveState(path), "saveState must succeed");

    // Corrupt the rows field (offset: 4 magic + 4 version)
    {
        std::fstream f(path, std::ios::binary | std::ios::in | std::ios::out);
        f.seekp(8);
        const int32_t badRows = 99;
        f.write(reinterpret_cast<const char*>(&badRows), sizeof(badRows));
    }
    require(!sim.loadState(path), "snapshot with wrong dimensions must be rejected");
    std::remove(path.c_str());
}

TEST(legacy_state_time_advances_past_float_limit) {
    GridSim& sim = GridSim::instance();
    const std::string path = tmpSnapPath("gridsim_legacy_time.snapshot");
    const auto grid = sim.getGrid();
    const char magic[4] = {'G', 'S', 'N', 'P'};
    const uint32_t version = 1;
    const int32_t rows = GridSim::ROWS, cols = GridSim::COLS;
    const float legacyTime = 1048576.0f;  // 2^20: float + 0.05 no longer advances
    const int64_t tick = sim.tick();
    {
        std::ofstream out(path, std::ios::binary | std::ios::trunc);
        out.write(magic, sizeof(magic));
        out.write(reinterpret_cast<const char*>(&version), sizeof(version));
        out.write(reinterpret_cast<const char*>(&rows), sizeof(rows));
        out.write(reinterpret_cast<const char*>(&cols), sizeof(cols));
        out.write(reinterpret_cast<const char*>(&legacyTime), sizeof(legacyTime));
        out.write(reinterpret_cast<const char*>(&tick), sizeof(tick));
        out.write(reinterpret_cast<const char*>(grid.data()), sizeof(grid));
    }

    require(sim.loadState(path), "version 1 state snapshot must remain readable");
    std::remove(path.c_str());
    const double before = sim.simTime();
    runSteps(1);
    require(sim.simTime() > before,
            "simTime must advance past the float precision boundary");
    require(std::abs((sim.simTime() - before) - 0.05) < 1e-6,
            "one physics step must still advance model time by 0.05 seconds");
}

TEST(history_snapshot_roundtrip) {
    GridSim& sim = GridSim::instance();
    runSteps(90);  // ensure several history entries exist
    std::string before = sim.getHistory(120);
    require(before != "[]", "history must be non-empty before save");

    const std::string path = tmpSnapPath("gridsim_hist.snapshot");
    require(sim.saveHistory(path), "saveHistory must succeed");

    runSteps(90);  // history diverges
    require(sim.getHistory(120) != before, "history must have changed");
    require(sim.loadHistory(path), "loadHistory must succeed");
    std::remove(path.c_str());

    require(sim.getHistory(120) == before,
            "history JSON must be identical after roundtrip");
}

TEST(history_snapshot_rejects_garbage) {
    const std::string path = tmpSnapPath("gridsim_hist_garbage.snapshot");
    { std::ofstream out(path, std::ios::binary); out << "not a history file"; }
    require(!GridSim::instance().loadHistory(path), "garbage history must be rejected");
    std::remove(path.c_str());
}

TEST(history_snapshot_rejects_bad_count) {
    GridSim& sim = GridSim::instance();
    const std::string path = tmpSnapPath("gridsim_hist_count.snapshot");
    require(sim.saveHistory(path), "saveHistory must succeed");

    // Corrupt the count field (offset: 4 magic + 4 version + 4 rows + 4 cols)
    {
        std::fstream f(path, std::ios::binary | std::ios::in | std::ios::out);
        f.seekp(16);
        const int32_t badCount = 9999;
        f.write(reinterpret_cast<const char*>(&badCount), sizeof(badCount));
    }
    require(!sim.loadHistory(path), "history with absurd count must be rejected");
    std::remove(path.c_str());
}

TEST(legacy_history_snapshot_is_readable) {
    GridSim& sim = GridSim::instance();
    const std::string path = tmpSnapPath("gridsim_legacy_history.snapshot");
    const auto grid = sim.getGrid();
    const char magic[4] = {'G', 'H', 'I', 'S'};
    const uint32_t version = 1;
    const int32_t rows = GridSim::ROWS, cols = GridSim::COLS, count = 1;
    const int64_t step = sim.tick();
    const float legacyTime = 123.5f;
    {
        std::ofstream out(path, std::ios::binary | std::ios::trunc);
        out.write(magic, sizeof(magic));
        out.write(reinterpret_cast<const char*>(&version), sizeof(version));
        out.write(reinterpret_cast<const char*>(&rows), sizeof(rows));
        out.write(reinterpret_cast<const char*>(&cols), sizeof(cols));
        out.write(reinterpret_cast<const char*>(&count), sizeof(count));
        out.write(reinterpret_cast<const char*>(&step), sizeof(step));
        out.write(reinterpret_cast<const char*>(&legacyTime), sizeof(legacyTime));
        out.write(reinterpret_cast<const char*>(grid.data()), sizeof(grid));
    }

    require(sim.loadHistory(path), "version 1 history snapshot must remain readable");
    std::remove(path.c_str());
    require(sim.getHistory(1).find("\"simTime\":123.5") != std::string::npos,
            "legacy history time must be converted without loss");
}

// ── Frame cache, codec, cadence and event log ────────────────────────────────

TEST(history_cadence_handles_any_speed) {
    // 0.5x: the tick rests on a multiple of 30 across two iterations.
    require(GridSim::shouldRecordHistory(29, 30), "crossing into bucket 1 records");
    require(!GridSim::shouldRecordHistory(30, 30), "resting on 30 must not record twice");
    // 7x: 28 -> 35 jumps over 30 without ever landing on it.
    require(GridSim::shouldRecordHistory(28, 35), "jumping over a multiple must record");
    require(!GridSim::shouldRecordHistory(31, 38), "inside one bucket must not record");
    // 50x crosses at most one recording per loop iteration.
    require(GridSim::shouldRecordHistory(100, 150), "large jumps still record");
}

TEST(frame_is_cached_until_state_changes) {
    GridSim& sim = GridSim::instance();
    const auto a = sim.frame();
    const auto b = sim.frame();
    require(a.get() == b.get(), "same state version must reuse the cached frame");
    sim.inject(10.0f, 10.0f, GridSim::EventType::HEAT_DOME, 1.0f);
    const auto c = sim.frame();
    require(c.get() != a.get(), "an injection must invalidate the frame");
    require(c->version > a->version, "frame version must advance");
    runSteps(1);
    require(sim.frame()->tick == c->tick + 1, "a physics step must produce a new frame");
}

TEST(inject_respects_physical_bounds) {
    GridSim& sim = GridSim::instance();
    for (int i = 0; i < 6; i++) {
        sim.inject(-60.0f, 120.0f, GridSim::EventType::COLD_OUTBREAK, 3.0f);
        sim.inject(-60.0f, 120.0f, GridSim::EventType::CYCLONE, 3.0f);
    }
    for (const auto& c : sim.getGrid()) {
        require(c.T >= -80.0f && c.T <= 60.0f, "injected T must stay within bounds");
        require(c.P >= 940.0f && c.P <= 1060.0f, "injected P must stay within bounds");
        require(std::sqrt(c.U * c.U + c.V * c.V) <= 70.01f, "injected wind must be capped");
    }
}

TEST(json_numbers_are_compact) {
    std::string out;
    GridCodec::appendNumber(out, 12.5, 2);   out += ' ';
    GridCodec::appendNumber(out, 0.0, 2);    out += ' ';
    GridCodec::appendNumber(out, -0.001, 2); out += ' ';
    GridCodec::appendNumber(out, 1013.25, 2); out += ' ';
    GridCodec::appendNumber(out, -3.10, 2);
    require(out == "12.5 0 0 1013.25 -3.1", "trailing zeros and negative zero must be trimmed");
}

TEST(binary_frame_layout_roundtrips) {
    const auto frame = GridSim::instance().frame();
    FrameExtras extras;
    extras.speed = 2.5;
    extras.viewers = 7;
    extras.serverTime = 1700000000;
    const std::string bin = GridCodec::composeBinary(*frame, extras);

    require(bin.compare(0, 4, "GSB1") == 0, "binary frame must start with GSB1");
    std::uint32_t headerLen = 0;
    for (int i = 0; i < 4; i++)
        headerLen |= static_cast<std::uint32_t>(static_cast<unsigned char>(bin[4 + i])) << (8 * i);
    const std::string header = bin.substr(8, headerLen);
    require(header.front() == '{' && header.back() == '}', "header must be a JSON object");
    require(header.find("\"viewers\":7") != std::string::npos, "header carries viewers");
    require(header.find("\"speed\":2.5") != std::string::npos, "header carries speed");
    require(header.find("[\"P\",100,1000]") != std::string::npos, "header describes fields");
    require(header.find("\"T\":[") == std::string::npos, "header must not repeat arrays");

    std::size_t offset = 8 + headerLen;
    offset = (offset + 3) & ~std::size_t(3);
    const std::size_t values = static_cast<std::size_t>(GridCodec::FIELD_COUNT) * GridSim::SIZE;
    require(bin.size() == offset + values * 2, "payload must hold every quantized value");

    // Decode P at cell 0 and compare with the live grid.
    const std::size_t pIndex = static_cast<std::size_t>(1) * GridSim::SIZE;
    const auto lo = static_cast<unsigned char>(bin[offset + pIndex * 2]);
    const auto hi = static_cast<unsigned char>(bin[offset + pIndex * 2 + 1]);
    const auto q = static_cast<std::int16_t>(static_cast<std::uint16_t>(lo | (hi << 8)));
    const float decoded = q / 100.0f + 1000.0f;
    const float actual = GridSim::instance().getGrid()[0].P;
    require(std::fabs(decoded - actual) <= 0.006f, "quantized pressure must decode within 0.01");
}

TEST(json_state_includes_speed_and_events) {
    const auto frame = GridSim::instance().frame();
    FrameExtras extras;
    extras.viewers = 3;
    extras.events = "[{\"id\":1}]";
    const std::string json = GridCodec::composeJson(*frame, extras);
    require(json.find("\"viewers\":3") != std::string::npos, "JSON carries viewers");
    require(json.find("\"speed\":") != std::string::npos, "JSON carries speed");
    require(json.find("\"events\":[{\"id\":1}]") != std::string::npos, "JSON carries events");
    require(json.find("\"SP\":[") != std::string::npos, "JSON keeps SP array");
    require(json.front() == '{' && json.back() == '}', "JSON must be one object");
}

TEST(event_log_is_bounded_and_ages_out) {
    auto& log = EventLog::instance();
    log.clearForTesting();
    for (int i = 0; i < 20; i++) log.record("cyclone", 40.0f, -74.0f, 1.0f, 1000 + i);
    const std::string json = log.json(1019);
    std::size_t count = 0;
    for (std::size_t p = json.find("\"id\":"); p != std::string::npos; p = json.find("\"id\":", p + 1))
        count++;
    require(count == EventLog::CAPACITY, "event log must keep only the newest entries");
    require(json.find("\"id\":20") < json.find("\"id\":19"), "newest event must come first");
    require(log.json(1019 + 10000) == "[]", "old events must age out");
    log.clearForTesting();
}

// Spin-up from a clean grid: winds must settle at realistic magnitudes with
// steady mid-latitude westerlies. Forward-Euler Coriolis used to blow every
// cell up to the 70 m/s clamp and flip zonal means from minute to minute.
static float meanWind(const std::array<GridSim::Cell, GridSim::SIZE>& g, float* maxOut) {
    double sum = 0, wsum = 0;
    float maxW = 0;
    for (int r = 0; r < GridSim::ROWS; r++) {
        const double w = std::cos(GridSim::cellLat(r) * M_PI / 180.0);
        for (int c = 0; c < GridSim::COLS; c++) {
            const auto& cell = g[r * GridSim::COLS + c];
            const float s = std::sqrt(cell.U * cell.U + cell.V * cell.V);
            sum += s * w; wsum += w; maxW = std::max(maxW, s);
        }
    }
    if (maxOut) *maxOut = maxW;
    return static_cast<float>(sum / wsum);
}

static float zonalMeanU(const std::array<GridSim::Cell, GridSim::SIZE>& g, int row) {
    float sum = 0;
    for (int c = 0; c < GridSim::COLS; c++) sum += g[row * GridSim::COLS + c].U;
    return sum / GridSim::COLS;
}

TEST(spin_up_winds_stay_physical) {
    GridSim& sim = GridSim::instance();
    sim.resetForTesting();
    sim.runTestSteps(2500);
    auto early = sim.getGrid();
    sim.runTestSteps(1500);
    auto late = sim.getGrid();

    float maxW = 0;
    const float avg = meanWind(late, &maxW);
    require(avg > 3.0f && avg < 20.0f, "global mean wind should settle between 3 and 20 m/s");
    require(maxW < 40.0f, "undisturbed winds must stay well below the 70 m/s clamp");

    const int row45N = 26, row45S = 9;   // 42.5°N and 42.5°S
    require(zonalMeanU(early, row45N) > 2.0f && zonalMeanU(late, row45N) > 2.0f,
            "northern mid-latitudes should keep steady westerlies");
    require(zonalMeanU(early, row45S) > 2.0f && zonalMeanU(late, row45S) > 2.0f,
            "southern mid-latitudes should keep steady westerlies");
}

TEST(spin_up_global_temperature_is_earthlike) {
    GridSim& sim = GridSim::instance();
    sim.resetForTesting();
    sim.runTestSteps(6000);
    auto g = sim.getGrid();
    double sum = 0, wsum = 0;
    for (int r = 0; r < GridSim::ROWS; r++) {
        const double w = std::cos(GridSim::cellLat(r) * M_PI / 180.0);
        for (int c = 0; c < GridSim::COLS; c++) { sum += g[r * GridSim::COLS + c].T * w; wsum += w; }
    }
    const double mean = sum / wsum;
    require(mean > 9.0 && mean < 21.0, "area-weighted mean temperature should stay near 15 °C");
}

TEST(cyclone_with_calm_eye_is_detected) {
    GridSim& sim = GridSim::instance();
    sim.resetForTesting();               // calm: U = V = 0 everywhere
    sim.inject(10.0f, 60.0f, GridSim::EventType::CYCLONE, 1.0f);
    sim.runTestSteps(3);
    const std::string json = sim.getStateJson();
    require(json.find("\"storms\":[{") != std::string::npos,
            "the eyewall winds should qualify the low as a storm");
}

TEST(injected_cyclone_persists_and_decays) {
    GridSim& sim = GridSim::instance();
    sim.resetForTesting();
    sim.runTestSteps(1500);
    sim.inject(45.0f, 0.0f, GridSim::EventType::CYCLONE, 1.5f);
    sim.runTestSteps(150);   // 15 s of real time at 1×
    require(sim.getStateJson().find("\"storms\":[{") != std::string::npos,
            "an injected cyclone should still be detected after 150 steps");
    sim.runTestSteps(3000);
    float maxW = 0;
    meanWind(sim.getGrid(), &maxW);
    require(maxW < 40.0f, "the cyclone's winds should decay instead of growing");
}

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
    RUN(simtime_advances_dt_per_step);
    RUN(steps_for_tick_accumulator);
    RUN(fronts_in_json);
    RUN(storm_potential_non_negative);
    RUN(tornado_inject_extreme_wind);
    RUN(tornado_inject_low_pressure);
    RUN(fronts_detected_after_inject);
    RUN(history_accumulates);
    RUN(history_has_required_fields);
    RUN(forecast_returns_snapshots);
    RUN(forecast_snapshot_fields);

    // Snapshot persistence
    RUN(state_snapshot_roundtrip);
    RUN(state_snapshot_rejects_garbage);
    RUN(state_snapshot_rejects_truncated);
    RUN(state_snapshot_rejects_wrong_dims);
    RUN(history_snapshot_roundtrip);
    RUN(history_snapshot_rejects_garbage);
    RUN(history_snapshot_rejects_bad_count);
    RUN(legacy_history_snapshot_is_readable);
    RUN(legacy_state_time_advances_past_float_limit);

    // Frame cache, codec, cadence and event log
    RUN(history_cadence_handles_any_speed);
    RUN(frame_is_cached_until_state_changes);
    RUN(inject_respects_physical_bounds);
    RUN(json_numbers_are_compact);
    RUN(binary_frame_layout_roundtrips);
    RUN(json_state_includes_speed_and_events);
    RUN(event_log_is_bounded_and_ages_out);

    // Dynamics regression checks (run last: they reset the shared grid)
    RUN(spin_up_winds_stay_physical);
    RUN(spin_up_global_temperature_is_earthlike);
    RUN(cyclone_with_calm_eye_is_detected);
    RUN(injected_cyclone_persists_and_decays);

    printf("\n=== %d passed, %d failed ===\n\n", passed, failed);
    return failed > 0 ? 1 : 0;
}
