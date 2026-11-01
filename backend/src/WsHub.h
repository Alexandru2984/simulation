#pragma once

#include <drogon/WebSocketConnection.h>

#include <atomic>
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

    struct ClientState {
        std::atomic<long long> lastSeenMs{0};
        bool binary = false;
    };

    explicit WsHub(std::size_t maxClients) : maxClients_(maxClients) {}

    static long long nowMs() {
        return std::chrono::duration_cast<std::chrono::milliseconds>(
            std::chrono::steady_clock::now().time_since_epoch()).count();
    }

    // Liveness window; SIM_WS_IDLE_SECONDS exists for integration tests.
    static double idleSeconds() {
        static const double seconds = [] {
            const char* env = std::getenv("SIM_WS_IDLE_SECONDS");
            const double value = env && *env ? std::atof(env) : 0.0;
            return value >= 3.0 && value <= 3600.0 ? value : 75.0;
        }();
        return seconds;
    }

    // Registers the connection; false when the hub is full.
    bool add(const Conn& conn, bool binary) {
        auto state = std::make_shared<ClientState>();
        state->binary = binary;
        state->lastSeenMs.store(nowMs());
        {
            std::lock_guard<std::mutex> lk(mtx_);
            if (clients_.size() >= maxClients_) return false;
            conn->setContext(state);
            clients_.insert(conn);
        }
        conn->setPingMessage("", std::chrono::duration<double>(idleSeconds() / 3.0));
        return true;
    }

    void remove(const Conn& conn) {
        std::lock_guard<std::mutex> lk(mtx_);
        clients_.erase(conn);
    }

    static void touch(const Conn& conn) {
        if (auto state = conn->getContext<ClientState>())
            state->lastSeenMs.store(nowMs());
    }

    std::size_t size() const {
        std::lock_guard<std::mutex> lk(mtx_);
        return clients_.size();
    }

    // Live connections split by wire format; unresponsive ones are closed
    // and dropped.
    void collect(std::vector<Conn>& text, std::vector<Conn>& binary) {
        const long long cutoff = nowMs() - static_cast<long long>(idleSeconds() * 1000.0);
        std::vector<Conn> stale;
        {
            std::lock_guard<std::mutex> lk(mtx_);
            for (auto it = clients_.begin(); it != clients_.end();) {
                const auto state = (*it)->getContext<ClientState>();
                if (!(*it)->connected() || !state || state->lastSeenMs.load() < cutoff) {
                    stale.push_back(*it);
                    it = clients_.erase(it);
                    continue;
                }
                (state->binary ? binary : text).push_back(*it);
                ++it;
            }
        }
        for (const auto& conn : stale) conn->forceClose();
    }

private:
    const std::size_t maxClients_;
    mutable std::mutex mtx_;
    std::set<Conn> clients_;
};
