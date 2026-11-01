import { useRef } from 'react'
import SearchBar from './SearchBar'
import Legend from './Legend'
import EventFeed from './EventFeed'
import { IntensitySlider } from './EventPanel'
import { CityChips, LayerSwitcher, SpeedControl, StatusIndicator } from './HudParts'
import { EVENTS } from '../constants'
import Icon from './Icon'
import { formatTemperature, formatWind } from '../utils/units'

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
    : 'Connecting…'

  return (
    <>
      <header className="topbar glass">
        <button type="button" className="btn btn--icon btn--ghost" aria-label="Search for a city"
          aria-expanded={searchOpen} onClick={() => onSearchOpenChange(!searchOpen)}>🔍</button>
        <div className="topbar__title">
          <h1 className="brand__title">Weather Simulation</h1>
          <StatusIndicator status={status} />
        </div>
        <div className="topbar__actions">
          <button type="button" className="btn btn--icon btn--ghost" onClick={onSettings} aria-label="Settings">⚙️</button>
          <button type="button" className="btn btn--icon btn--ghost" onClick={onHelp} aria-label="About">❔</button>
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
            aria-label={tourActive ? 'Stop storm tour' : `Tour ${storms} active storms`}
            style={{ '--tone': '#a855f7' }}>🌀</button>
        )}
        <button type="button" className="btn btn--icon glass" onClick={onOpenTime}
          aria-label="Open the time navigator">📡</button>
        <button type="button" className="btn btn--icon glass" onClick={() => globeApi.current?.reset()}
          aria-label="Reset view"><Icon name="reset" size={20} /></button>
      </div>

      <section className={`sheet glass${sheetOpen ? ' is-open' : ''}`} aria-label="Simulation controls">
        <button type="button" className="sheet__handle" aria-expanded={sheetOpen}
          aria-label={sheetOpen ? 'Collapse controls' : 'Expand controls'}
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
            aria-label={`Global mean ${summary}. ${storms} storms. Show details`}>
            <span aria-hidden="true">🌐</span>
            <span className="sheet__summary-text">{summary}</span>
            {storms > 0 && <span className="sheet__badge" aria-hidden="true">🌀{storms}</span>}
          </button>
          <div className="event-strip" role="group" aria-label="Inject an event">
            {EVENTS.map(ev => (
              <button key={ev.id} type="button" className="btn btn--icon" style={{ '--tone': ev.tone }}
                aria-pressed={placementMode === ev.id} aria-label={`Place ${ev.label.toLowerCase()}`}
                onClick={() => onStartPlacement(placementMode === ev.id ? null : ev.id)}>
                {ev.icon}
              </button>
            ))}
          </div>
        </div>

        <div className="sheet__body">
          <section aria-label="Event intensity">
            <h2 className="eyebrow">Inject event</h2>
            <IntensitySlider value={intensity} onChange={onIntensity} />
            <p className="muted" style={{ margin: '6px 0 0' }}>
              Pick an event above, then tap the globe to place it.
            </p>
          </section>

          <section aria-label="Simulation speed">
            <h2 className="eyebrow">Speed</h2>
            <SpeedControl speed={speed} disabled={speedBusy} onChange={onSpeedChange} />
          </section>

          {locations?.length > 0 && (
            <section aria-label="Cities">
              <h2 className="eyebrow">Seed from a city {seeding && <span className="spinner" aria-hidden="true">⟳</span>}</h2>
              <CityChips className="chips chips--wrap" locations={locations} activeCity={activeCity}
                busy={seeding} onSelect={(lat, lon, name) => { onSeed(lat, lon, name); onSheetOpenChange(false) }} />
            </section>
          )}

          {gridData && (
            <section aria-label="Statistics">
              <h2 className="eyebrow">Live statistics</h2>
              <div className="stat-tiles">
                <div className="stat-tile">
                  <div className="stat-label">Mean temp</div>
                  <div className="stat-value" style={{ color: '#f97316' }}>{formatTemperature(gridData.avgT, prefs.tempUnit)}</div>
                </div>
                <div className="stat-tile">
                  <div className="stat-label">Mean wind</div>
                  <div className="stat-value" style={{ color: '#38bdf8' }}>{formatWind(gridData.avgWind, prefs.windUnit)}</div>
                </div>
                <div className="stat-tile">
                  <div className="stat-label">Storms</div>
                  <div className="stat-value" style={{ color: '#a855f7' }}>{storms || '—'}</div>
                </div>
                <div className="stat-tile">
                  <div className="stat-label">Online</div>
                  <div className="stat-value" style={{ color: '#34d399' }}>{gridData.viewers ?? '—'}</div>
                </div>
              </div>
            </section>
          )}

          <section aria-label="Recent events">
            <h2 className="eyebrow">Recent events</h2>
            <EventFeed events={gridData?.events} serverTime={gridData?.serverTime} limit={6}
              onFocus={(lat, lon) => { onFocus(lat, lon); onSheetOpenChange(false) }} />
          </section>

          <section aria-label="Tools">
            <h2 className="eyebrow">Tools</h2>
            <div className="tool-grid">
              <button type="button" className="btn" onClick={() => { onSheetOpenChange(false); onOpenTime() }}>📡 Time navigator</button>
              <button type="button" className="btn" onClick={onShare}><Icon name="link" /> Share view</button>
              <button type="button" className="btn" onClick={() => globeApi.current?.screenshot()}><Icon name="camera" /> Screenshot</button>
              {fullscreen.supported && (
                <button type="button" className="btn" aria-pressed={fullscreen.active} onClick={fullscreen.toggle}>
                  <Icon name={fullscreen.active ? 'compress' : 'expand'} /> {fullscreen.active ? 'Exit fullscreen' : 'Fullscreen'}
                </button>
              )}
            </div>
          </section>
        </div>
      </section>
    </>
  )
}
