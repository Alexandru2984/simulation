#pragma once

#include "OpenWeatherObservation.h"
#include "Security.h"

#include <json/json.h>

#include <cmath>
#include <cstddef>
#include <memory>
#include <string>
#include <utility>

namespace OpenWeatherResponse {

inline bool parseJson(const std::string& body, Json::Value& value) {
    Json::CharReaderBuilder builder;
    builder["collectComments"] = false;
    builder["rejectDupKeys"] = true;
    std::unique_ptr<Json::CharReader> reader(builder.newCharReader());
    std::string errors;
    return reader->parse(body.data(), body.data() + body.size(), &value, &errors);
}

inline std::string compactJson(const Json::Value& value) {
    Json::StreamWriterBuilder builder;
    builder["commentStyle"] = "None";
    builder["indentation"] = "";
    return Json::writeString(builder, value);
}

inline bool boundedString(const Json::Value& value, std::size_t maxBytes,
                          std::string& output) {
    if (!value.isString()) return false;
    auto text = value.asString();
    if (text.empty() || text.size() > maxBytes) return false;
    output = std::move(text);
    return true;
}

inline bool normalizeRealtime(const std::string& body, std::string& normalized) {
    Json::Value input;
    if (!parseJson(body, input) || !input.isObject()) return false;

    OpenWeatherObservation observation;
    if (!parseOpenWeatherObservation(input, observation)) return false;

    Json::Value output(Json::objectValue);
    output["main"]["temp"] = observation.temperature;
    output["main"]["pressure"] = observation.pressure;
    output["main"]["humidity"] = observation.humidity;
    output["wind"]["speed"] = observation.windSpeed;
    output["wind"]["deg"] = observation.windDirection;

    const auto& feelsLike = input["main"]["feels_like"];
    if (feelsLike.isNumeric() &&
        Security::finiteInRange(feelsLike.asDouble(), -120.0, 80.0)) {
        output["main"]["feels_like"] = feelsLike.asDouble();
    } else {
        output["main"]["feels_like"] = observation.temperature;
    }

    if (!observation.city.empty()) output["name"] = observation.city;

    std::string country;
    if (input["sys"].isObject() &&
        boundedString(input["sys"]["country"], 8, country)) {
        output["sys"]["country"] = country;
    }

    const auto& visibility = input["visibility"];
    if (visibility.isNumeric() &&
        Security::finiteInRange(visibility.asDouble(), 0.0, 100000.0)) {
        output["visibility"] = visibility.asDouble();
    }

    if (input["weather"].isArray() && !input["weather"].empty() &&
        input["weather"][0].isObject()) {
        const auto& weather = input["weather"][0];
        Json::Value item(Json::objectValue);
        if (weather["id"].isInt() && weather["id"].asInt() >= 0 &&
            weather["id"].asInt() <= 999) {
            item["id"] = weather["id"].asInt();
        }
        std::string description;
        if (boundedString(weather["description"], 128, description))
            item["description"] = description;
        if (!item.empty()) output["weather"].append(std::move(item));
    }

    normalized = compactJson(output);
    return true;
}

inline bool normalizeSearch(const std::string& body, std::string& normalized) {
    Json::Value input;
    if (!parseJson(body, input) || !input.isArray()) return false;

    Json::Value output(Json::arrayValue);
    for (const auto& candidate : input) {
        if (output.size() >= 5) break;
        if (!candidate.isObject()) continue;

        std::string name;
        std::string country;
        if (!boundedString(candidate["name"], 128, name) ||
            !boundedString(candidate["country"], 8, country) ||
            !candidate["lat"].isNumeric() || !candidate["lon"].isNumeric()) {
            continue;
        }

        const double lat = candidate["lat"].asDouble();
        const double lon = candidate["lon"].asDouble();
        if (!Security::finiteInRange(lat, -90.0, 90.0) ||
            !Security::finiteInRange(lon, -180.0, 180.0)) {
            continue;
        }

        Json::Value item(Json::objectValue);
        item["name"] = name;
        item["country"] = country;
        item["lat"] = lat;
        item["lon"] = lon;

        if (candidate.isMember("state")) {
            std::string state;
            if (boundedString(candidate["state"], 128, state)) item["state"] = state;
        }
        output.append(std::move(item));
    }

    normalized = compactJson(output);
    return true;
}

}  // namespace OpenWeatherResponse
