// Unit tests for the Security helpers and the global rate limiter
#include "Security.h"
#include "RateLimiter.h"
#include "OpenWeatherObservation.h"
#include "OpenWeatherResponse.h"
#include "test_framework.h"
#include <limits>

// ── Content type ──────────────────────────────────────────────────────────────

TEST(json_content_type_accepted) {
    require(Security::isJsonContentType("application/json"),
            "plain application/json must pass");
    require(Security::isJsonContentType("application/json; charset=utf-8"),
            "json with charset parameter must pass");
    require(Security::isJsonContentType(" Application/JSON ; charset=utf-8"),
            "media type matching must be case-insensitive and tolerate OWS");
}

TEST(non_json_content_type_rejected) {
    require(!Security::isJsonContentType(""), "empty content type must fail");
    require(!Security::isJsonContentType("text/plain"), "text/plain must fail");
    require(!Security::isJsonContentType("application/jso"), "truncated type must fail");
    require(!Security::isJsonContentType("json"), "bare json must fail");
    require(!Security::isJsonContentType("text/json"), "text/json must fail");
    require(!Security::isJsonContentType("application/jsonp"), "jsonp prefix must fail");
    require(!Security::isJsonContentType("application/json-evil"),
            "extended json media type must fail");
    require(!Security::isJsonContentType("application/json,text/plain"),
            "multiple content types must fail");
}

TEST(strict_number_parsing) {
    double number = 0.0;
    require(Security::parseFiniteDouble("44.43", number) &&
                std::abs(number - 44.43) < 1e-9,
            "decimal value must parse");
    require(Security::parseFiniteDouble("-1.2e2", number) && number == -120.0,
            "scientific notation must parse");
    require(!Security::parseFiniteDouble("44junk", number),
            "numeric prefix with trailing junk must fail");
    require(!Security::parseFiniteDouble("nan", number), "NaN text must fail");
    require(!Security::parseFiniteDouble("inf", number), "infinity text must fail");
    require(!Security::parseFiniteDouble("", number), "empty number must fail");

    int integer = 0;
    require(Security::parseIntInRange("30", 1, 120, integer) && integer == 30,
            "bounded integer must parse");
    require(!Security::parseIntInRange("30junk", 1, 120, integer),
            "integer suffix must fail");
    require(!Security::parseIntInRange("0", 1, 120, integer),
            "integer below range must fail");
    require(!Security::parseIntInRange("121", 1, 120, integer),
            "integer above range must fail");
    require(Security::parseIntInRange("65535", 1, 65535, integer) &&
                integer == 65535,
            "maximum TCP port must parse");
    require(!Security::parseIntInRange("65536", 1, 65535, integer),
            "port above range must fail");
}

// ── Origin ────────────────────────────────────────────────────────────────────

TEST(strict_origin_match) {
    const char* allowed = "https://simulation.micutu.com";
    require(Security::originAllowed(allowed, allowed), "exact origin must pass");
    require(!Security::originAllowed("", allowed), "missing origin must fail");
    require(!Security::originAllowed("https://evil.example", allowed),
            "foreign origin must fail");
    require(!Security::originAllowed("https://simulation.micutu.com.evil.example",
                                     allowed),
            "prefix-spoofed origin must fail");
    require(!Security::originAllowed("http://simulation.micutu.com", allowed),
            "http downgrade origin must fail");
}

TEST(finite_ranges_reject_special_values) {
    require(Security::finiteInRange(0.0, -1.0, 1.0), "finite value in range must pass");
    require(Security::finiteInRange(-1.0, -1.0, 1.0), "inclusive lower bound must pass");
    require(Security::finiteInRange(1.0, -1.0, 1.0), "inclusive upper bound must pass");
    require(!Security::finiteInRange(2.0, -1.0, 1.0), "out-of-range value must fail");
    require(!Security::finiteInRange(std::numeric_limits<double>::quiet_NaN(), -1.0, 1.0),
            "NaN must fail");
    require(!Security::finiteInRange(std::numeric_limits<double>::infinity(), -1.0, 1.0),
            "positive infinity must fail");
    require(!Security::finiteInRange(-std::numeric_limits<double>::infinity(), -1.0, 1.0),
            "negative infinity must fail");
}

TEST(openweather_observation_validation) {
    Json::Value json;
    json["main"]["temp"] = 18.5;
    json["main"]["pressure"] = 1012.0;
    json["main"]["humidity"] = 72.0;
    json["wind"]["speed"] = 4.5;
    json["wind"]["deg"] = 225.0;
    json["name"] = "Bucharest";

    OpenWeatherObservation observation;
    require(parseOpenWeatherObservation(json, observation),
            "valid OWM observation must parse");
    require(std::abs(observation.temperature - 18.5) < 1e-9,
            "temperature must be preserved");
    require(observation.city == "Bucharest", "bounded city name must be preserved");

    Json::Value missingHumidity = json;
    missingHumidity["main"].removeMember("humidity");
    require(!parseOpenWeatherObservation(missingHumidity, observation),
            "missing humidity must fail");

    Json::Value invalidWind = json;
    invalidWind["wind"]["speed"] = std::numeric_limits<double>::infinity();
    require(!parseOpenWeatherObservation(invalidWind, observation),
            "non-finite wind must fail");

    Json::Value invalidPressure = json;
    invalidPressure["main"]["pressure"] = 5000.0;
    require(!parseOpenWeatherObservation(invalidPressure, observation),
            "out-of-range pressure must fail");

    Json::Value noDirection = json;
    noDirection["wind"].removeMember("deg");
    require(parseOpenWeatherObservation(noDirection, observation) &&
                observation.windDirection == 0.0,
            "missing wind direction must use the zero-degree fallback");
}

