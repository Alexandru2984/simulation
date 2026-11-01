#pragma once

#include <algorithm>
#include <chrono>
#include <cstddef>
#include <mutex>
#include <optional>
#include <string>
#include <unordered_map>

// Bounded, thread-safe string cache with per-entry expiry. Keys can contain
// user input, so the entry count is capped: when full, the entry closest to
// expiry is evicted first.
class TtlCache {
public:
    using Clock = std::chrono::steady_clock;

    explicit TtlCache(std::size_t maxEntries) : maxEntries_(maxEntries) {}

    std::optional<std::string> get(const std::string& key,
                                   Clock::time_point now = Clock::now()) {
        std::lock_guard<std::mutex> lk(mtx_);
        const auto it = entries_.find(key);
        if (it == entries_.end()) return std::nullopt;
        if (now >= it->second.expires) {
            entries_.erase(it);
            return std::nullopt;
        }
        return it->second.body;
    }

    void put(const std::string& key, std::string body, std::chrono::seconds ttl,
             Clock::time_point now = Clock::now()) {
        if (maxEntries_ == 0) return;
        std::lock_guard<std::mutex> lk(mtx_);
        for (auto it = entries_.begin(); it != entries_.end();) {
            if (it->second.expires <= now) it = entries_.erase(it);
            else ++it;
        }
        if (entries_.find(key) == entries_.end() && entries_.size() >= maxEntries_) {
            const auto oldest = std::min_element(
                entries_.begin(), entries_.end(),
                [](const auto& lhs, const auto& rhs) {
                    return lhs.second.expires < rhs.second.expires;
                });
            entries_.erase(oldest);
        }
        entries_[key] = Entry{std::move(body), now + ttl};
    }

    std::size_t size() const {
        std::lock_guard<std::mutex> lk(mtx_);
        return entries_.size();
    }

private:
    struct Entry {
        std::string body;
        Clock::time_point expires;
    };

    const std::size_t maxEntries_;
    mutable std::mutex mtx_;
    std::unordered_map<std::string, Entry> entries_;
};
