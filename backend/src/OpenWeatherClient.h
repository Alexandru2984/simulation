#pragma once

#include <drogon/HttpClient.h>
#include <functional>
#include <string>

class RateLimiter;

// Single gateway to api.openweathermap.org for every user-triggered request
// (popup realtime, city search, HUD seeding). Sharing one keep-alive client,
// one response cache and one upstream budget means no endpoint can be used to
// burn the API key's quota faster than the others allow.
namespace OpenWeather {

enum class FetchStatus {
    Ok,
    NotConfigured,
    RateLimited,
    UpstreamFailed,
    TooLarge,
    InvalidPayload,
};

using FetchCallback = std::function<void(FetchStatus, const std::string& body)>;

// Empty when OPENWEATHER_API_KEY is unset or still a documented placeholder.
const std::string& apiKey();

// One keep-alive client for the whole process, including assimilation.
const drogon::HttpClientPtr& client();

// Aggregate budget for user-triggered upstream calls; cache hits are free.
RateLimiter& userBudget();

// Coordinates rounded to 0.01° (~1 km): the cache key and the upstream query
// use the same value, so a cached answer is exactly what the API returned.
std::string roundedCoordinate(double value);

// Normalized current weather (see OpenWeatherResponse::normalizeRealtime).
void fetchRealtime(double lat, double lon, FetchCallback cb);

// Normalized geocoding results for a query from Security::normalizeSearchQuery.
void fetchSearch(const std::string& normalizedQuery, FetchCallback cb);

}  // namespace OpenWeather
