cmake_minimum_required(VERSION 3.16)
project(weather_backend CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

find_package(Drogon REQUIRED)

add_executable(weather_backend
    src/main.cc
    src/WeatherSim.cc
    src/WeatherController.cc
    src/SeedController.cc
    src/GridSim.cc
    src/GridController.cc
    src/WeatherProxy.cc
)

# ── Unit tests ────────────────────────────────────────────────────────────────
add_executable(test_gridsim
    src/GridSim.cc
    tests/test_gridsim.cc
)
target_link_libraries(test_gridsim PRIVATE Drogon::Drogon)
target_include_directories(test_gridsim PRIVATE src)

target_link_libraries(weather_backend PRIVATE Drogon::Drogon)
target_include_directories(weather_backend PRIVATE src)

install(TARGETS weather_backend DESTINATION bin)
