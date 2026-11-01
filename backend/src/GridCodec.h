#pragma once

// Serialization of the live grid for REST and WebSocket clients.
//
// A GridFrame holds everything derived from one grid state (stats, storm and
// front detection, every per-cell array) and is built once per state version.
// Per-request values (speed, viewers, events, server time) are added when the
// frame is composed, so they never invalidate the expensive part.
//
// Binary WebSocket frame ("GSB1"), all integers little-endian:
//   0  char[4]  magic "GSB1"
//   4  u32      header length N
//   8  N bytes  UTF-8 JSON header (same keys as the JSON state minus arrays,
//               plus "fields": [[name, scale, offset], ...])
//      zero padding to a 4-byte boundary
//      int16[FIELD_COUNT * rows * cols]  field-major, value = q / scale + offset
//
// Compressed WebSocket frame ("GSB2"): the same layout and header (plus
// "encoding"), but the int16 block is replaced by a zlib stream (RFC 1950)
// of that block after two lossless transforms that make it compress well:
//   1. row delta: within each field and grid row, every value is replaced by
//      its difference from the previous one (the first from 0), wrapping in
//      int16 arithmetic;
//   2. byte shuffle: all low bytes first, then all high bytes.
// About 7.5 KB instead of 36.5 KB. It is compressed once per grid version and
// shared by every client.

#include <algorithm>
#include <charconv>
#include <cmath>
#include <cstdint>
#include <stdexcept>
#include <string>
#include <string_view>
#include <vector>

struct GridFrame {
    std::uint64_t version = 0;
    long long tick = 0;
    double simTime = 0.0;
    int rows = 0;
    int cols = 0;
    std::string stats;    // "\"avgT\":..,\"avgWind\":..,\"avgPrecip\":.."
    std::string arrays;   // "\"T\":[..],\"P\":[..],..,\"SP\":[..]"
    std::string storms;   // JSON array
    std::string fronts;   // JSON array
    std::vector<std::int16_t> packed;  // FIELD_COUNT * rows * cols
    std::string compressed;            // GSB2 payload, see above
};

struct FrameExtras {
    double speed = 1.0;
    std::size_t viewers = 0;
    long long serverTime = 0;      // unix seconds
    std::string events = "[]";     // JSON array of recent injections
    // JSON object with the point-weather HUD readout (temperature, pressure,
    // wind_speed, wind_direction, timestamp), so a viewer needs one socket.
    std::string point = "null";
};

