#pragma once

#include <algorithm>
#include <chrono>
#include <mutex>

// Global token bucket — defense-in-depth behind nginx's per-IP rate limits,
// so distributed clients can't grief the shared simulation state.
class RateLimiter {
public:
    RateLimiter(double tokensPerMinute, double burst)
        : ratePerSec_(tokensPerMinute / 60.0), burst_(burst), tokens_(burst) {}

    bool allow() {
        return allowAt(std::chrono::duration<double>(
            std::chrono::steady_clock::now().time_since_epoch()).count());
    }

    // Deterministic core, exposed for tests. `nowSeconds` should be monotonic;
    // a timestamp older than the last one refills nothing.
    bool allowAt(double nowSeconds) {
        std::lock_guard<std::mutex> lk(mtx_);
        if (last_ < 0.0 || nowSeconds < last_) last_ = nowSeconds;
        tokens_ = std::min(burst_, tokens_ + (nowSeconds - last_) * ratePerSec_);
        last_   = nowSeconds;
        if (tokens_ < 1.0) return false;
        tokens_ -= 1.0;
        return true;
    }

private:
    std::mutex  mtx_;
    const double ratePerSec_;
    const double burst_;
    double tokens_;
    double last_{-1.0};
};
