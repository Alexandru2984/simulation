import SearchBar from './SearchBar'
import { CityChips, GlobeToolbar, LayerSwitcher, SpeedControl, StatusIndicator, StormControls } from './HudParts'

function conditionIcon(pressure, temp) {
  if (Number.isFinite(temp) && temp < 0) return '❄️'
  if (Number.isFinite(temp) && temp > 37) return '🌡️'
  if (!Number.isFinite(pressure)) return '🌍'
  if (pressure > 1020) return '☀️'
  if (pressure > 1015) return '⛅'
  if (pressure > 1010) return '🌥️'
  if (pressure > 1003) return '🌧️'
  return '⛈️'
}

// Desktop and tablet chrome. Mobile uses MobileHUD.
export default function WeatherHUD({
  layout, weatherData, gridData, status, prefs,
  overlayMode, onOverlayMode,
  searchRef, onSearchSelect,
  locations, activeCity, seeding, onSeed,
  speed, speedBusy, onSpeedChange,
  globeApi, fullscreen, onShare, onHelp, onSettings,
  tourActive, onToggleTour, onFocus,
}) {
  const icon = conditionIcon(weatherData?.pressure, weatherData?.temperature)
  return (
    <>
      <header className="topbar glass">
        <div className="brand">
          <span className="brand__icon" aria-hidden="true">{icon}</span>
          <div>
            <h1 className="brand__title">Weather Simulation</h1>
            <div className="brand__sub">Live global atmosphere model</div>
          </div>
        </div>

        <div className="topbar__search">
          <SearchBar ref={searchRef} onSelect={onSearchSelect} />
        </div>

        <LayerSwitcher value={overlayMode} onChange={onOverlayMode} />

        <div className="topbar__actions">
          <StatusIndicator status={status} compact={layout === 'tablet'} />
          <button type="button" className="btn btn--icon btn--ghost" onClick={onSettings}
            aria-label="Settings" title="Settings">⚙️</button>
          <button type="button" className="btn btn--icon btn--ghost" onClick={onHelp}
            aria-label="About and keyboard shortcuts" title="About & shortcuts (?)">❔</button>
        </div>
      </header>

      <section className="dock-bottom" aria-label="Cities and simulation speed">
        <CityChips className="chips glass" locations={locations} activeCity={activeCity}
          busy={seeding} onSelect={onSeed} />
        <div className="speed-bar glass">
          <span className="speed-bar__label" aria-hidden="true">SPEED</span>
          <SpeedControl speed={speed} disabled={speedBusy} onChange={onSpeedChange} />
          <span className="speed-bar__meta" aria-live="polite">
            {seeding ? '⟳ Seeding…' : activeCity ? `📍 ${activeCity}` : '🌐 Click the globe'}
          </span>
        </div>
      </section>

      <section className="dock-bottom-right" aria-label="Storms and view controls">
        <StormControls storms={gridData?.storms} tourActive={tourActive} onToggleTour={onToggleTour}
          onFocus={onFocus} prefs={prefs} />
        <GlobeToolbar api={globeApi} vertical fullscreen={fullscreen} onShare={onShare} />
      </section>
    </>
  )
}
