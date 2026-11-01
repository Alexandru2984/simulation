#include "ClientErrorController.h"
#include "ClientErrors.h"
#include "RateLimiter.h"
#include "RuntimeInfo.h"
#include "Security.h"
#include <chrono>

namespace {

long long nowUnix() {
    return std::chrono::duration_cast<std::chrono::seconds>(
        std::chrono::system_clock::now().time_since_epoch()).count();
}

}  // namespace

void ClientErrorController::report(
    const drogon::HttpRequestPtr& req,
    std::function<void(const drogon::HttpResponsePtr&)>&& cb) const
{
    auto& store = ClientErrors::store();
    if (!Security::requireJsonPostAccess(req, cb)) {
        store.countRejected();
        return;
    }
    if (req->body().size() > ClientErrors::kMaxBodyBytes) {
        store.countRejected();
        cb(Security::json("{\"error\":\"payload_too_large\"}",
                          drogon::k413RequestEntityTooLarge));
        return;
    }
    // Global budget on top of nginx's per-IP limit. Reports are diagnostics:
    // dropping some under a flood is fine, filling the journal is not.
    static RateLimiter limiter(120.0, 30.0);
    if (!limiter.allow()) {
        store.countRateLimited();
        cb(Security::json("{\"error\":\"rate_limited\"}", drogon::k429TooManyRequests));
        return;
    }

    ClientErrors::Report report;
    if (!ClientErrors::parseReport(req->body(), Security::allowedOrigin(), report)) {
        store.countRejected();
        cb(Security::json("{\"error\":\"invalid_report\"}", drogon::k400BadRequest));
        return;
    }

    const auto decision = store.record(report, nowUnix());
    if (decision.log) {
        LOG_WARN << ClientErrors::logLine(report, decision, req->getHeader("User-Agent"),
                                          RuntimeInfo::buildGitSha());
    }

    auto resp = drogon::HttpResponse::newHttpResponse();
    resp->setStatusCode(drogon::k204NoContent);
    cb(resp);
}

void ClientErrorController::summary(
    const drogon::HttpRequestPtr& req,
    std::function<void(const drogon::HttpResponsePtr&)>&& cb) const
{
    if (!Security::isDirectLocalRequest(req)) {
        cb(Security::json("{\"error\":\"not_found\"}", drogon::k404NotFound, "GET"));
        return;
    }
    int limit = 20;
    const auto raw = req->getParameter("limit");
    if (!raw.empty() && !Security::parseIntInRange(raw, 1, 200, limit)) {
        cb(Security::json("{\"error\":\"invalid_limit\"}", drogon::k400BadRequest, "GET"));
        return;
    }
    auto resp = Security::json(ClientErrors::compact(ClientErrors::store().summary(limit)),
                               drogon::k200OK, "GET");
    resp->addHeader("Cache-Control", "no-store");
    cb(resp);
}
