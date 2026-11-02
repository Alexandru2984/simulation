import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, apiErrorMessage, fetchErrorMessage } from '../utils/api'
import { colorLut, lutIndex } from '../utils/colorScales'
import { formatNumber, formatSimTime, formatTemperature } from '../utils/units'
import { useI18n } from '../i18n/react'

// Area-weighted (cos latitude) global mean, matching the server's avgT.
function snapAvgT(snap) {
  const T = snap?.T
  if (!T?.length) return null
  const rows = snap.rows || 36
  const cols = snap.cols || Math.round(T.length / rows)
  let sum = 0
  let weights = 0
  for (let r = 0; r < rows; r++) {
    const w = Math.cos(((-90 + (r + 0.5) * (180 / rows)) * Math.PI) / 180)
    for (let c = 0; c < cols; c++) {
      const v = T[r * cols + c]
      if (Number.isFinite(v)) { sum += v * w; weights += w }
    }
  }
  return weights ? sum / weights : null
}

// Same colours as the temperature overlay and legend.
function swatchColor(temp) {
  const lut = colorLut('temp')
  const i = lutIndex('temp', temp ?? 15) * 4
  return `rgb(${lut[i]} ${lut[i + 1]} ${lut[i + 2]})`
}

function SnapBox({ snap, selected, onClick, tempUnit }) {
  const { t } = useI18n()
  const temp = snapAvgT(snap)
  const color = swatchColor(temp)
  return (
    <button type="button" className="btn snap" aria-pressed={selected} onClick={onClick}
      aria-label={t('forecast.snap', { step: snap.step, temp: formatTemperature(temp, tempUnit) })}>
      <span className="snap__swatch" style={{ background: color }} aria-hidden="true" />
      <span className="muted">s{snap.step}</span>
      {temp !== null && <strong style={{ color }}>{formatTemperature(temp, tempUnit, 1)}</strong>}
    </button>
  )
}

// Labels: t(`time.${id}`).
const TABS = [
  { id: 'forecast', icon: '🔮' },
  { id: 'history', icon: '📼' },
]

