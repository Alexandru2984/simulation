import { useState, useCallback, useEffect } from 'react'

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
  const temp = snapAvgT(snap)
  const t = temp ?? 15
  // Map -10..40 → blue to orange
  const ratio = Math.max(0, Math.min(1, (t + 10) / 50))
  const r = Math.round(ratio * 255)
  const g = Math.round(120 - ratio * 40)
  const b = Math.round(255 - ratio * 205)
  const color = `rgb(${r},${g},${b})`
  return (
    <button onClick={onClick} style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
      padding: '5px 6px', minWidth: 52, flexShrink: 0,
      background: isSelected ? '#1d4ed833' : 'transparent',
      border: `1px solid ${isSelected ? '#3b82f6' : '#1e293b'}`,
      borderRadius: 8, cursor: 'pointer',
    }}>
      <div style={{
        width: 26, height: 26, borderRadius: 5, background: color,
        border: `2px solid ${isSelected ? '#3b82f6' : '#1e293b55'}`,
      }} />
      <div style={{ color: '#64748b', fontSize: '0.58rem' }}>s{snap.step}</div>
      {temp !== null && (
        <div style={{ color, fontSize: '0.6rem', fontWeight: 700, lineHeight: 1 }}>
          {temp.toFixed(1)}°
        </div>
      )}
    </button>
  )
}

