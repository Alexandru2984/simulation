cmake_minimum_required(VERSION 3.16)
project(weather_backend CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

find_package(Drogon REQUIRED)
find_package(Git QUIET)

set(SIM_BUILD_GIT_SHA "unknown")
set(SIM_BUILD_GIT_DIRTY "null")
if(GIT_FOUND AND EXISTS "${CMAKE_SOURCE_DIR}/../.git")
    execute_process(
        COMMAND "${GIT_EXECUTABLE}" rev-parse --short=12 HEAD
        WORKING_DIRECTORY "${CMAKE_SOURCE_DIR}/.."
        OUTPUT_VARIABLE SIM_BUILD_GIT_SHA
        OUTPUT_STRIP_TRAILING_WHITESPACE
        ERROR_QUIET
    )
    execute_process(
        COMMAND "${GIT_EXECUTABLE}" diff --quiet --ignore-submodules HEAD
        WORKING_DIRECTORY "${CMAKE_SOURCE_DIR}/.."
        RESULT_VARIABLE SIM_BUILD_GIT_DIFF_RESULT
        OUTPUT_QUIET
        ERROR_QUIET
    )
    if(SIM_BUILD_GIT_DIFF_RESULT EQUAL 0)
        set(SIM_BUILD_GIT_DIRTY "false")
    else()
        set(SIM_BUILD_GIT_DIRTY "true")
    endif()
endif()
string(TIMESTAMP SIM_BUILD_TIME_UTC "%Y-%m-%dT%H:%M:%SZ" UTC)

add_executable(weather_backend
    src/main.cc
    src/WeatherSim.cc
    src/WeatherController.cc
    src/SeedController.cc
    src/HealthController.cc
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
target_compile_definitions(test_gridsim PRIVATE GRID_SIM_TESTING)

target_link_libraries(weather_backend PRIVATE Drogon::Drogon)
target_include_directories(weather_backend PRIVATE src)
target_compile_definitions(weather_backend PRIVATE
    SIM_BUILD_GIT_SHA="${SIM_BUILD_GIT_SHA}"
    SIM_BUILD_GIT_DIRTY=${SIM_BUILD_GIT_DIRTY}
    SIM_BUILD_TIME_UTC="${SIM_BUILD_TIME_UTC}"
)

install(TARGETS weather_backend DESTINATION bin)
