// Unit tests for the Security helpers and the global rate limiter
#include "Security.h"
#include "ClientErrors.h"
#include "RateLimiter.h"
#include "OpenWeatherObservation.h"
#include "OpenWeatherResponse.h"
#include "OpenWeatherClient.h"
#include "TtlCache.h"
#include "test_framework.h"
#include <cmath>
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


// ── Secrets, search text and cache ───────────────────────────────────────────

TEST(constant_time_token_compare) {
    require(Security::constantTimeEquals("s3cret-token", "s3cret-token"),
            "identical tokens must match");
    require(!Security::constantTimeEquals("s3cret-token", "s3cret-tokeN"),
            "last-byte difference must fail");
    require(!Security::constantTimeEquals("s3cret", "s3cret-token"),
            "prefix of the token must fail");
    require(!Security::constantTimeEquals("", "s3cret-token"), "empty header must fail");
    require(Security::constantTimeEquals("", ""), "two empty strings are equal");
}

TEST(search_query_keeps_international_names) {
    std::string out;
    require(Security::normalizeSearchQuery("Bucure\xC8\x99ti", out) &&
                out == "bucure\xC8\x99ti",
            "Romanian comma-below s must survive");
    require(Security::normalizeSearchQuery("S\xC3\xA3o Paulo, BR", out) &&
                out == "s\xC3\xA3o paulo, br",
            "accented Latin plus country suffix must survive");
    require(Security::normalizeSearchQuery("\xD0\x9C\xD0\xBE\xD1\x81\xD0\xBA\xD0\xB2\xD0\xB0", out),
            "Cyrillic must survive");
    require(Security::normalizeSearchQuery("\xE6\x9D\xB1\xE4\xBA\xAC", out),
            "two CJK characters must be enough");
    require(Security::normalizeSearchQuery("  New   York  ", out) && out == "new york",
            "whitespace must collapse and trim");
    require(Security::normalizeSearchQuery("N\xE2\x80\x99" "Djamena", out),
            "curly apostrophe must be accepted");
    require(Security::normalizeSearchQuery("St. John's", out) && out == "st. john's",
            "ASCII apostrophe and period must be accepted");
    require(Security::normalizeSearchQuery("Frankfurt (Oder)", out) && out == "frankfurt oder",
            "parentheses must separate words, not fail");
    require(Security::normalizeSearchQuery("Halle/Saale", out) && out == "halle saale",
            "a slash must separate words");
    require(Security::normalizeSearchQuery("Trinidad & Tobago", out) && out == "trinidad tobago",
            "an ampersand must separate words");
    std::string cjk;
    for (int i = 0; i < 100; ++i) cjk += "\xE6\x9D\xB1";
    require(Security::normalizeSearchQuery(cjk, out) && out.size() == 300,
            "100 CJK characters (the search box limit) must be accepted");
}

TEST(search_query_rejects_syntax_and_invalid_utf8) {
    std::string out;
    require(!Security::normalizeSearchQuery("", out), "empty query must fail");
    require(!Security::normalizeSearchQuery("a", out), "single letter must fail");
    require(!Security::normalizeSearchQuery("--", out), "punctuation only must fail");
    require(!Security::normalizeSearchQuery("paris&appid=x", out), "query syntax must fail");
    require(!Security::normalizeSearchQuery("paris\nlondon", out), "newline must fail");
    require(!Security::normalizeSearchQuery("pa%72is", out), "percent escapes must fail");
    require(!Security::normalizeSearchQuery("caf\xC3", out), "truncated UTF-8 must fail");
    require(!Security::normalizeSearchQuery("\xC0\xAF" "ab", out), "overlong encoding must fail");
    require(!Security::normalizeSearchQuery("\xED\xA0\x80" "ab", out), "surrogate must fail");
    require(!Security::normalizeSearchQuery("pa\xE2\x80\x8Bris", out),
            "zero-width space must fail");
    require(!Security::normalizeSearchQuery("ab\xE2\x80\xAE" "cd", out),
            "bidi override must fail");
    require(!Security::normalizeSearchQuery(std::string(301, 'a'), out),
            "query above 300 bytes must fail");
    require(!Security::normalizeSearchQuery("<<script>>", out), "markup must fail");
    require(!Security::normalizeSearchQuery("paris?x=1", out), "URL syntax must fail");
    require(!Security::normalizeSearchQuery("(&)/!", out), "separators only must fail");
}