export default function ForecastPanel({ onPreviewSnap }) {
  const isMobile = useIsMobile()
  const [expanded, setExpanded]           = useState(false)
  const [tab, setTab]                     = useState('forecast')
  const [forecastData, setForecastData]   = useState(null)
  const [historyData, setHistoryData]     = useState(null)
  const [loading, setLoading]             = useState(false)
  const [selectedForecast, setSelectedForecast] = useState(null)
  const [historyIdx, setHistoryIdx]       = useState(0)
  const [isPreview, setIsPreview]         = useState(false)

  const goLive = useCallback(() => {
    setIsPreview(false)
    setSelectedForecast(null)
    onPreviewSnap(null)
  }, [onPreviewSnap])

  const loadForecast = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/grid/forecast', {
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
      const res = await fetch('/api/grid/history?limit=30')
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

  const handleHistorySlider = useCallback((e) => {
    const idx = Number(e.target.value)
    setHistoryIdx(idx)
    if (historyData?.[idx]) {
      setIsPreview(true)
      onPreviewSnap(historyData[idx])
    }
  }, [historyData, onPreviewSnap])

  const tempDelta = (() => {
    if (!forecastData || forecastData.length < 2) return null
    const t0 = snapAvgT(forecastData[0])
    const tN = snapAvgT(forecastData[forecastData.length - 1])
    if (t0 === null || tN === null) return null
    return tN - t0
  })()

  const toggleBtn = (
    <button
      onClick={() => setExpanded(e => !e)}
      title="Time Navigator"
      style={{
        width: 44, height: 44, borderRadius: 12,
        background: expanded ? '#1d4ed8cc' : '#0f172aee',
        border: `1px solid ${expanded ? '#3b82f6' : '#1e293b'}`,
        color: '#e2e8f0', fontSize: '1.2rem', cursor: 'pointer',
        backdropFilter: 'blur(10px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 2px 16px #00000055',
      }}
    >🔮</button>
  )

  const panelContent = (
    <div style={{
      background: '#0f172aee',
      border: '1px solid #1e293b',
      borderRadius: isMobile ? '16px 16px 0 0' : 16,
      padding: '12px',
      backdropFilter: 'blur(12px)',
      boxShadow: '0 4px 24px #00000077',
      width: isMobile ? '100%' : 280,
      maxHeight: isMobile ? '52vh' : '62vh',
      overflowY: 'auto',
      display: 'flex', flexDirection: 'column', gap: 10,
      boxSizing: 'border-box',
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: '#94a3b8', fontSize: '0.78rem', fontWeight: 600 }}>
          📡 Time Navigator
        </span>
        <div style={{ display: 'flex', gap: 6 }}>
          {isPreview && (
            <button onClick={goLive} style={{
              padding: '3px 10px', borderRadius: 6, fontSize: '0.7rem',
              background: '#22c55e22', border: '1px solid #22c55e',
              color: '#22c55e', cursor: 'pointer',
            }}>▶ Live</button>
          )}
          {isMobile && (
            <button onClick={() => setExpanded(false)} style={{
              padding: '3px 8px', borderRadius: 6, fontSize: '0.7rem',
              background: 'transparent', border: '1px solid #334155',
              color: '#64748b', cursor: 'pointer',
            }}>✕</button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, borderBottom: '1px solid #1e293b', paddingBottom: 8 }}>
        {[['forecast', '🔮 Forecast'], ['history', '📼 History']].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} style={{
            flex: 1, padding: '5px 0', borderRadius: 6, fontSize: '0.74rem',
            background: tab === id ? '#1d4ed833' : 'transparent',
            border: `1px solid ${tab === id ? '#3b82f6' : '#1e293b'}`,
            color: tab === id ? '#60a5fa' : '#475569',
            cursor: 'pointer',
          }}>{label}</button>
        ))}
      </div>

      {/* ── Forecast tab ── */}
      {tab === 'forecast' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button onClick={loadForecast} disabled={loading} style={{
            padding: '7px 0', borderRadius: 8, fontSize: '0.76rem',
            background: '#7c3aed22', border: '1px solid #7c3aed',
            color: '#a855f7', cursor: loading ? 'wait' : 'pointer',
            opacity: loading ? 0.7 : 1,
          }}>
            {loading ? '⟳ Running forecast…' : '🔮 Run Forecast (100 steps)'}
          </button>

          {forecastData && forecastData.length > 0 && (
            <>
              {tempDelta !== null && (
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '5px 9px', background: '#1e293b', borderRadius: 8,
                  fontSize: '0.72rem',
                }}>
                  <span style={{ color: '#475569' }}>Δ Avg T (0→end)</span>
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
                scrollbarWidth: 'thin', scrollbarColor: '#334155 transparent',
              }}>
                {forecastData.map((snap, i) => (
                  <SnapBox
                    key={i}
                    snap={snap}
                    isSelected={selectedForecast === i}
                    onClick={() => handleForecastSelect(snap, i)}
                  />
                ))}
              </div>
              <div style={{ color: '#334155', fontSize: '0.61rem', textAlign: 'center' }}>
                Click a snapshot to preview on globe
              </div>
            </>
          )}

          {forecastData && forecastData.length === 0 && !loading && (
            <div style={{ color: '#ef4444', fontSize: '0.72rem', textAlign: 'center' }}>
              Failed to load forecast data
            </div>
          )}
        </div>
      )}

      {/* ── History tab ── */}
      {tab === 'history' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button onClick={loadHistory} disabled={loading} style={{
            padding: '7px 0', borderRadius: 8, fontSize: '0.76rem',
            background: '#7c3aed22', border: '1px solid #7c3aed',
            color: '#a855f7', cursor: loading ? 'wait' : 'pointer',
            opacity: loading ? 0.7 : 1,
          }}>
            {loading ? '⟳ Loading history…' : '📼 Load History (30 snaps)'}
          </button>

          {historyData && historyData.length > 0 && (
            <>
              <div style={{ color: '#475569', fontSize: '0.68rem', textAlign: 'center' }}>
                {historyData.length} snapshots available — drag to replay
              </div>
              <input
                type="range"
                min={0}
                max={historyData.length - 1}
                value={historyIdx}
                onChange={handleHistorySlider}
                style={{ width: '100%', accentColor: '#3b82f6', cursor: 'pointer' }}
              />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <div style={{ padding: '5px 9px', background: '#1e293b', borderRadius: 8 }}>
                  <div style={{ color: '#475569', fontSize: '0.59rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Sim Time</div>
                  <div style={{ color: '#38bdf8', fontWeight: 700, fontSize: '0.85rem' }}>
                    {formatSimTime(historyData[historyIdx]?.simTime)}
                  </div>
                </div>
                <div style={{ padding: '5px 9px', background: '#1e293b', borderRadius: 8 }}>
                  <div style={{ color: '#475569', fontSize: '0.59rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Step</div>
                  <div style={{ color: '#94a3b8', fontWeight: 700, fontSize: '0.85rem' }}>
                    #{historyData[historyIdx]?.step ?? '—'}
                  </div>
                </div>
              </div>
            </>
          )}

          {historyData && historyData.length === 0 && !loading && (
            <div style={{ color: '#64748b', fontSize: '0.72rem', textAlign: 'center' }}>
              No history available yet
            </div>
          )}
        </div>
      )}
    </div>
  )

  // ── Mobile layout: floating button + bottom sheet ──────────────────────────
  if (isMobile) {
    return (
      <>
        {!expanded && (
          <button
            onClick={() => setExpanded(true)}
            title="Time Navigator"
            style={{
              position: 'fixed', bottom: 230, right: 12, zIndex: 25,
              width: 44, height: 44, borderRadius: 12,
              background: isPreview ? '#1d4ed8cc' : '#0f172aee',
              border: `1px solid ${isPreview ? '#3b82f6' : '#1e293b'}`,
              color: '#e2e8f0', fontSize: '1.2rem', cursor: 'pointer',
              backdropFilter: 'blur(10px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 2px 16px #00000055',
            }}
          >🔮</button>
        )}
        {expanded && (
          <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 35 }}>
            {panelContent}
          </div>
        )}
      </>
    )
  }

  // ── Desktop layout: right side panel ──────────────────────────────────────
  return (
    <div style={{
      position: 'absolute', right: 20, bottom: 140, zIndex: 20,
      display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end',
    }}>
      {toggleBtn}
      {isPreview && !expanded && (
        <button onClick={goLive} style={{
          padding: '3px 12px', borderRadius: 8, fontSize: '0.7rem',
          background: '#22c55e22', border: '1px solid #22c55e',
          color: '#22c55e', cursor: 'pointer',
        }}>▶ Live</button>
      )}
      {expanded && panelContent}
    </div>
  )
}
