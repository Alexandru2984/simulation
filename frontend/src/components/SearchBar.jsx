import { useState, useEffect, useRef, useCallback } from 'react'

export default function SearchBar({ onSelect, isMobile }) {
  const [query, setQuery]         = useState('')
  const [results, setResults]     = useState([])
  const [loading, setLoading]     = useState(false)
  const [open, setOpen]           = useState(false)
  const [focusedIdx, setFocusedIdx] = useState(-1)
  const debounceRef               = useRef(null)
  const abortRef                  = useRef(null)
  const wrapRef                   = useRef(null)
  const listRef                   = useRef(null)

  // Debounced search
  const handleChange = useCallback((e) => {
    const val = e.target.value
    setQuery(val)
    setFocusedIdx(-1)
    if (val.length < 2) { setResults([]); setOpen(false); return }

    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      if (abortRef.current) abortRef.current.abort()
      abortRef.current = new AbortController()
      setLoading(true)
      try {
        const res = await fetch(`/api/weather/search?q=${encodeURIComponent(val)}`,
          { signal: abortRef.current.signal })
        if (!res.ok) throw new Error('failed')
        const data = await res.json()
        if (Array.isArray(data)) {
          setResults(data.map(d => ({
            name: d.name, country: d.country,
            state: d.state || null, lat: d.lat, lon: d.lon,
          })))
          setOpen(true)
          setFocusedIdx(-1)
        }
      } catch (err) {
        if (err.name !== 'AbortError') setResults([])
      } finally {
        setLoading(false)
      }
    }, 350)
  }, [])

  const handleSelect = useCallback((result) => {
    setQuery(`${result.name}, ${result.country}`)
    setOpen(false)
    setResults([])
    setFocusedIdx(-1)
    onSelect(result.lat, result.lon, result.name)
  }, [onSelect])

  const handleKeyDown = useCallback((e) => {
    if (!open || results.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setFocusedIdx(i => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setFocusedIdx(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const target = focusedIdx >= 0 ? results[focusedIdx] : results[0]
      if (target) handleSelect(target)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
      setFocusedIdx(-1)
    }
  }, [open, results, focusedIdx, handleSelect])

  // Scroll focused item into view
  useEffect(() => {
    if (focusedIdx >= 0 && listRef.current) {
      const item = listRef.current.children[focusedIdx]
      item?.scrollIntoView({ block: 'nearest' })
    }
  }, [focusedIdx])

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const pill = {
    position: 'relative',
    display: 'flex', alignItems: 'center', gap: 6,
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 999, padding: '6px 12px',
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: isMobile ? '100%' : 260 }}>
      <div style={pill}>
        <span style={{ fontSize: '0.9rem', opacity: 0.7 }}>🔍</span>
        <input
          value={query}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Search city…"
          autoComplete="off"
          style={{
            background: 'transparent', border: 'none', outline: 'none',
            color: '#f1f5f9', fontSize: '0.82rem', flex: 1, minWidth: 0,
          }}
        />
        {loading && (
          <span style={{ color: '#38bdf8', fontSize: '0.72rem', animation: 'spin 0.8s linear infinite' }}>⟳</span>
        )}
        {query && !loading && (
          <button onClick={() => { setQuery(''); setResults([]); setOpen(false); setFocusedIdx(-1) }}
            style={{ background: 'none', border: 'none', cursor: 'pointer',
              color: '#475569', fontSize: '0.85rem', padding: 0, lineHeight: 1 }}>
            ✕
          </button>
        )}
      </div>

      {open && results.length > 0 && (
        <div ref={listRef} style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0,
          zIndex: 100,
          background: 'rgba(10,15,30,0.96)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 12, overflow: 'hidden',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
          maxHeight: 240, overflowY: 'auto',
        }}>
          {results.map((r, i) => (
            <button key={i} onClick={() => handleSelect(r)} style={{
              display: 'block', width: '100%', textAlign: 'left',
              background: focusedIdx === i ? 'rgba(56,189,248,0.12)' : 'transparent',
              border: 'none',
              borderBottom: i < results.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none',
              padding: '9px 14px', cursor: 'pointer', color: '#e2e8f0',
              fontSize: '0.82rem', transition: 'background 0.12s',
            }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; setFocusedIdx(i) }}
              onMouseLeave={e => { e.currentTarget.style.background = focusedIdx === i ? 'rgba(56,189,248,0.12)' : 'transparent' }}
            >
              <span style={{ fontWeight: 600 }}>{r.name}</span>
              <span style={{ color: '#64748b', marginLeft: 6 }}>
                {r.state ? `${r.state}, ` : ''}{r.country}
              </span>
              <span style={{ color: '#334155', fontSize: '0.72rem', marginLeft: 8 }}>
                {r.lat.toFixed(2)}°, {r.lon.toFixed(2)}°
              </span>
            </button>
          ))}
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
      `}</style>
    </div>
  )
}