TEST(percent_encoding_is_strict) {
    require(Security::percentEncode("new york") == "new%20york", "space must be %20");
    require(Security::percentEncode("a&b=c?d#e+f") == "a%26b%3Dc%3Fd%23e%2Bf",
            "query delimiters must be escaped");
    require(Security::percentEncode("\xC8\x99") == "%C8%99", "UTF-8 bytes must be escaped");
    require(Security::percentEncode("Az09-._~") == "Az09-._~", "unreserved stays literal");
}

TEST(rounded_coordinates_share_cache_entries) {
    require(OpenWeather::roundedCoordinate(44.4268) == "44.43", "rounds to 2 decimals");
    require(OpenWeather::roundedCoordinate(-0.001) == "0.00", "negative zero is folded");
    require(OpenWeather::roundedCoordinate(-122.4194) == "-122.42", "negative keeps sign");
}

TEST(ttl_cache_expires_and_stays_bounded) {
    using namespace std::chrono;
    const auto t0 = TtlCache::Clock::time_point{} + hours(1);
    TtlCache cache(2);
    cache.put("a", "1", seconds(10), t0);
    cache.put("b", "2", seconds(20), t0);
    require(cache.get("a", t0 + seconds(5)).value_or("") == "1", "fresh entry is served");
    require(!cache.get("a", t0 + seconds(10)), "entry expires at its deadline");
    cache.put("c", "3", seconds(30), t0);
    cache.put("d", "4", seconds(40), t0);
    require(cache.size() == 2, "cache must never exceed its cap");
    require(!cache.get("b", t0) && cache.get("d", t0), "soonest-expiring entry is evicted");
}

TEST(wind_direction_uses_meteorological_convention) {
    float U = 0, V = 0;
    windComponents(10.0, 0.0, U, V);    // northerly: blows toward the south
    require(std::fabs(U) < 1e-4f && std::fabs(V + 10.0f) < 1e-4f, "0 deg must move south");
    windComponents(10.0, 270.0, U, V);  // westerly: blows toward the east
    require(std::fabs(U - 10.0f) < 1e-4f && std::fabs(V) < 1e-4f, "270 deg must move east");
    windComponents(10.0, 90.0, U, V);   // easterly trade wind: blows west
    require(std::fabs(U + 10.0f) < 1e-4f, "90 deg must move west");
}

TEST(error_bodies_follow_the_contract) {
    require(Security::errorBody("rate_limited") == R"({"error":"rate_limited"})",
            "code only");
    require(Security::errorBody("out_of_range", "value must be between 0.5 and 50") ==
            R"({"error":"out_of_range","message":"value must be between 0.5 and 50"})",
            "code plus message");
    require(Security::errorBody("x", "say \"hi\"\n") == R"({"error":"x","message":"say \"hi\"\n"})",
            "messages are escaped");
}

// ── Client error reports ──────────────────────────────────────────────────────

static const char* ORIGIN = "https://simulation.micutu.com";

TEST(client_error_report_is_parsed_and_scrubbed) {
    ClientErrors::Report r;
    require(ClientErrors::parseReport(
        R"({"kind":"error","message":"  TypeError: x is undefined\n","stack":"at f (/assets/a.js:1:2)\nat g","source":"https://simulation.micutu.com/assets/index-AbC.js?v=1#lat=44","line":12,"col":7,"build":"index-AbC","extra":"ignored"})",
        ORIGIN, r), "a well-formed report is accepted");
    require(r.kind == "error", "kind kept");
    require(r.message == "TypeError: x is undefined", "message trimmed, newline removed");
    require(r.stack == "at f (/assets/a.js:1:2)\nat g", "stack keeps its lines");
    require(r.source == "/assets/index-AbC.js", "source reduced to a path without query or hash");
    require(r.line == 12 && r.col == 7 && r.build == "index-AbC", "position and build kept");
}

