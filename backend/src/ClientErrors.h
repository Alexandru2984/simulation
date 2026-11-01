#pragma once

// Browser error reports (POST /api/client-errors).
//
// The frontend sends at most a handful of reports per page load. Here they are
// validated, scrubbed and folded into a bounded store keyed by fingerprint, so
// the same crash from a thousand viewers is one log line every few minutes
// with a count, not a thousand lines. Pure logic: unit-tested without Drogon.
//
// Nothing that identifies a person is kept: no IP address, no cookies, no page
// URL (the hash holds the place being viewed). The user agent is logged
// because most frontend bugs are browser-specific.

#include <json/json.h>
#include <algorithm>
#include <cstdint>
#include <cstdio>
#include <exception>
#include <memory>
#include <mutex>
#include <string>
#include <string_view>
#include <unordered_map>
#include <vector>
#include "RateLimiter.h"
#include "Security.h"

namespace ClientErrors {

constexpr std::size_t kMaxBodyBytes = 8 * 1024;
constexpr std::size_t kMaxMessage   = 300;
constexpr std::size_t kMaxStack     = 4000;
constexpr std::size_t kMaxSource    = 200;
constexpr std::size_t kMaxBuild     = 64;
constexpr std::size_t kMaxUserAgent = 200;
constexpr int         kMaxPosition  = 10'000'000;

// error      uncaught exception (window "error")
// rejection  unhandled promise rejection
// render     React error boundary (a component tree crashed)
// stream     a live grid frame could not be decoded
inline bool validKind(std::string_view kind) {
    return kind == "error" || kind == "rejection" || kind == "render" || kind == "stream";
}

struct Report {
    std::string kind;
    std::string message;
    std::string stack;
    std::string source;  // script path on this site, "external", or empty
    std::string build;   // content-hashed entry bundle name, e.g. "index-BX3k9a"
    int line = 0;
    int col = 0;
};

// Keeps valid UTF-8 (invalid bytes become U+FFFD), drops invisible and bidi
// control characters that could make a log line read differently from what it
// contains, turns other control characters into spaces (newlines survive only
// when `keepNewlines`), trims, and truncates on a character boundary with "…".
inline std::string cleanText(std::string_view in, std::size_t maxBytes, bool keepNewlines) {
    std::string out;
    out.reserve(std::min(in.size(), maxBytes) + 3);
    for (std::size_t i = 0; i < in.size();) {
        char32_t cp = 0;
        std::size_t len = Security::decodeUtf8(in, i, cp);
        std::string_view chunk = in.substr(i, len);
        if (len == 0) {
            len = 1;
            chunk = "\xEF\xBF\xBD";
            cp = 0xFFFD;
        }
        i += len;

        const bool invisible = cp == 0xAD || cp == 0x61C || cp == 0x180E ||
                               (cp >= 0x200B && cp <= 0x200F) ||
                               (cp >= 0x202A && cp <= 0x202E) ||
                               (cp >= 0x2060 && cp <= 0x206F) || cp == 0xFEFF;
        if (invisible || cp == '\r') continue;
        const bool control = cp < 0x20 || cp == 0x7F || (cp >= 0x80 && cp < 0xA0) ||
                             cp == 0x2028 || cp == 0x2029;
        if (cp == '\n' && keepNewlines) chunk = "\n";
        else if (control) chunk = " ";

        if (out.size() + chunk.size() > maxBytes) {
            out.append("\xE2\x80\xA6");  // …
            break;
        }
        out.append(chunk);
    }
    const auto first = out.find_first_not_of(" \n");
    if (first == std::string::npos) return {};
    const auto last = out.find_last_not_of(" \n");
    return out.substr(first, last - first + 1);
}

// Reduces a script URL to a path on this site ("/assets/index-x.js"), drops
// any query or fragment, and replaces anything else with "external".
inline std::string cleanSource(std::string_view src, std::string_view origin) {
    if (src.empty()) return {};
    if (!origin.empty() && src.size() > origin.size() &&
        src.substr(0, origin.size()) == origin && src[origin.size()] == '/')
        src.remove_prefix(origin.size());
    if (src.empty() || src.front() != '/' || (src.size() > 1 && src[1] == '/'))
        return "external";
    src = src.substr(0, src.find_first_of("?#"));
    if (src.size() > kMaxSource) return "external";
    for (const char c : src) {
        const bool ok = (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') ||
                        (c >= '0' && c <= '9') || c == '/' || c == '.' || c == '_' ||
                        c == '-' || c == '~';
        if (!ok) return "external";
    }
    return std::string(src);
}

inline bool validBuild(std::string_view build) {
    if (build.empty() || build.size() > kMaxBuild) return false;
    return std::all_of(build.begin(), build.end(), [](char c) {
        return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') ||
               (c >= '0' && c <= '9') || c == '.' || c == '_' || c == '-';
    });
}

// Parses one report. Unknown keys are ignored so an older backend accepts a
// newer frontend's reports; known keys must have the right type.
inline bool parseReport(std::string_view body, std::string_view origin, Report& out) {
    if (body.empty() || body.size() > kMaxBodyBytes) return false;

    Json::CharReaderBuilder builder;
    builder["collectComments"] = false;
    builder["rejectDupKeys"] = true;
    builder["strictRoot"] = true;
    builder["stackLimit"] = 8;
    std::unique_ptr<Json::CharReader> reader(builder.newCharReader());
    Json::Value json;
    std::string errors;
    try {
        // jsoncpp throws, rather than failing, past the nesting limit.
        if (!reader->parse(body.data(), body.data() + body.size(), &json, &errors))
            return false;
    } catch (const std::exception&) {
        return false;
    }
    if (!json.isObject() || json.size() > 16) return false;

    const auto optionalString = [&](const char* key, std::string& value) {
        if (!json.isMember(key)) return true;
        if (!json[key].isString()) return false;
        value = json[key].asString();
        return true;
    };
    const auto optionalPosition = [&](const char* key, int& value) {
        if (!json.isMember(key)) return true;
        const auto& v = json[key];
        if (!v.isInt() || v.asInt() < 0 || v.asInt() > kMaxPosition) return false;
        value = v.asInt();
        return true;
    };

    Report r;
    std::string kind, message, stack, source, build;
    if (!json["kind"].isString() || !validKind(json["kind"].asString())) return false;
    kind = json["kind"].asString();
    if (!json["message"].isString()) return false;
    message = json["message"].asString();
    if (!optionalString("stack", stack) || !optionalString("source", source) ||
        !optionalString("build", build) || !optionalPosition("line", r.line) ||
        !optionalPosition("col", r.col))
        return false;
    if (!build.empty() && !validBuild(build)) return false;

    r.kind = std::move(kind);
    r.message = cleanText(message, kMaxMessage, false);
    if (r.message.empty()) return false;
    r.stack = cleanText(stack, kMaxStack, true);
    r.source = cleanSource(source, origin);
    r.build = std::move(build);
    out = std::move(r);
    return true;
}

// FNV-1a over what identifies "the same bug": not the stack, which differs
// between browsers for one bug.
inline std::string fingerprint(const Report& r) {
    std::uint64_t hash = 1469598103934665603ULL;
    const auto mix = [&](std::string_view s) {
        for (const unsigned char c : s) { hash ^= c; hash *= 1099511628211ULL; }
        hash ^= 0xFF;
        hash *= 1099511628211ULL;
    };
    mix(r.kind);
    mix(r.message);
    mix(r.source);
    mix(std::to_string(r.line));
    char hex[17];
    std::snprintf(hex, sizeof(hex), "%016llx", static_cast<unsigned long long>(hash));
    return hex;
}

inline std::string compact(const Json::Value& value) {
    Json::StreamWriterBuilder builder;
    builder["commentStyle"] = "None";
    builder["indentation"] = "";
    // Non-ASCII is escaped, so a log line is always plain ASCII on one line.
    builder["emitUTF8"] = false;
    return Json::writeString(builder, value);
}

struct Decision {
    bool log = false;         // write a log line for this report
    std::string fingerprint;
    std::uint64_t count = 0;  // occurrences of this fingerprint so far
};

class Store {
public:
    // `capacity` distinct fingerprints are kept (least recently seen evicted);
    // each is logged at most once per `relogSeconds`, and all log lines share
    // a budget of `linesPerMinute`, so a flood of distinct junk cannot fill
    // the journal.
    explicit Store(std::size_t capacity = 200, long long relogSeconds = 600,
                   double linesPerMinute = 20.0)
        : capacity_(std::max<std::size_t>(1, capacity)), relogSeconds_(relogSeconds),
          logBudget_(linesPerMinute, linesPerMinute) {}

    Decision record(const Report& report, long long nowUnix) {
        std::lock_guard<std::mutex> lock(mtx_);
        Decision decision;
        decision.fingerprint = fingerprint(report);

        auto it = entries_.find(decision.fingerprint);
        if (it == entries_.end()) {
            if (entries_.size() >= capacity_) evictLeastRecent();
            Entry entry;
            entry.sample = report;
            entry.firstSeen = nowUnix;
            it = entries_.emplace(decision.fingerprint, std::move(entry)).first;
        }
        Entry& entry = it->second;
        ++entry.count;
        entry.lastSeen = nowUnix;
        ++received_;
        decision.count = entry.count;

        const bool due = entry.lastLogged < 0 || nowUnix - entry.lastLogged >= relogSeconds_;
        if (due) {
            if (logBudget_.allowAt(static_cast<double>(nowUnix))) {
                entry.lastLogged = nowUnix;
                decision.log = true;
            } else {
                ++logSuppressed_;
            }
        }
        return decision;
    }

    void countRejected()    { std::lock_guard<std::mutex> l(mtx_); ++rejected_; }
    void countRateLimited() { std::lock_guard<std::mutex> l(mtx_); ++rateLimited_; }

    struct Counters {
        std::uint64_t received, rejected, rateLimited, logSuppressed;
        std::size_t distinct;
    };
    Counters counters() const {
        std::lock_guard<std::mutex> lock(mtx_);
        return {received_, rejected_, rateLimited_, logSuppressed_, entries_.size()};
    }

    // Operator view: counters plus the `limit` most frequent errors.
    Json::Value summary(std::size_t limit) const {
        std::lock_guard<std::mutex> lock(mtx_);
        std::vector<const std::pair<const std::string, Entry>*> top;
        top.reserve(entries_.size());
        for (const auto& kv : entries_) top.push_back(&kv);
        std::sort(top.begin(), top.end(), [](const auto* a, const auto* b) {
            if (a->second.count != b->second.count) return a->second.count > b->second.count;
            return a->second.lastSeen > b->second.lastSeen;
        });
        if (top.size() > limit) top.resize(limit);

        Json::Value out(Json::objectValue);
        out["received"] = Json::UInt64(received_);
        out["rejected"] = Json::UInt64(rejected_);
        out["rateLimited"] = Json::UInt64(rateLimited_);
        out["logSuppressed"] = Json::UInt64(logSuppressed_);
        out["distinct"] = Json::UInt64(entries_.size());
        Json::Value list(Json::arrayValue);
        for (const auto* kv : top) {
            Json::Value e = toJson(kv->second.sample);
            e["fingerprint"] = kv->first;
            e["count"] = Json::UInt64(kv->second.count);
            e["firstSeenUnix"] = Json::Int64(kv->second.firstSeen);
            e["lastSeenUnix"] = Json::Int64(kv->second.lastSeen);
            list.append(std::move(e));
        }
        out["errors"] = std::move(list);
        return out;
    }

    static Json::Value toJson(const Report& r) {
        Json::Value v(Json::objectValue);
        v["kind"] = r.kind;
        v["message"] = r.message;
        if (!r.source.empty()) v["source"] = r.source;
        if (r.line) v["line"] = r.line;
        if (r.col) v["col"] = r.col;
        if (!r.build.empty()) v["build"] = r.build;
        if (!r.stack.empty()) v["stack"] = r.stack;
        return v;
    }

private:
    struct Entry {
        Report sample;
        std::uint64_t count = 0;
        long long firstSeen = 0;
        long long lastSeen = 0;
        long long lastLogged = -1;
    };

    void evictLeastRecent() {
        auto victim = entries_.begin();
        for (auto it = entries_.begin(); it != entries_.end(); ++it)
            if (it->second.lastSeen < victim->second.lastSeen) victim = it;
        if (victim != entries_.end()) entries_.erase(victim);
    }

    mutable std::mutex mtx_;
    const std::size_t capacity_;
    const long long relogSeconds_;
    RateLimiter logBudget_;
    std::unordered_map<std::string, Entry> entries_;
    std::uint64_t received_ = 0;
    std::uint64_t rejected_ = 0;
    std::uint64_t rateLimited_ = 0;
    std::uint64_t logSuppressed_ = 0;
};

// One log line: `client_error {json}`.
inline std::string logLine(const Report& r, const Decision& d, std::string_view userAgent,
                           std::string_view backendBuild) {
    Json::Value v = Store::toJson(r);
    v["fingerprint"] = d.fingerprint;
    v["count"] = Json::UInt64(d.count);
    const auto ua = cleanText(userAgent, kMaxUserAgent, false);
    if (!ua.empty()) v["userAgent"] = ua;
    v["backend"] = std::string(backendBuild);
    return "client_error " + compact(v);
}

inline Store& store() {
    static Store instance;
    return instance;
}

}  // namespace ClientErrors
