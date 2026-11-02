import { useRef } from 'react'
import SearchBar from './SearchBar'
import Legend from './Legend'
import EventFeed from './EventFeed'
import { IntensitySlider } from './EventPanel'
import { CityChips, LayerSwitcher, SpeedControl, StatusIndicator } from './HudParts'
import { EVENTS } from '../constants'
import Icon from './Icon'
import { formatTemperature, formatWind } from '../utils/units'
import { useI18n } from '../i18n/react'

const SWIPE_PX = 28

// Phone layout: compact top bar, a bottom sheet that peeks with the layer
// switcher and event shortcuts, and floating buttons above it.
export default function MobileHUD({
  gridData, status, prefs,
  overlayMode, onOverlayMode,
  searchRef, onSearchSelect, searchOpen, onSearchOpenChange,
  locations, activeCity, seeding, onSeed,
  speed, speedBusy, onSpeedChange,
  placementMode, onStartPlacement, intensity, onIntensity,
  sheetOpen, onSheetOpenChange, onOpenTime,
  tourActive, onToggleTour, onFocus,
  globeApi, fullscreen, onShare, onHelp, onSettings,
  floatingHidden,
}) {
  const { t } = useI18n()
  const dragRef = useRef(null)
  const storms = gridData?.storms?.length ?? 0

  const onPointerDown = e => { dragRef.current = e.clientY }
  const onPointerUp = e => {
    const start = dragRef.current
    dragRef.current = null
    if (start === null) return
    const dy = e.clientY - start
    if (dy < -SWIPE_PX) onSheetOpenChange(true)
    else if (dy > SWIPE_PX) onSheetOpenChange(false)
  }

  const summary = gridData
    ? `${formatTemperature(gridData.avgT, prefs.tempUnit)} · ${formatWind(gridData.avgWind, prefs.windUnit, 0)}`
    : t('mobile.connecting')

  return (
    <>
      <header className="topbar glass">
        <button type="button" className="btn btn--icon btn--ghost" aria-label={t('search.label')}
          aria-expanded={searchOpen} onClick={() => onSearchOpenChange(!searchOpen)}>🔍</button>
        <div className="topbar__title">
          <h1 className="brand__title">{t('app.title')}</h1>
          <StatusIndicator status={status} />
        </div>
        <div className="topbar__actions">
          <button type="button" className="btn btn--icon btn--ghost" onClick={onSettings} aria-label={t('hud.settings')}>⚙️</button>
          <button type="button" className="btn btn--icon btn--ghost" onClick={onHelp} aria-label={t('hud.aboutShort')}>❔</button>
        </div>
      </header>

      {searchOpen && (
        <div className="mobile-search glass">
          <SearchBar ref={searchRef} autoFocus onSelect={(lat, lon, name) => {
            onSearchOpenChange(false)
            onSearchSelect(lat, lon, name)
          }} />
        </div>
      )}

      {!sheetOpen && !floatingHidden && <Legend mode={overlayMode} prefs={prefs} className="legend--mobile" />}

      <div className={`fab-stack${sheetOpen || floatingHidden ? ' is-hidden' : ''}`}>
        {storms > 0 && (
          <button type="button" className="btn btn--icon glass" aria-pressed={tourActive} onClick={onToggleTour}
            aria-label={tourActive ? t('storms.stopTour') : t('storms.tour', { count: storms })}
            style={{ '--tone': '#a855f7' }}>🌀</button>
        )}
        <button type="button" className="btn btn--icon glass" onClick={onOpenTime}
          aria-label={t('mobile.openTime')}>📡</button>
        <button type="button" className="btn btn--icon glass" onClick={() => globeApi.current?.reset()}
          aria-label={t('toolbar.reset')}><Icon name="reset" size={20} /></button>
      </div>

      <section className={`sheet glass${sheetOpen ? ' is-open' : ''}`} aria-label={t('mobile.controls')}>
        <button type="button" className="sheet__handle" aria-expanded={sheetOpen}
          aria-label={sheetOpen ? t('mobile.collapse') : t('mobile.expand')}
          onClick={() => onSheetOpenChange(!sheetOpen)}
          onPointerDown={onPointerDown} onPointerUp={onPointerUp}
          onPointerCancel={() => { dragRef.current = null }}>
          <span />
        </button>

        <div className="sheet__layers">
          <LayerSwitcher value={overlayMode} onChange={onOverlayMode} showLabels={false} className="layers layers--full" />
        </div>

        <div className="sheet__peek">
          <button type="button" className="sheet__summary" onClick={() => onSheetOpenChange(!sheetOpen)}
            aria-label={t('mobile.summary', { summary, storms })}>
            <span aria-hidden="true">🌐</span>
            <span className="sheet__summary-text">{summary}</span>
            {storms > 0 && <span className="sheet__badge" aria-hidden="true">🌀{storms}</span>}
          </button>
          <div className="event-strip" role="group" aria-label={t('mobile.injectGroup')}>
            {EVENTS.map(ev => (
              <button key={ev.id} type="button" className="btn btn--icon" style={{ '--tone': ev.tone }}
                aria-pressed={placementMode === ev.id} aria-label={t('mobile.place', { event: t(`event.${ev.id}`).toLocaleLowerCase() })}
                onClick={() => onStartPlacement(placementMode === ev.id ? null : ev.id)}>
                {ev.icon}
              </button>
            ))}
          </div>
        </div>

        <div className="sheet__body">
          <section aria-label={t('mobile.intensitySection')}>
            <h2 className="eyebrow">{t('events.heading')}</h2>
            <IntensitySlider value={intensity} onChange={onIntensity} />
            <p className="muted" style={{ margin: '6px 0 0' }}>
              {t('mobile.pickHint')}
            </p>
          </section>

          <section aria-label={t('speed.label')}>
            <h2 className="eyebrow">{t('mobile.speed')}</h2>
            <SpeedControl speed={speed} disabled={speedBusy} onChange={onSpeedChange} />
          </section>

          {locations?.length > 0 && (
            <section aria-label={t('mobile.cities')}>
              <h2 className="eyebrow">{t('mobile.seedHeading')} {seeding && <span className="spinner" aria-hidden="true">⟳</span>}</h2>
              <CityChips className="chips chips--wrap" locations={locations} activeCity={activeCity}
                busy={seeding} onSelect={(lat, lon, name) => { onSeed(lat, lon, name); onSheetOpenChange(false) }} />
            </section>
          )}

          {gridData && (
            <section aria-label={t('mobile.statistics')}>
              <h2 className="eyebrow">{t('mobile.liveStats')}</h2>
              <div className="stat-tiles">
                <div className="stat-tile">
                  <div className="stat-label">{t('stats.meanTemp')}</div>
                  <div className="stat-value" style={{ color: '#f97316' }}>{formatTemperature(gridData.avgT, prefs.tempUnit)}</div>
                </div>
                <div className="stat-tile">
                  <div className="stat-label">{t('stats.meanWind')}</div>
                  <div className="stat-value" style={{ color: '#38bdf8' }}>{formatWind(gridData.avgWind, prefs.windUnit)}</div>
                </div>
                <div className="stat-tile">
                  <div className="stat-label">{t('stats.storms')}</div>
                  <div className="stat-value" style={{ color: '#a855f7' }}>{storms || '—'}</div>
                </div>
                <div className="stat-tile">
                  <div className="stat-label">{t('stats.online')}</div>
                  <div className="stat-value" style={{ color: '#34d399' }}>{gridData.viewers ?? '—'}</div>
                </div>
              </div>
            </section>
          )}

          <section aria-label={t('feed.recent')}>
            <h2 className="eyebrow">{t('feed.recent')}</h2>
            <EventFeed events={gridData?.events} serverTime={gridData?.serverTime} limit={6}
              onFocus={(lat, lon) => { onFocus(lat, lon); onSheetOpenChange(false) }} />
          </section>

          <section aria-label={t('mobile.tools')}>
            <h2 className="eyebrow">{t('mobile.tools')}</h2>
            <div className="tool-grid">
              <button type="button" className="btn" onClick={() => { onSheetOpenChange(false); onOpenTime() }}>{t('tools.time')}</button>
              <button type="button" className="btn" onClick={onShare}><Icon name="link" /> {t('tools.share')}</button>
              <button type="button" className="btn" onClick={() => globeApi.current?.screenshot()}><Icon name="camera" /> {t('tools.screenshot')}</button>
              {fullscreen.supported && (
                <button type="button" className="btn" aria-pressed={fullscreen.active} onClick={fullscreen.toggle}>
                  <Icon name={fullscreen.active ? 'compress' : 'expand'} /> {fullscreen.active ? t('tools.exitFullscreen') : t('tools.fullscreen')}
                </button>
              )}
            </div>
          </section>
        </div>
      </section>
    </>
  )
}
