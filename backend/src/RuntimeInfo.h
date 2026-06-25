#pragma once

#include <chrono>

#ifndef SIM_BUILD_GIT_SHA
#define SIM_BUILD_GIT_SHA "unknown"
#endif

#ifndef SIM_BUILD_GIT_DIRTY
#define SIM_BUILD_GIT_DIRTY null
#endif

#ifndef SIM_BUILD_TIME_UTC
#define SIM_BUILD_TIME_UTC "unknown"
#endif

namespace RuntimeInfo {

inline const auto START_TIME = std::chrono::steady_clock::now();

inline long long uptimeSeconds() {
    return std::chrono::duration_cast<std::chrono::seconds>(
        std::chrono::steady_clock::now() - START_TIME).count();
}

inline const char* buildGitSha() {
    return SIM_BUILD_GIT_SHA;
}

inline const char* buildTimeUtc() {
    return SIM_BUILD_TIME_UTC;
}

inline const char* buildGitDirtyJson() {
#define STRINGIFY_VALUE(x) #x
#define STRINGIFY(x) STRINGIFY_VALUE(x)
    return STRINGIFY(SIM_BUILD_GIT_DIRTY);
#undef STRINGIFY
#undef STRINGIFY_VALUE
}

}  // namespace RuntimeInfo