TEST(client_error_report_rejects_malformed_input) {
    ClientErrors::Report r;
    const char* bad[] = {
        "", "[]", "not json", R"({"message":"m"})",
        R"({"kind":"other","message":"m"})",
        R"({"kind":"error"})",
        R"({"kind":"error","message":"   "})",
        R"({"kind":"error","message":7})",
        R"({"kind":"error","message":"m","line":-1})",
        R"({"kind":"error","message":"m","line":1.5})",
        R"({"kind":"error","message":"m","col":"3"})",
        R"({"kind":"error","message":"m","stack":["a"]})",
        R"({"kind":"error","message":"m","build":"../../etc"})",
        R"({"kind":"error","message":"m","kind":"error"})",
        R"({"kind":"error","message":"m","a":{"b":{"c":{"d":{"e":{"f":{"g":{"h":{"i":1}}}}}}}}})",
    };
    for (const char* body : bad)
        require(!ClientErrors::parseReport(body, ORIGIN, r), body);
    const std::string huge = std::string(R"({"kind":"error","message":")") +
                             std::string(9000, 'a') + "\"}";
    require(!ClientErrors::parseReport(huge, ORIGIN, r), "bodies over 8 KiB are refused");
}

TEST(client_error_text_cannot_forge_log_lines) {
    // Newlines, carriage returns, bidi overrides, zero-width characters and
    // invalid UTF-8 never reach the log as such.
    const auto msg = ClientErrors::cleanText(
        "a\r\nfake_line\x1b[31m\xE2\x80\xAE" "evil\xE2\x80\x8B\xFF", 300, false);
    require(msg.find('\n') == std::string::npos && msg.find('\r') == std::string::npos,
            "no line breaks in a message");
    require(msg.find('\x1b') == std::string::npos, "no terminal escapes");
    require(msg.find("\xE2\x80\xAE") == std::string::npos, "no bidi override");
    require(msg.find("\xE2\x80\x8B") == std::string::npos, "no zero-width space");
    require(msg.find("\xEF\xBF\xBD") != std::string::npos, "invalid UTF-8 becomes U+FFFD");

    ClientErrors::Report r;
    r.kind = "error";
    r.message = "line one\nline two \xC8\x99";  // ș
    ClientErrors::Decision d;
    d.fingerprint = "f";
    d.count = 1;
    const auto line = ClientErrors::logLine(r, d, "UA\nInjected", "abc");
    require(line.rfind("client_error {", 0) == 0, "log line has a fixed prefix");
    require(line.find('\n') == std::string::npos, "one physical line");
    for (const unsigned char c : line) require(c >= 0x20 && c < 0x7F, "log line is printable ASCII");
}

TEST(client_error_text_truncates_on_character_boundaries) {
    const std::string s = ClientErrors::cleanText(std::string(200, 'x') + std::string(100, '\xC8') , 50, false);
    require(s.size() <= 53, "bounded");
    std::string ro;
    for (int i = 0; i < 40; ++i) ro += "\xC8\x99";  // 80 bytes of "ș"
    const auto t = ClientErrors::cleanText(ro, 11, false);
    require(t == "\xC8\x99\xC8\x99\xC8\x99\xC8\x99\xC8\x99\xE2\x80\xA6", "cut between characters, then …");
}

TEST(client_error_sources_are_paths_on_this_site) {
    using ClientErrors::cleanSource;
    require(cleanSource("https://simulation.micutu.com/assets/x.js", ORIGIN) == "/assets/x.js", "own origin");
    require(cleanSource("/assets/x.js?q=1", ORIGIN) == "/assets/x.js", "query dropped");
    require(cleanSource("chrome-extension://abc/content.js", ORIGIN) == "external", "extension");
    require(cleanSource("https://evil.example/x.js", ORIGIN) == "external", "other origin");
    require(cleanSource("https://simulation.micutu.com.evil.example/x.js", ORIGIN) == "external", "lookalike origin");
    require(cleanSource("//evil.example/x.js", ORIGIN) == "external", "protocol-relative");
    require(cleanSource("/a b<script>", ORIGIN) == "external", "odd characters");
    require(cleanSource("", ORIGIN).empty(), "absent stays absent");
}

