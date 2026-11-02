#pragma once

#include <drogon/drogon.h>
#include <charconv>
#include <cmath>
#include <cstdlib>
#include <functional>
#include <system_error>
#include <string>
#include <string_view>
#include "RateLimiter.h"

namespace Security {

// ── Pure checks (unit-testable without drogon request objects) ───────────────

// Strict origin check used for mutations: the header must equal the allowed
// origin exactly — absent or foreign origins are rejected.
inline bool originAllowed(std::string_view origin, std::string_view allowed) {
    return origin == allowed;
}

inline bool isJsonContentType(std::string_view contentType) {
    constexpr std::string_view expected = "application/json";
    const auto semicolon = contentType.find(';');
    auto mediaType = contentType.substr(0, semicolon);
    while (!mediaType.empty() && (mediaType.front() == ' ' || mediaType.front() == '\t'))
        mediaType.remove_prefix(1);
    while (!mediaType.empty() && (mediaType.back() == ' ' || mediaType.back() == '\t'))
        mediaType.remove_suffix(1);

    if (mediaType.size() != expected.size()) return false;
    for (std::size_t i = 0; i < expected.size(); ++i) {
        char c = mediaType[i];
        if (c >= 'A' && c <= 'Z') c = static_cast<char>(c - 'A' + 'a');
        if (c != expected[i]) return false;
    }
    return true;
}

inline bool finiteInRange(double value, double minimum, double maximum) {
    return std::isfinite(value) && value >= minimum && value <= maximum;
}

inline bool parseFiniteDouble(std::string_view input, double& value) {
    if (input.empty() || input.size() > 64) return false;
    const char* begin = input.data();
    const char* end = begin + input.size();
    const auto result = std::from_chars(begin, end, value, std::chars_format::general);
    return result.ec == std::errc{} && result.ptr == end && std::isfinite(value);
}

inline bool parseIntInRange(std::string_view input, int minimum, int maximum,
                            int& value) {
    if (input.empty() || input.size() > 16) return false;
    const char* begin = input.data();
    const char* end = begin + input.size();
    const auto result = std::from_chars(begin, end, value);
    return result.ec == std::errc{} && result.ptr == end &&
           value >= minimum && value <= maximum;
}

// Compares secrets without an early exit, so response timing does not reveal
// how many leading bytes of a guessed token were correct.
inline bool constantTimeEquals(std::string_view a, std::string_view b) {
    const std::size_t n = a.size() > b.size() ? a.size() : b.size();
    unsigned char diff = static_cast<unsigned char>(a.size() != b.size());
    for (std::size_t i = 0; i < n; ++i) {
        const auto x = static_cast<unsigned char>(i < a.size() ? a[i] : 0);
        const auto y = static_cast<unsigned char>(i < b.size() ? b[i] : 0);
        diff = static_cast<unsigned char>(diff | (x ^ y));
    }
    return diff == 0;
}

// Decodes one strictly valid UTF-8 sequence (no overlongs, surrogates or
// code points above U+10FFFF). Returns the sequence length, or 0 if invalid.
inline std::size_t decodeUtf8(std::string_view s, std::size_t i, char32_t& cp) {
    const auto byte = [&](std::size_t k) {
        return static_cast<unsigned char>(s[k]);
    };
    const unsigned char b0 = byte(i);
    if (b0 < 0x80) { cp = b0; return 1; }

    std::size_t len = 0;
    char32_t min = 0;
    if ((b0 & 0xE0) == 0xC0)      { len = 2; cp = b0 & 0x1F; min = 0x80; }
    else if ((b0 & 0xF0) == 0xE0) { len = 3; cp = b0 & 0x0F; min = 0x800; }
    else if ((b0 & 0xF8) == 0xF0) { len = 4; cp = b0 & 0x07; min = 0x10000; }
    else return 0;
    if (i + len > s.size()) return 0;

    for (std::size_t k = 1; k < len; ++k) {
        const unsigned char b = byte(i + k);
        if ((b & 0xC0) != 0x80) return 0;
        cp = (cp << 6) | (b & 0x3F);
    }
    if (cp < min || cp > 0x10FFFF || (cp >= 0xD800 && cp <= 0xDFFF)) return 0;
    return len;
}

// Normalizes a free-text place search. International names ("București",
// "São Paulo", "Москва", "東京") are kept intact; controls, invisible
// separators and URL/query syntax are rejected; whitespace and word-separating
// punctuation collapse to one space and ASCII letters are lower-cased, so
// equivalent queries share a cache entry.
inline bool normalizeSearchQuery(std::string_view input, std::string& output) {
    // 100 characters from the search box are at most 300 bytes of UTF-8.
    constexpr std::size_t MAX_BYTES = 300;
    if (input.size() > 4 * MAX_BYTES) return false;

    std::string out;
    out.reserve(input.size());
    bool pendingSpace = false;
    std::size_t letters = 0;

    for (std::size_t i = 0; i < input.size();) {
        char32_t cp = 0;
        const std::size_t len = decodeUtf8(input, i, cp);
        if (len == 0) return false;

        // Spaces (incl. NBSP and ideographic), and punctuation that only
        // separates words in place names: "Frankfurt (Oder)", "Halle/Saale",
        // "Trinidad & Tobago". URL and markup syntax (% = ? # < > " ...)
        // is still refused.
        const bool separator = cp == ' ' || cp == 0xA0 || cp == 0x3000 ||
                               cp == '(' || cp == ')' || cp == '/' || cp == '&' ||
                               cp == '!';
        if (separator) {
            pendingSpace = !out.empty();
            i += len;
            continue;
        }

        const bool asciiAlnum = (cp >= '0' && cp <= '9') ||
                                (cp >= 'a' && cp <= 'z') ||
                                (cp >= 'A' && cp <= 'Z');
        const bool punctuation = cp == ',' || cp == '-' || cp == '\'' || cp == '.' ||
                                 (cp >= 0x2010 && cp <= 0x2019);  // dashes, curly quotes
        const bool invisible = cp == 0xAD ||                       // soft hyphen
                               (cp >= 0x2000 && cp <= 0x200F) ||   // spaces, ZW*, LRM/RLM
                               (cp >= 0x2028 && cp <= 0x202F) ||   // separators, bidi
                               (cp >= 0x205F && cp <= 0x206F) ||   // invisible ops, isolates
                               cp == 0xFEFF ||                     // BOM / ZWNBSP
                               (cp >= 0xFFF0 && cp <= 0xFFFF);     // specials
        const bool international = cp > 0xA0 && !invisible &&
                                   !(cp >= 0x2010 && cp <= 0x2027);
        if (!asciiAlnum && !punctuation && !international) return false;

        if (pendingSpace) { out.push_back(' '); pendingSpace = false; }
        if (cp >= 'A' && cp <= 'Z') out.push_back(static_cast<char>(cp - 'A' + 'a'));
        else out.append(input.substr(i, len));
        if (!punctuation) ++letters;
        i += len;
    }

    if (letters < 2 || out.size() > MAX_BYTES) return false;
    output = std::move(out);
    return true;
}

// RFC 3986 percent-encoding: only unreserved characters stay literal.
inline std::string percentEncode(std::string_view input) {
    static constexpr char HEX[] = "0123456789ABCDEF";
    std::string out;
    out.reserve(input.size() * 3);
    for (const char ch : input) {
        const auto c = static_cast<unsigned char>(ch);
        const bool unreserved = (c >= '0' && c <= '9') || (c >= 'a' && c <= 'z') ||
                                (c >= 'A' && c <= 'Z') || c == '-' || c == '.' ||
                                c == '_' || c == '~';
        if (unreserved) {
            out.push_back(ch);
        } else {
            out.push_back('%');
            out.push_back(HEX[c >> 4]);
            out.push_back(HEX[c & 0x0F]);
        }
    }
    return out;
}

inline const std::string& allowedOrigin() {
    static const std::string origin = [] {
        const char* env = std::getenv("SIM_ALLOWED_ORIGIN");
        return std::string(env && *env ? env : "https://simulation.micutu.com");
    }();
    return origin;
}

inline const std::string& mutationToken() {
    static const std::string token = [] {
        const char* env = std::getenv("SIM_MUTATION_TOKEN");
        return std::string(env && *env ? env : "");
    }();
    return token;
}

inline void addCorsHeaders(const drogon::HttpResponsePtr& resp,
                           const std::string& methods = "GET, POST, OPTIONS") {
    resp->addHeader("Access-Control-Allow-Origin", allowedOrigin());
    resp->addHeader("Access-Control-Allow-Methods", methods);
    resp->addHeader("Access-Control-Allow-Headers", "Content-Type, X-Simulation-Token");
}

inline drogon::HttpResponsePtr json(const std::string& body,
                                    drogon::HttpStatusCode code = drogon::k200OK,
                                    const std::string& methods = "GET, POST, OPTIONS") {
    auto resp = drogon::HttpResponse::newHttpResponse();
    resp->setStatusCode(code);
    resp->setContentTypeCode(drogon::CT_APPLICATION_JSON);
    addCorsHeaders(resp, methods);
    resp->setBody(body);
    return resp;
}

// The API error contract: {"error":"<snake_case code>"} plus, for validation
// failures, a human-readable "message". Clients branch on the code only; the
// message may change wording at any time.
inline std::string errorBody(std::string_view code, std::string_view message = {}) {
    Json::Value body(Json::objectValue);
    body["error"] = std::string(code);
    if (!message.empty()) body["message"] = std::string(message);
    Json::StreamWriterBuilder builder;
    builder["indentation"] = "";
    return Json::writeString(builder, body);
}

inline drogon::HttpResponsePtr error(drogon::HttpStatusCode status, std::string_view code,
                                     std::string_view message = {},
                                     const std::string& methods = "GET, POST, OPTIONS") {
    return json(errorBody(code, message), status, methods);
}

inline bool hasAllowedOrigin(const drogon::HttpRequestPtr& req) {
    const auto origin = req->getHeader("Origin");
    return origin.empty() || origin == allowedOrigin();
}

// Operator endpoints answer only requests made on this host straight to the
// backend port. nginx adds X-Real-IP and X-Forwarded-For to everything it
// proxies, so a proxied request is refused even if a vhost forgets to block
// the path.
inline bool isDirectLocalRequest(const drogon::HttpRequestPtr& req) {
    return req->peerAddr().isLoopbackIp() &&
           req->getHeader("X-Real-IP").empty() &&
           req->getHeader("X-Forwarded-For").empty();
}

inline bool hasJsonContentType(const drogon::HttpRequestPtr& req) {
    return isJsonContentType(req->getHeader("Content-Type"));
}

inline bool requireJsonPostAccess(
    const drogon::HttpRequestPtr& req,
    const std::function<void(const drogon::HttpResponsePtr&)>& cb) {
    const auto origin = req->getHeader("Origin");
    if (!originAllowed(origin, allowedOrigin())) {
        cb(error(drogon::k403Forbidden, "forbidden_origin"));
        return false;
    }

    if (!hasJsonContentType(req)) {
        cb(error(drogon::k415UnsupportedMediaType, "unsupported_media_type",
                 "Content-Type must be application/json"));
        return false;
    }

    return true;
}

inline bool requireMutationAccess(
    const drogon::HttpRequestPtr& req,
    const std::function<void(const drogon::HttpResponsePtr&)>& cb,
    RateLimiter* limiter = nullptr) {
    if (!requireJsonPostAccess(req, cb)) return false;

    const auto& token = mutationToken();
    if (!token.empty() &&
        !constantTimeEquals(req->getHeader("X-Simulation-Token"), token)) {
        cb(error(drogon::k401Unauthorized, "unauthorized"));
        return false;
    }

    // Global budget checked last so rejected junk doesn't drain tokens
    if (limiter && !limiter->allow()) {
        cb(error(drogon::k429TooManyRequests, "rate_limited"));
        return false;
    }

    return true;
}

}  // namespace Security
