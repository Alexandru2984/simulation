#pragma once

// Shared micro test framework — no external dependencies, just throw + report.
#include <cstdio>
#include <stdexcept>
#include <string>

inline int passed = 0, failed = 0;

#define TEST(name) void test_##name()
#define RUN(name)  do { \
    try { test_##name(); printf("  PASS  " #name "\n"); passed++; } \
    catch (const std::exception& e) { printf("  FAIL  " #name " — %s\n", e.what()); failed++; } \
    catch (...) { printf("  FAIL  " #name " — unknown exception\n"); failed++; } \
} while(0)

inline void require(bool cond, const char* msg) {
    if (!cond) throw std::runtime_error(msg);
}
