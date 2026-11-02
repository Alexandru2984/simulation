import SearchBar from './SearchBar'
import { CityChips, GlobeToolbar, LayerSwitcher, SpeedControl, StatusIndicator, StormControls } from './HudParts'
import { useI18n } from '../i18n/react'

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
  const { t } = useI18n()
  const icon = conditionIcon(weatherData?.pressure, weatherData?.temperature)
  return (
    <>
      <header className="topbar glass">
        <div className="brand">
          <span className="brand__icon" aria-hidden="true">{icon}</span>
          <div>
            <h1 className="brand__title">{t('app.title')}</h1>
            <div className="brand__sub">{t('app.tagline')}</div>
          </div>
        </div>

        <div className="topbar__search">
          <SearchBar ref={searchRef} onSelect={onSearchSelect} />
        </div>

        <LayerSwitcher value={overlayMode} onChange={onOverlayMode} />

        <div className="topbar__actions">
          <StatusIndicator status={status} compact={layout === 'tablet'} />
          <button type="button" className="btn btn--icon btn--ghost" onClick={onSettings}
            aria-label={t('hud.settings')} title={t('hud.settings')}>⚙️</button>
          <button type="button" className="btn btn--icon btn--ghost" onClick={onHelp}
            aria-label={t('hud.about')} title={t('hud.aboutTitle')}>❔</button>
        </div>
      </header>

      <section className="dock-bottom" aria-label={t('hud.citiesAndSpeed')}>
        <CityChips className="chips glass" locations={locations} activeCity={activeCity}
          busy={seeding} onSelect={onSeed} />
        <div className="speed-bar glass">
          <span className="speed-bar__label" aria-hidden="true">{t('speed.short')}</span>
          <SpeedControl speed={speed} disabled={speedBusy} onChange={onSpeedChange} />
          <span className="speed-bar__meta" aria-live="polite">
            {seeding ? t('hud.seeding') : activeCity ? `📍 ${activeCity}` : t('hud.clickGlobe')}
          </span>
        </div>
      </section>

      <section className="dock-bottom-right" aria-label={t('hud.stormsAndView')}>
        <StormControls storms={gridData?.storms} tourActive={tourActive} onToggleTour={onToggleTour}
          onFocus={onFocus} prefs={prefs} />
        <GlobeToolbar api={globeApi} vertical fullscreen={fullscreen} onShare={onShare} />
      </section>
    </>
  )
}
