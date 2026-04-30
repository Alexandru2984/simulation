import { useState, useCallback, useEffect, useRef } from 'react'

function useIsMobile() {
  const [mobile, setMobile] = useState(window.innerWidth < 768)
  useEffect(() => {
    const h = () => setMobile(window.innerWidth < 768)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])
  return mobile
}

function formatSimTime(secs) {
  const s = Math.floor(secs ?? 0)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return [h, m, sec].map(n => String(n).padStart(2, '0')).join(':')
}

function snapAvgT(snap) {
  if (!snap?.T?.length) return null
  return snap.T.reduce((a, b) => a + b, 0) / snap.T.length
}

function SnapBox({ snap, isSelected, onClick }) {
  const temp  = snapAvgT(snap)
  const t     = temp ?? 15
  const ratio = Math.max(0, Math.min(1, (t + 10) / 50))
  const r = Math.round(ratio * 255)
  const g = Math.round(120 - ratio * 40)
  const b = Math.round(255 - ratio * 205)
  const color = `rgb(${r},${g},${b})`
  return (
    <button onClick={onClick} style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
      padding: '5px 6px', minWidth: 50, flexShrink: 0,
      background: isSelected ? 'rgba(29,78,216,0.25)' : 'transparent',
      border: `1px solid ${isSelected ? '#3b82f6' : 'rgba(255,255,255,0.07)'}`,
      borderRadius: 8, cursor: 'pointer',
      transition: 'all 0.15s ease',
    }}>
      <div style={{
        width: 24, height: 24, borderRadius: 5, background: color,
        border: `2px solid ${isSelected ? '#3b82f6' : 'rgba(255,255,255,0.1)'}`,
      }} />
      <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.55rem' }}>s{snap.step}</div>
      {temp !== null && (
        <div style={{ color, fontSize: '0.58rem', fontWeight: 700, lineHeight: 1 }}>
          {temp.toFixed(1)}°
        </div>
      )}
    </button>
  )
}

const GLASS = {
  background: 'rgba(10,15,30,0.82)',
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  border: '1px solid rgba(255,255,255,0.08)',
}

const TABS = [
  { id: 'forecast', icon: '🔮', label: 'Forecast' },
  { id: 'history',  icon: '📼', label: 'History'  },
]

