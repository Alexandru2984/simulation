#pragma once

#include "GridCodec.h"

#include <cstdint>
#include <deque>
#include <mutex>
#include <string>

// Recent user-injected events, shared with every viewer so the shared world
// shows who changed what. Only fixed event-type identifiers are stored, so the
// JSON needs no string escaping.
class EventLog {
public:
    static constexpr std::size_t CAPACITY = 12;

    static EventLog& instance() {
        static EventLog log;
        return log;
    }

    void record(const char* type, float lat, float lon, float intensity,
                long long unixSeconds) {
        std::lock_guard<std::mutex> lk(mtx_);
        entries_.push_front(Entry{++nextId_, type, lat, lon, intensity, unixSeconds});
        if (entries_.size() > CAPACITY) entries_.pop_back();
    }

    // Newest first; entries older than maxAgeSeconds are omitted.
    std::string json(long long nowUnix, long long maxAgeSeconds = 900) const {
        std::lock_guard<std::mutex> lk(mtx_);
        std::string out = "[";
        for (const Entry& e : entries_) {
            if (nowUnix - e.unixSeconds > maxAgeSeconds) continue;
            if (out.size() > 1) out += ',';
            out += "{\"id\":";
            out += std::to_string(e.id);
            out += ",\"type\":\"";
            out += e.type;
            out += "\",\"lat\":";
            GridCodec::appendNumber(out, e.lat, 1);
            out += ",\"lon\":";
            GridCodec::appendNumber(out, e.lon, 1);
            out += ",\"intensity\":";
            GridCodec::appendNumber(out, e.intensity, 2);
            out += ",\"time\":";
            out += std::to_string(e.unixSeconds);
            out += '}';
        }
        out += ']';
        return out;
    }

    void clearForTesting() {
        std::lock_guard<std::mutex> lk(mtx_);
        entries_.clear();
    }

private:
    struct Entry {
        std::uint64_t id;
        const char* type;  // static string literal
        float lat, lon, intensity;
        long long unixSeconds;
    };

    EventLog() = default;

    mutable std::mutex mtx_;
    std::deque<Entry> entries_;
    std::uint64_t nextId_ = 0;
};