export default function ForecastPanel({ layout, open, onOpenChange, onPreviewSnap, isPreview, onGoLive, prefs, hidden }) {
  const { t } = useI18n()
  const isMobile = layout === 'mobile'
  const [tab, setTab] = useState('forecast')
  const [forecast, setForecast] = useState(null)
  const [history, setHistory] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selectedForecast, setSelectedForecast] = useState(null)
  const [historyIdx, setHistoryIdx] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [playSpeed, setPlaySpeed] = useState(1)
  const abortRef = useRef(null)

  useEffect(() => () => abortRef.current?.abort(), [])

  const request = useCallback(async (input, init, onData) => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setLoading(true)
    setError('')
    try {
      const res = await fetch(input, { ...init, signal: controller.signal })
      if (!res.ok) throw new ApiError(await apiErrorMessage(res))
      const data = await res.json()
      onData(Array.isArray(data) ? data : [])
    } catch (err) {
      if (err.name !== 'AbortError') setError(fetchErrorMessage(err))
    } finally {
      if (abortRef.current === controller) setLoading(false)
    }
  }, [])

  const loadForecast = useCallback(() => request('/api/grid/forecast', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ steps: 100 }),
  }, data => { setForecast(data); setSelectedForecast(null) }), [request])

  const loadHistory = useCallback(() => request('/api/grid/history?limit=30', undefined,
    data => { setHistory(data); setHistoryIdx(Math.max(0, data.length - 1)) }), [request])

  const selectForecast = useCallback((snap, i) => {
    setSelectedForecast(i)
    onPreviewSnap(snap)
  }, [onPreviewSnap])

  const scrub = useCallback(idx => {
    setHistoryIdx(idx)
    if (history?.[idx]) onPreviewSnap(history[idx])
  }, [history, onPreviewSnap])

  // Auto-play advances playSpeed frames every 200 ms and loops.
  useEffect(() => {
    if (!playing || !history?.length) return undefined
    const timer = setInterval(() => {
      setHistoryIdx(prev => {
        const next = prev + playSpeed >= history.length ? 0 : prev + playSpeed
        if (history[next]) onPreviewSnap(history[next])
        return next
      })
    }, 200)
    return () => clearInterval(timer)
  }, [playing, playSpeed, history, onPreviewSnap])

  useEffect(() => { if (!open) setPlaying(false) }, [open])
  useEffect(() => { if (!isPreview) { setSelectedForecast(null); setPlaying(false) } }, [isPreview])

  const tempDelta = (() => {
    if (!forecast || forecast.length < 2) return null
    const t0 = snapAvgT(forecast[0])
    const tN = snapAvgT(forecast[forecast.length - 1])
    return t0 === null || tN === null ? null : tN - t0
  })()

  const body = (
    <div className="stack">
      <div className="segmented" role="tablist" aria-label={t('time.navigator')} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
        {TABS.map(item => (
          <button key={item.id} type="button" role="tab" className="btn" aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}>{item.icon} {t(`time.${item.id}`)}</button>
        ))}
      </div>

      {tab === 'forecast' && (
        <div className="stack" role="tabpanel" aria-label={t('time.forecast')}>
          <button type="button" className="btn btn--primary btn--block" style={{ '--tone': '#a855f7' }}
            onClick={loadForecast} disabled={loading}>
            {loading ? <><span className="spinner" aria-hidden="true">⟳</span> {t('forecast.running')}</> : t('forecast.run')}
          </button>
          {forecast?.length > 0 && (
            <>
              {tempDelta !== null && (
                <div className="delta">
                  <span className="muted">{t('forecast.delta')}</span>
                  <strong style={{ color: tempDelta > 0.05 ? '#f97316' : tempDelta < -0.05 ? '#60a5fa' : '#94a3b8' }}>
                    {tempDelta > 0.05 ? '↑' : tempDelta < -0.05 ? '↓' : '→'} {formatNumber(Math.abs(tempDelta), 2)}°
                  </strong>
                </div>
              )}
              <div className="snaps">
                {forecast.map((snap, i) => (
                  <SnapBox key={snap.step ?? i} snap={snap} selected={selectedForecast === i}
                    tempUnit={prefs.tempUnit} onClick={() => selectForecast(snap, i)} />
                ))}
              </div>
              <p className="muted" style={{ margin: 0, textAlign: 'center' }}>{t('forecast.pick')}</p>
            </>
          )}
        </div>
      )}

      {tab === 'history' && (
        <div className="stack" role="tabpanel" aria-label={t('time.history')}>
          <button type="button" className="btn btn--primary btn--block" style={{ '--tone': '#a855f7' }}
            onClick={loadHistory} disabled={loading}>
            {loading ? <><span className="spinner" aria-hidden="true">⟳</span> {t('history.loading')}</> : t('history.load')}
          </button>
          {history?.length > 0 && (
            <>
              <div className="segmented" style={{ alignItems: 'center' }}>
                <button type="button" className="btn" style={{ flex: 1, '--tone': playing ? '#ef4444' : '#60a5fa' }}
                  aria-pressed={playing} onClick={() => setPlaying(p => !p)}>
                  {playing ? t('history.pause') : t('history.play')}
                </button>
                {[1, 2, 4].map(s => (
                  <button key={s} type="button" className="btn btn--sm" aria-pressed={playSpeed === s}
                    aria-label={t('history.playbackSpeed', { speed: s })} onClick={() => setPlaySpeed(s)}>{s}×</button>
                ))}
              </div>
              <label className="muted" htmlFor="history-scrubber" style={{ textAlign: 'center' }}>
                {t('history.snapshot', { index: historyIdx + 1, total: history.length })}
              </label>
              <input id="history-scrubber" className="range" type="range" min={0} max={history.length - 1}
                value={historyIdx} onChange={e => scrub(Number(e.target.value))} />
              <div className="kv">
                <div>
                  <div className="stat-label">{t('history.simTime')}</div>
                  <div className="stat-value" style={{ color: '#38bdf8' }}>{formatSimTime(history[historyIdx]?.simTime)}</div>
                </div>
                <div>
                  <div className="stat-label">{t('history.step')}</div>
                  <div className="stat-value">#{history[historyIdx]?.step ?? '—'}</div>
                </div>
              </div>
            </>
          )}
          {history?.length === 0 && !loading && <p className="muted" style={{ margin: 0, textAlign: 'center' }}>{t('history.empty')}</p>}
        </div>
      )}

      {error && <p className="error-text" role="alert">⚠ {error}</p>}
    </div>
  )

  const header = (
    <div className="stat-row" style={{ marginBottom: 10 }}>
      <h2 className="eyebrow" style={{ margin: 0 }}>{t('time.heading')}</h2>
      <div className="segmented">
        {isPreview && (
          <button type="button" className="btn btn--sm" style={{ '--tone': '#22c55e' }} aria-pressed="true"
            onClick={onGoLive}>{t('time.backToLive')}</button>
        )}
        {isMobile && (
          <button type="button" className="btn btn--sm btn--ghost" aria-label={t('time.close')}
            onClick={() => onOpenChange(false)}>✕</button>
        )}
      </div>
    </div>
  )

  if (isMobile) {
    if (!open || hidden) return null
    return (
      <section className="mobile-sheet-panel glass" aria-label={t('time.navigator')}>
        {header}
        {body}
      </section>
    )
  }

  return (
    <section className="time-dock" aria-label={t('time.navigator')}>
      {open && (
        <div className="time-panel glass panel is-open">
          {header}
          {body}
        </div>
      )}
      <div className="time-tabs glass" role="toolbar" aria-label={t('time.open')}>
        {TABS.map(item => (
          <button key={item.id} type="button" className="btn btn--ghost"
            aria-pressed={open && tab === item.id}
            onClick={() => {
              if (open && tab === item.id) onOpenChange(false)
              else { setTab(item.id); onOpenChange(true) }
            }}>
            <span aria-hidden="true">{item.icon}</span> {t(`time.${item.id}`)}
          </button>
        ))}
      </div>
    </section>
  )
}