TEST(openweather_realtime_response_normalization) {
    const std::string raw = R"({
        "main":{"temp":18.5,"feels_like":17.2,"pressure":1012,"humidity":72},
        "wind":{"speed":4.5,"deg":225},
        "weather":[{"id":803,"main":"Clouds","description":"broken clouds","icon":"04d"}],
        "sys":{"country":"RO","sunrise":123},
        "name":"Bucharest","visibility":10000,
        "coord":{"lat":44.43,"lon":26.10},"internal":"discard me"
    })";

    std::string normalized;
    require(OpenWeatherResponse::normalizeRealtime(raw, normalized),
            "valid realtime payload must normalize");

    Json::Value output;
    require(OpenWeatherResponse::parseJson(normalized, output),
            "normalized realtime payload must remain JSON");
    require(output["main"]["temp"].asDouble() == 18.5,
            "temperature must be preserved");
    require(output["weather"][0]["id"].asInt() == 803,
            "weather condition must be preserved");
    require(!output.isMember("coord") && !output.isMember("internal"),
            "unused upstream fields must be discarded");

    std::string ignored;
    require(!OpenWeatherResponse::normalizeRealtime("{\"main\":{}}", ignored),
            "malformed realtime schema must fail closed");
    require(!OpenWeatherResponse::normalizeRealtime("not-json", ignored),
            "invalid realtime JSON must fail closed");
}

TEST(openweather_search_response_normalization) {
    const std::string raw = R"([
        {"name":"Bucharest","lat":44.4323,"lon":26.1063,"country":"RO","state":"București","local_names":{"x":"discard"}},
        {"name":"Bad latitude","lat":999,"lon":10,"country":"RO"},
        {"name":"Wrong type","lat":"44","lon":26,"country":"RO"},
        {"name":"London","lat":51.5072,"lon":-0.1276,"country":"GB"}
    ])";

    std::string normalized;
    require(OpenWeatherResponse::normalizeSearch(raw, normalized),
            "search array must normalize");

    Json::Value output;
    require(OpenWeatherResponse::parseJson(normalized, output),
            "normalized search payload must remain JSON");
    require(output.isArray() && output.size() == 2,
            "invalid search entries must be discarded");
    require(output[0]["name"].asString() == "Bucharest" &&
                output[1]["name"].asString() == "London",
            "valid search entries must keep their order");
    require(!output[0].isMember("local_names"),
            "unused search fields must be discarded");

    std::string ignored;
    require(!OpenWeatherResponse::normalizeSearch("{}", ignored),
            "non-array search response must fail closed");
}

// ── Rate limiter ──────────────────────────────────────────────────────────────

TEST(limiter_allows_burst_then_blocks) {
    RateLimiter lim(60.0, 5.0);
    for (int i = 0; i < 5; i++)
        require(lim.allowAt(100.0), "burst request must be allowed");
    require(!lim.allowAt(100.0), "request beyond burst must be blocked");
}

TEST(limiter_refills_over_time) {
    RateLimiter lim(60.0, 5.0);  // 1 token/s
    for (int i = 0; i < 5; i++) lim.allowAt(100.0);
    require(!lim.allowAt(100.0), "bucket must start empty after burst");
    require(lim.allowAt(101.05), "one token must be back after ~1s");
    require(!lim.allowAt(101.05), "only one token must have refilled");
    require(lim.allowAt(200.0), "long idle must refill the bucket");
}

TEST(limiter_caps_refill_at_burst) {
    RateLimiter lim(600.0, 3.0);
    lim.allowAt(0.0);
    // Hours of idle must not accumulate more than the burst
    require(lim.allowAt(10000.0), "token 1 after idle");
    require(lim.allowAt(10000.0), "token 2 after idle");
    require(lim.allowAt(10000.0), "token 3 after idle");
    require(!lim.allowAt(10000.0), "burst cap must hold after long idle");
}

TEST(limiter_tolerates_time_going_backwards) {
    RateLimiter lim(60.0, 2.0);
    require(lim.allowAt(100.0), "first request must pass");
    require(lim.allowAt(50.0), "older timestamp must not break the limiter");
    require(!lim.allowAt(50.0), "bucket must be empty after two");
}

int main() {
    printf("\n=== Security Unit Tests ===\n\n");

    RUN(json_content_type_accepted);
    RUN(non_json_content_type_rejected);
    RUN(strict_number_parsing);
    RUN(strict_origin_match);
    RUN(finite_ranges_reject_special_values);
    RUN(openweather_observation_validation);
    RUN(openweather_realtime_response_normalization);
    RUN(openweather_search_response_normalization);
    RUN(limiter_allows_burst_then_blocks);
    RUN(limiter_refills_over_time);
    RUN(limiter_caps_refill_at_burst);
    RUN(limiter_tolerates_time_going_backwards);

    printf("\n=== %d passed, %d failed ===\n\n", passed, failed);
    return failed > 0 ? 1 : 0;
}
