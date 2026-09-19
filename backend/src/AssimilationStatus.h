#pragma once

#include <atomic>
#include <chrono>
#include <cstdint>

class AssimilationStatus {
public:
    static AssimilationStatus& instance() {
        static AssimilationStatus status;
        return status;
    }

    void markAttempt() { lastAttemptUnix_.store(nowUnix()); }

    void recordAccepted() {
        accepted_.fetch_add(1);
        lastSuccessUnix_.store(nowUnix());
    }

    void recordUpstreamFailure() { upstreamFailures_.fetch_add(1); }
    void recordValidationFailure() { validationFailures_.fetch_add(1); }

    std::int64_t lastAttemptUnix() const { return lastAttemptUnix_.load(); }
    std::int64_t lastSuccessUnix() const { return lastSuccessUnix_.load(); }
    std::uint64_t accepted() const { return accepted_.load(); }
    std::uint64_t upstreamFailures() const { return upstreamFailures_.load(); }
    std::uint64_t validationFailures() const { return validationFailures_.load(); }

private:
    static std::int64_t nowUnix() {
        return std::chrono::duration_cast<std::chrono::seconds>(
            std::chrono::system_clock::now().time_since_epoch()).count();
    }

    AssimilationStatus() = default;

    std::atomic<std::int64_t> lastAttemptUnix_{0};
    std::atomic<std::int64_t> lastSuccessUnix_{0};
    std::atomic<std::uint64_t> accepted_{0};
    std::atomic<std::uint64_t> upstreamFailures_{0};
    std::atomic<std::uint64_t> validationFailures_{0};
};
