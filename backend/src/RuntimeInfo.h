#pragma once

#include <chrono>

namespace RuntimeInfo {

inline const auto START_TIME = std::chrono::steady_clock::now();

inline long long uptimeSeconds() {
    return std::chrono::duration_cast<std::chrono::seconds>(
        std::chrono::steady_clock::now() - START_TIME).count();
}

}  // namespace RuntimeInfo