namespace GridCodec {

struct Field {
    const char* name;
    float scale;
    float offset;
    int decimals;  // JSON precision
};

// Precision is finer than anything the UI shows (0.1 °C, hPa, m/s, 0.1 %
// humidity) but no finer: sub-display digits are noise that defeats
// compression. Ranges: T ±3276 °C, P −2276–4276 hPa, U/V ±3276 m/s,
// H 0–32, R ≤327 mm/h, SP ≤3276 — far beyond what the simulation produces.
inline constexpr Field FIELDS[] = {
    {"T", 10.0f, 0.0f, 1},
    {"P", 10.0f, 1000.0f, 1},
    {"U", 10.0f, 0.0f, 1},
    {"V", 10.0f, 0.0f, 1},
    {"H", 1000.0f, 0.0f, 3},
    {"R", 100.0f, 0.0f, 2},
    {"SP", 10.0f, 0.0f, 1},
};
inline constexpr int FIELD_COUNT = static_cast<int>(sizeof(FIELDS) / sizeof(FIELDS[0]));

inline std::int16_t quantize(float value, const Field& field) {
    if (!std::isfinite(value)) return 0;
    const double q = std::round((static_cast<double>(value) - field.offset) * field.scale);
    return static_cast<std::int16_t>(std::clamp(q, -32767.0, 32767.0));
}

// Fixed-point decimal without redundant zeros: 12.50 -> "12.5", 0.00 -> "0".
inline void appendNumber(std::string& out, double value, int decimals) {
    if (!std::isfinite(value)) { out.push_back('0'); return; }
    char buf[48];
    auto res = std::to_chars(buf, buf + sizeof(buf), value, std::chars_format::fixed, decimals);
    if (res.ec != std::errc{}) { out.push_back('0'); return; }
    char* end = res.ptr;
    if (decimals > 0) {
        while (end > buf && end[-1] == '0') --end;
        if (end > buf && end[-1] == '.') --end;
    }
    std::string_view text(buf, static_cast<std::size_t>(end - buf));
    if (text == "-0") text = "0";
    out.append(text);
}

inline constexpr const char* COMPRESSED_ENCODING = "row-delta+byte-shuffle+zlib";

inline std::string headerJson(const GridFrame& frame, const FrameExtras& extras,
                              bool withFields, bool compressed = false) {
    std::string out;
    out.reserve(frame.storms.size() + frame.fronts.size() + extras.events.size() + 512);
    out += "{\"tick\":";
    out += std::to_string(frame.tick);
    out += ",\"cols\":";
    out += std::to_string(frame.cols);
    out += ",\"rows\":";
    out += std::to_string(frame.rows);
    out += ",\"simTime\":";
    appendNumber(out, frame.simTime, 2);
    out += ",\"speed\":";
    appendNumber(out, extras.speed, 2);
    out += ",\"viewers\":";
    out += std::to_string(extras.viewers);
    out += ",\"serverTime\":";
    out += std::to_string(extras.serverTime);
    out += ',';
    out += frame.stats;
    out += ",\"storms\":";
    out += frame.storms;
    out += ",\"fronts\":";
    out += frame.fronts;
    out += ",\"events\":";
    out += extras.events;
    out += ",\"point\":";
    out += extras.point;
    if (withFields) {
        out += ",\"fields\":[";
        for (int f = 0; f < FIELD_COUNT; ++f) {
            if (f) out += ',';
            out += "[\"";
            out += FIELDS[f].name;
            out += "\",";
            appendNumber(out, FIELDS[f].scale, 0);
            out += ',';
            appendNumber(out, FIELDS[f].offset, 0);
            out += ']';
        }
        out += ']';
    }
    if (compressed) {
        out += ",\"encoding\":\"";
        out += COMPRESSED_ENCODING;
        out += '"';
    }
    return out;
}

inline std::string composeJson(const GridFrame& frame, const FrameExtras& extras) {
    std::string out = headerJson(frame, extras, false);
    out.reserve(out.size() + frame.arrays.size() + 2);
    out += ',';
    out += frame.arrays;
    out += '}';
    return out;
}

inline void appendU32(std::string& out, std::uint32_t v) {
    for (int i = 0; i < 4; ++i) out.push_back(static_cast<char>((v >> (8 * i)) & 0xFF));
}

// The GSB2 payload for `packed` (field-major, `fields` blocks of rows × cols).
std::string compressPacked(const std::vector<std::int16_t>& packed, int fields, int rows, int cols);

// Inverse of compressPacked; throws std::runtime_error on malformed input.
std::vector<std::int16_t> decompressPacked(const std::string& payload, int fields, int rows, int cols);

inline std::string composeCompressed(const GridFrame& frame, const FrameExtras& extras) {
    std::string header = headerJson(frame, extras, true, true);
    header += '}';

    std::string out;
    out.reserve(8 + header.size() + 4 + frame.compressed.size());
    out.append("GSB2", 4);
    appendU32(out, static_cast<std::uint32_t>(header.size()));
    out += header;
    while (out.size() % 4 != 0) out.push_back('\0');
    out += frame.compressed;
    return out;
}

inline std::string composeBinary(const GridFrame& frame, const FrameExtras& extras) {
    std::string header = headerJson(frame, extras, true);
    header += '}';

    std::string out;
    out.reserve(8 + header.size() + 4 + frame.packed.size() * 2);
    out.append("GSB1", 4);
    appendU32(out, static_cast<std::uint32_t>(header.size()));
    out += header;
    while (out.size() % 4 != 0) out.push_back('\0');
    for (const std::int16_t q : frame.packed) {
        const auto u = static_cast<std::uint16_t>(q);
        out.push_back(static_cast<char>(u & 0xFF));
        out.push_back(static_cast<char>(u >> 8));
    }
    return out;
}

}  // namespace GridCodec