TEST(client_error_store_folds_repeats_and_throttles_logs) {
    ClientErrors::Store store(3, 600, 2.0);  // 3 fingerprints, 2 log lines per minute
    ClientErrors::Report a;
    a.kind = "error";
    a.message = "boom";
    auto d1 = store.record(a, 1000);
    auto d2 = store.record(a, 1001);
    require(d1.log && d1.count == 1, "first occurrence is logged");
    require(!d2.log && d2.count == 2, "repeats are counted, not logged");
    require(d1.fingerprint == d2.fingerprint, "same bug, same fingerprint");
    require(store.record(a, 1000 + 600).log, "logged again after the quiet period");

    ClientErrors::Report b = a, c = a, e = a;
    b.message = "other";
    c.message = "third";
    e.message = "fourth";
    require(store.record(b, 1700).log, "a second distinct error is logged");
    require(store.record(c, 1700).log, "a third one fits the budget");
    require(!store.record(e, 1700).log, "the shared line budget stops a flood");
    require(store.counters().logSuppressed == 1, "suppressed lines are counted");

    const auto counters = store.counters();
    require(counters.distinct == 3, "the store never exceeds its capacity");
    require(counters.received == 6, "every accepted report is counted");

    const auto summary = store.summary(10);
    require(summary["errors"].size() == 3, "summary lists what is kept");
    require(summary["errors"][0]["count"].asUInt64() >= summary["errors"][1]["count"].asUInt64(),
            "most frequent first");
}

TEST(client_error_store_keeps_frequent_errors_through_a_flood) {
    ClientErrors::Store store(4, 600, 100.0);
    ClientErrors::Report real;
    real.kind = "error";
    real.message = "real crash";
    for (int i = 0; i < 50; ++i) store.record(real, 1000 + i);
    ClientErrors::Report rare = real;
    rare.message = "seen twice";
    store.record(rare, 1100);
    store.record(rare, 1101);

    // 200 distinct one-off messages, all newer than both real errors.
    for (int i = 0; i < 200; ++i) {
        ClientErrors::Report junk = real;
        junk.message = "junk " + std::to_string(i);
        store.record(junk, 2000 + i);
    }

    const auto summary = store.summary(10);
    require(summary["distinct"].asUInt64() == 4, "capacity holds");
    require(summary["errors"][0]["message"].asString() == "real crash" &&
                summary["errors"][0]["count"].asUInt64() == 50,
            "the frequent error and its count survive");
    require(summary["errors"][1]["message"].asString() == "seen twice",
            "a repeated error outlives one-off junk");
    require(summary["errors"][2]["message"].asString() == "junk 199" &&
                summary["errors"][3]["message"].asString() == "junk 198",
            "only the newest junk is left, most recent first");
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
    RUN(constant_time_token_compare);
    RUN(search_query_keeps_international_names);
    RUN(search_query_rejects_syntax_and_invalid_utf8);
    RUN(percent_encoding_is_strict);
    RUN(rounded_coordinates_share_cache_entries);
    RUN(ttl_cache_expires_and_stays_bounded);
    RUN(wind_direction_uses_meteorological_convention);
    RUN(error_bodies_follow_the_contract);
    RUN(client_error_report_is_parsed_and_scrubbed);
    RUN(client_error_report_rejects_malformed_input);
    RUN(client_error_text_cannot_forge_log_lines);
    RUN(client_error_text_truncates_on_character_boundaries);
    RUN(client_error_sources_are_paths_on_this_site);
    RUN(client_error_store_folds_repeats_and_throttles_logs);
    RUN(client_error_store_keeps_frequent_errors_through_a_flood);

    printf("\n=== %d passed, %d failed ===\n\n", passed, failed);
    return failed > 0 ? 1 : 0;
}
