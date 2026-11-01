#pragma once

#include "Security.h"
#include <json/json.h>
#include <cmath>
#include <string>
#include <utility>

struct OpenWeatherObservation {
    double temperature = 0.0;
    double pressure = 0.0;
    double humidity = 0.0;
    double windSpeed = 0.0;
    double windDirection = 0.0;
    std::string city;
};

inline bool parseOpenWeatherObservation(const Json::Value& json,
                                        OpenWeatherObservation& observation) {
    const auto& main = json["main"];
    const auto& wind = json["wind"];
    if (!main.isObject() || !wind.isObject() ||
        !main["temp"].isNumeric() || !main["pressure"].isNumeric() ||
        !main["humidity"].isNumeric() || !wind["speed"].isNumeric() ||
        (wind.isMember("deg") && !wind["deg"].isNumeric())) {
        return false;
    }

    OpenWeatherObservation parsed;
    parsed.temperature = main["temp"].asDouble();
    parsed.pressure = main["pressure"].asDouble();
    parsed.humidity = main["humidity"].asDouble();
    parsed.windSpeed = wind["speed"].asDouble();
    parsed.windDirection = wind.isMember("deg") ? wind["deg"].asDouble() : 0.0;

    if (!Security::finiteInRange(parsed.temperature, -100.0, 70.0) ||
        !Security::finiteInRange(parsed.pressure, 800.0, 1200.0) ||
        !Security::finiteInRange(parsed.humidity, 0.0, 100.0) ||
        !Security::finiteInRange(parsed.windSpeed, 0.0, 150.0) ||
        !Security::finiteInRange(parsed.windDirection, 0.0, 360.0)) {
        return false;
    }

    if (json["name"].isString() && json["name"].asString().size() <= 128)
        parsed.city = json["name"].asString();

    observation = std::move(parsed);
    return true;
}

// Meteorological wind direction is where the wind blows FROM, clockwise from
// north. Grid components are U = eastward and V = northward motion, so a
// northerly (0°) wind moves south: U = 0, V = -speed.
inline void windComponents(double speed, double fromDegrees, float& U, float& V) {
    constexpr double PI = 3.14159265358979323846;
    const double radians = fromDegrees * PI / 180.0;
    U = static_cast<float>(-speed * std::sin(radians));
    V = static_cast<float>(-speed * std::cos(radians));
}