export default function ForecastPanel({ onPreviewSnap }) {
  const isMobile = useIsMobile()
  const [expanded, setExpanded]                 = useState(false)
  const [tab, setTab]                           = useState('forecast')
  const [forecastData, setForecastData]         = useState(null)
  const [historyData, setHistoryData]           = useState(null)
  const [loading, setLoading]                   = useState(false)
  const [selectedForecast, setSelectedForecast] = useState(null)
  const [historyIdx, setHistoryIdx]             = useState(0)
  const [isPreview, setIsPreview]               = useState(false)
  const [playing, setPlaying]                   = useState(false)
  const [playSpeed, setPlaySpeed]               = useState(1)   // frames per tick
  const playRef                                 = useRef(null)

  const goLive = useCallback(() => {
    setIsPreview(false)
    setSelectedForecast(null)
    onPreviewSnap(null)
  }, [onPreviewSnap])

  const loadForecast = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch('/api/grid/forecast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ steps: 100 }),
      })
      const data = await res.json()
      setForecastData(Array.isArray(data) ? data : [])
    } catch (_) {
      setForecastData([])
    } finally {
      setLoading(false)
    }
  }, [])

  const loadHistory = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch('/api/grid/history?limit=30')
      const data = await res.json()
      setHistoryData(Array.isArray(data) ? data : [])
      setHistoryIdx(0)
    } catch (_) {
      setHistoryData([])
    } finally {
      setLoading(false)
    }
  }, [])

  const handleForecastSelect = useCallback((snap, i) => {
    setSelectedForecast(i)
    setIsPreview(true)
    onPreviewSnap(snap)
  }, [onPreviewSnap])

  const handleHistorySlider = useCallback(e => {
    const idx = Number(e.target.value)
    setHistoryIdx(idx)
    if (historyData?.[idx]) { setIsPreview(true); onPreviewSnap(historyData[idx]) }
  }, [historyData, onPreviewSnap])

  // Auto-play: advance history slider at playSpeed frames per 200ms tick
  useEffect(() => {
    if (playing && historyData?.length > 0) {
      playRef.current = setInterval(() => {
        setHistoryIdx(prev => {
          const next = prev + playSpeed >= historyData.length ? 0 : prev + playSpeed
          if (historyData[next]) { setIsPreview(true); onPreviewSnap(historyData[next]) }
          return next
        })
      }, 200)
    }
    return () => clearInterval(playRef.current)
  }, [playing, playSpeed, historyData, onPreviewSnap])

  // Stop playback when switching tabs or collapsing
  useEffect(() => { if (!expanded) setPlaying(false) }, [expanded])

  const tempDelta = (() => {
    if (!forecastData || forecastData.length < 2) return null
    const t0 = snapAvgT(forecastData[0])
    const tN = snapAvgT(forecastData[forecastData.length - 1])
    if (t0 === null || tN === null) return null
    return tN - t0
  })()

  // Shared panel body (tab content only, no header)
  const tabContent = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 8 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            flex: 1, padding: '5px 0', borderRadius: 8, fontSize: '0.74rem',
            background: tab === t.id ? 'rgba(29,78,216,0.22)' : 'transparent',
            border: `1px solid ${tab === t.id ? '#3b82f666' : 'rgba(255,255,255,0.07)'}`,
            color: tab === t.id ? '#60a5fa' : 'rgba(255,255,255,0.38)',
            cursor: 'pointer', transition: 'all 0.15s',
          }}>{t.icon} {t.label}</button>
        ))}
      </div>

      {/* Forecast tab */}
      {tab === 'forecast' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button onClick={loadForecast} disabled={loading} style={{
            padding: '7px 0', borderRadius: 8, fontSize: '0.76rem',
            background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(124,58,237,0.5)',
            color: '#a855f7', cursor: loading ? 'wait' : 'pointer',
            opacity: loading ? 0.7 : 1, transition: 'all 0.15s',
          }}>
            {loading ? '⟳ Running forecast…' : '🔮 Run Forecast (100 steps)'}
          </button>

          {forecastData && forecastData.length > 0 && (
            <>
              {tempDelta !== null && (
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '5px 9px', background: 'rgba(255,255,255,0.04)', borderRadius: 8, fontSize: '0.72rem',
                }}>
                  <span style={{ color: 'rgba(255,255,255,0.35)' }}>Δ Avg T (0→end)</span>
                  <span style={{
                    color: tempDelta > 0.05 ? '#f97316' : tempDelta < -0.05 ? '#60a5fa' : '#94a3b8',
                    fontWeight: 700,
                  }}>
                    {tempDelta > 0.05 ? '↑' : tempDelta < -0.05 ? '↓' : '→'}&nbsp;
                    {Math.abs(tempDelta).toFixed(2)}°C
                  </span>
                </div>
              )}
              <div style={{
                display: 'flex', gap: 4, overflowX: 'auto', paddingBottom: 4,
                scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.1) transparent',
              }}>
                {forecastData.map((snap, i) => (
                  <SnapBox key={i} snap={snap} isSelected={selectedForecast === i}
                    onClick={() => handleForecastSelect(snap, i)} />
                ))}
              </div>
              <div style={{ color: 'rgba(255,255,255,0.2)', fontSize: '0.6rem', textAlign: 'center' }}>
                Click a snapshot to preview on globe
              </div>
            </>
          )}

          {forecastData && forecastData.length === 0 && !loading && (
            <div style={{ color: '#ef4444', fontSize: '0.72rem', textAlign: 'center' }}>Failed to load forecast data</div>
          )}
        </div>
      )}

      {/* History tab */}
      {tab === 'history' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button onClick={loadHistory} disabled={loading} style={{
            padding: '7px 0', borderRadius: 8, fontSize: '0.76rem',
            background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(124,58,237,0.5)',
            color: '#a855f7', cursor: loading ? 'wait' : 'pointer',
            opacity: loading ? 0.7 : 1, transition: 'all 0.15s',
          }}>
            {loading ? '⟳ Loading history…' : '📼 Load History (30 snaps)'}
          </button>

          {historyData && historyData.length > 0 && (
            <>
              {/* Playback controls */}
              <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                <button onClick={() => setPlaying(p => !p)} style={{
                  flex: 1, padding: '6px 0', borderRadius: 8, fontSize: '0.8rem',
                  background: playing ? 'rgba(239,68,68,0.15)' : 'rgba(59,130,246,0.15)',
                  border: `1px solid ${playing ? '#ef4444' : '#3b82f6'}`,
                  color: playing ? '#ef4444' : '#60a5fa',
                  cursor: 'pointer', fontWeight: 700,
                }}>
                  {playing ? '⏸ Pause' : '▶ Play'}
                </button>
                {[1, 2, 4].map(s => (
                  <button key={s} onClick={() => setPlaySpeed(s)} style={{
                    width: 34, padding: '6px 0', borderRadius: 8, fontSize: '0.72rem',
                    background: playSpeed === s ? 'rgba(59,130,246,0.2)' : 'transparent',
                    border: `1px solid ${playSpeed === s ? '#3b82f6' : 'rgba(255,255,255,0.1)'}`,
                    color: playSpeed === s ? '#60a5fa' : 'rgba(255,255,255,0.3)',
                    cursor: 'pointer',
                  }}>{s}×</button>
                ))}
              </div>

              <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: '0.63rem', textAlign: 'center' }}>
                {historyData.length} snapshots · {historyIdx + 1}/{historyData.length}
              </div>
              <input type="range" min={0} max={historyData.length - 1} value={historyIdx}
                onChange={handleHistorySlider}
                style={{ width: '100%', accentColor: '#3b82f6', cursor: 'pointer' }} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <div style={{ padding: '5px 9px', background: 'rgba(255,255,255,0.04)', borderRadius: 8 }}>
                  <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.59rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Sim Time</div>
                  <div style={{ color: '#38bdf8', fontWeight: 700, fontSize: '0.85rem' }}>
                    {formatSimTime(historyData[historyIdx]?.simTime)}
                  </div>
                </div>
                <div style={{ padding: '5px 9px', background: 'rgba(255,255,255,0.04)', borderRadius: 8 }}>
                  <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.59rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Step</div>
                  <div style={{ color: '#94a3b8', fontWeight: 700, fontSize: '0.85rem' }}>
                    #{historyData[historyIdx]?.step ?? '—'}
                  </div>
                </div>
              </div>
            </>
          )}

          {historyData && historyData.length === 0 && !loading && (
            <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.72rem', textAlign: 'center' }}>No history available yet</div>
          )}
        </div>
      )}
    </div>
  )

  // ── Mobile: floating button + bottom sheet ────────────────────────────────
  if (isMobile) {
    return (
      <>
        {!expanded && (
          <button onClick={() => setExpanded(true)} title="Time Navigator" style={{
            position: 'fixed', bottom: 124, right: 12, zIndex: 28,
            width: 44, height: 44, borderRadius: 12,
            ...GLASS,
            background: isPreview ? 'rgba(29,78,216,0.3)' : 'rgba(10,15,30,0.82)',
            border: `1px solid ${isPreview ? '#3b82f6' : 'rgba(255,255,255,0.08)'}`,
            color: '#e2e8f0', fontSize: '1.2rem', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 2px 16px rgba(0,0,0,0.5)',
          }}>🔮</button>
        )}
        {expanded && (
          <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 38 }}>
            <div style={{
              ...GLASS,
              borderRadius: '16px 16px 0 0',
              borderBottom: 'none', borderLeft: 'none', borderRight: 'none',
              padding: '14px 14px 24px',
              maxHeight: '55vh', overflowY: 'auto',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.78rem', fontWeight: 600 }}>📡 Time Navigator</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  {isPreview && (
                    <button onClick={goLive} style={{
                      padding: '3px 10px', borderRadius: 6, fontSize: '0.7rem',
                      background: 'rgba(34,197,94,0.15)', border: '1px solid #22c55e',
                      color: '#22c55e', cursor: 'pointer',
                    }}>▶ Live</button>
                  )}
                  <button onClick={() => setExpanded(false)} style={{
                    padding: '3px 8px', borderRadius: 6, fontSize: '0.7rem',
                    background: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
                    color: 'rgba(255,255,255,0.4)', cursor: 'pointer',
                  }}>✕</button>
                </div>
              </div>
              {tabContent}
            </div>
          </div>
        )}
      </>
    )
  }

  // ── Desktop: right-side sliding panel with vertical tab strip ─────────────
  return (
    <div style={{
      position: 'absolute', right: 0,
      top: 56, bottom: 20,
      zIndex: 20,
      display: 'flex', alignItems: 'center',
    }}>
      {/* Expanded panel */}
      {expanded && (
        <div style={{
          ...GLASS,
          borderRadius: '16px 0 0 16px',
          borderRight: 'none',
          width: 268,
          maxHeight: 'calc(100% - 20px)',
          overflowY: 'auto',
          padding: '14px',
          display: 'flex', flexDirection: 'column', gap: 10,
          boxShadow: '-8px 0 32px rgba(0,0,0,0.4)',
          scrollbarWidth: 'thin',
          scrollbarColor: 'rgba(255,255,255,0.1) transparent',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.78rem', fontWeight: 600 }}>📡 Time Navigator</span>
            {isPreview && (
              <button onClick={goLive} style={{
                padding: '3px 10px', borderRadius: 6, fontSize: '0.7rem',
                background: 'rgba(34,197,94,0.15)', border: '1px solid #22c55e',
                color: '#22c55e', cursor: 'pointer',
              }}>▶ Live</button>
            )}
          </div>
          {tabContent}
        </div>
      )}

      {/* Vertical tab strip — always visible on right edge */}
      <div style={{
        ...GLASS,
        borderRadius: expanded ? '0 0 0 0' : '16px 0 0 16px',
        borderRight: 'none',
        borderLeft: expanded ? 'none' : '1px solid rgba(255,255,255,0.08)',
        padding: '10px 4px',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        gap: 4, justifyContent: 'center',
        boxShadow: expanded ? 'none' : '-4px 0 16px rgba(0,0,0,0.3)',
      }}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => {
              if (tab === t.id) setExpanded(e => !e)
              else { setTab(t.id); setExpanded(true) }
            }}
            style={{
              writingMode: 'vertical-rl',
              textOrientation: 'mixed',
              transform: 'rotate(180deg)',
              padding: '14px 7px',
              background: tab === t.id && expanded ? 'rgba(59,130,246,0.15)' : 'transparent',
              border: `1px solid ${tab === t.id && expanded ? 'rgba(59,130,246,0.4)' : 'transparent'}`,
              borderRadius: 8,
              color: tab === t.id && expanded ? '#60a5fa' : 'rgba(255,255,255,0.38)',
              cursor: 'pointer', fontSize: '0.7rem', fontWeight: 600,
              letterSpacing: '0.04em', whiteSpace: 'nowrap',
              transition: 'all 0.2s ease',
            }}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>
    </div>
  )
}
