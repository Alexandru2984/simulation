#pragma once

#include <drogon/WebSocketConnection.h>

#include <algorithm>
#include <array>
#include <atomic>
#include <cstdint>
#include <chrono>
#include <cstdlib>
#include <memory>
#include <mutex>
#include <set>
#include <vector>

// Connection registry for one broadcast stream.
//
// Every client is pinged; any frame it sends back (normally the automatic
// pong) refreshes its liveness. A client that stops reading also stops
// answering pings, so it is closed instead of letting unsent broadcasts
// accumulate in server memory.
class WsHub {
public:
    using Conn = drogon::WebSocketConnectionPtr;

    // Wire format a client asked for (see GridCodec.h).
    enum Format : std::size_t { Json = 0, Bin1 = 1, Bin2 = 2, FormatCount = 3 };
    using Groups = std::array<std::vector<Conn>, FormatCount>;

    // RFC 6455 registry code 1013 "Try Again Later": the client backs off and
    // tells the user the simulation is full instead of failing silently.
    static constexpr auto kTryAgainLater = static_cast<drogon::CloseCode>(1013);

    struct ClientState {
        std::atomic<long long> lastSeenMs{0};
        Format format = Json;
    };

    // `maxLegacy` caps the JSON and GSB1 formats, which only stale tabs use and
    // which cost 5-10x the bandwidth (and buffer memory) of GSB2.
    explicit WsHub(std::size_t maxClients, std::size_t maxLegacy = SIZE_MAX)
        : maxClients_(maxClients), maxLegacy_(maxLegacy) {}

    static long long nowMs() {
        return std::chrono::duration_cast<std::chrono::milliseconds>(
            std::chrono::steady_clock::now().time_since_epoch()).count();
    }

    // Viewer cap. 1000 GSB2 viewers measured at ~8 MB/s egress, 0.07 CPU
    // cores and 34 MB RSS (scripts/load/ws-load.mjs); the binding limits are
    // bandwidth and nginx's shared worker_connections, not the backend.
    // SIM_WS_MAX_CLIENTS (1–20000) overrides it; keep LimitNOFILE above it.
    static std::size_t maxClients(std::size_t fallback = 1000) {
        static const std::size_t value = [fallback] {
            const char* env = std::getenv("SIM_WS_MAX_CLIENTS");
            const long parsed = env && *env ? std::strtol(env, nullptr, 10) : 0;
            return parsed >= 1 && parsed <= 20000 ? static_cast<std::size_t>(parsed) : fallback;
        }();
        return value;
    }

    static std::size_t maxLegacyClients() { return std::max<std::size_t>(16, maxClients() / 10); }

    // Liveness window: a client that has not answered a ping (sent every
    // third of it) for this long is closed. It also bounds how many frames
    // can pile up for a client that stops reading. SIM_WS_IDLE_SECONDS
    // (3–3600) overrides it.
    static double idleSeconds() {
        static const double seconds = [] {
            const char* env = std::getenv("SIM_WS_IDLE_SECONDS");
            const double value = env && *env ? std::atof(env) : 0.0;
            return value >= 3.0 && value <= 3600.0 ? value : 30.0;
        }();
        return seconds;
    }

    // Registers the connection; false when the hub is full.
    bool add(const Conn& conn, Format format = Json) {
        auto state = std::make_shared<ClientState>();
        state->format = format;
        state->lastSeenMs.store(nowMs());
        {
            std::lock_guard<std::mutex> lk(mtx_);
            if (clients_.size() >= maxClients_) return false;
            if (format != Bin2 && legacy_ >= maxLegacy_) return false;
            conn->setContext(state);
            if (clients_.insert(conn).second && format != Bin2) ++legacy_;
        }
        conn->setPingMessage("", std::chrono::duration<double>(idleSeconds() / 3.0));
        return true;
    }

    void remove(const Conn& conn) {
        std::lock_guard<std::mutex> lk(mtx_);
        eraseLocked(clients_.find(conn));
    }

    static void touch(const Conn& conn) {
        if (auto state = conn->getContext<ClientState>())
            state->lastSeenMs.store(nowMs());
    }

    std::size_t size() const {
        std::lock_guard<std::mutex> lk(mtx_);
        return clients_.size();
    }

    // Live connections grouped by wire format; unresponsive ones are closed
    // and dropped.
    Groups collect() {
        Groups groups;
        const long long cutoff = nowMs() - static_cast<long long>(idleSeconds() * 1000.0);
        std::vector<Conn> stale;
        {
            std::lock_guard<std::mutex> lk(mtx_);
            for (auto it = clients_.begin(); it != clients_.end();) {
                const auto state = (*it)->getContext<ClientState>();
                if (!(*it)->connected() || !state || state->lastSeenMs.load() < cutoff) {
                    stale.push_back(*it);
                    it = eraseLocked(it);
                    continue;
                }
                groups[state->format].push_back(*it);
                ++it;
            }
        }
        for (const auto& conn : stale) conn->forceClose();
        return groups;
    }

private:
    std::set<Conn>::iterator eraseLocked(std::set<Conn>::iterator it) {
        if (it == clients_.end()) return it;
        const auto state = (*it)->getContext<ClientState>();
        if (state && state->format != Bin2 && legacy_ > 0) --legacy_;
        return clients_.erase(it);
    }

    const std::size_t maxClients_;
    const std::size_t maxLegacy_;
    mutable std::mutex mtx_;
    std::set<Conn> clients_;
    std::size_t legacy_ = 0;
};
