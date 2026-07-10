#pragma once

#include <cstdlib>
#include <cstring>
#include <string>
#include <sys/socket.h>
#include <sys/un.h>
#include <unistd.h>

// Minimal sd_notify(3): datagram to $NOTIFY_SOCKET, no libsystemd dependency.
// Every call is a no-op returning false when not running under systemd.
namespace SdNotify {

inline bool send(const std::string& state) {
    const char* path = std::getenv("NOTIFY_SOCKET");
    if (!path || !*path) return false;

    const size_t pathLen = std::strlen(path);
    sockaddr_un addr{};
    addr.sun_family = AF_UNIX;
    if (pathLen >= sizeof(addr.sun_path)) return false;
    std::memcpy(addr.sun_path, path, pathLen);
    if (addr.sun_path[0] == '@') addr.sun_path[0] = '\0';  // abstract namespace

    int fd = ::socket(AF_UNIX, SOCK_DGRAM | SOCK_CLOEXEC, 0);
    if (fd < 0) return false;

    const socklen_t addrLen =
        static_cast<socklen_t>(offsetof(sockaddr_un, sun_path) + pathLen);
    const bool ok = ::sendto(fd, state.data(), state.size(), 0,
                             reinterpret_cast<const sockaddr*>(&addr),
                             addrLen) == static_cast<ssize_t>(state.size());
    ::close(fd);
    return ok;
}

inline bool ready()    { return send("READY=1"); }
inline bool watchdog() { return send("WATCHDOG=1"); }

// Watchdog interval requested via $WATCHDOG_USEC, in seconds; 0 when the
// watchdog is off or the variable targets another process ($WATCHDOG_PID).
inline double watchdogIntervalSeconds() {
    const char* usec = std::getenv("WATCHDOG_USEC");
    if (!usec || !*usec) return 0.0;

    const char* pid = std::getenv("WATCHDOG_PID");
    if (pid && *pid && std::atoll(pid) != static_cast<long long>(::getpid()))
        return 0.0;

    char* end = nullptr;
    const unsigned long long v = std::strtoull(usec, &end, 10);
    if (end == usec || v == 0) return 0.0;
    return static_cast<double>(v) / 1e6;
}

}  // namespace SdNotify
