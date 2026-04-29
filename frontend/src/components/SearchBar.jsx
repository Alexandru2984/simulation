import { useState, useEffect, useRef, useCallback } from 'react'

export default function SearchBar({ onSelect, isMobile }) {
  const [query, setQuery]     = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen]       = useState(false)
  const debounceRef           = useRef(null)
  const abortRef              = useRef(null)
  const wrapRef               = useRef(null)

  // Debounced search
  const handleChange = useCallback((e) => {
    const val = e.target.value
    setQuery(val)
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
            name: d.name,
            country: d.country,
            state: d.state || null,
            lat: d.lat,
            lon: d.lon,
          })))
          setOpen(true)
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
    onSelect(result.lat, result.lon, result.name)
  }, [onSelect])

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
    background: '#0f172aee', border: '1px solid #1e293b',
    borderRadius: 12, padding: '6px 12px',
    backdropFilter: 'blur(10px)',
    boxShadow: '0 2px 16px #00000044',
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: isMobile ? '100%' : 260 }}>
      <div style={pill}>
        <span style={{ fontSize: '0.9rem', opacity: 0.7 }}>🔍</span>
        <input
          value={query}
          onChange={handleChange}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Search city…"
          style={{
            background: 'transparent', border: 'none', outline: 'none',
            color: '#f1f5f9', fontSize: '0.82rem', flex: 1, minWidth: 0,
          }}
        />
        {loading && (
          <span style={{ color: '#475569', fontSize: '0.7rem' }}>⟳</span>
        )}
        {query && (
          <button onClick={() => { setQuery(''); setResults([]); setOpen(false) }}
            style={{ background: 'none', border: 'none', cursor: 'pointer',
              color: '#475569', fontSize: '0.85rem', padding: 0, lineHeight: 1 }}>
            ✕
          </button>
        )}
      </div>

      {open && results.length > 0 && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0,
          zIndex: 100, background: '#0f172a', border: '1px solid #1e293b',
          borderRadius: 12, overflow: 'hidden',
          boxShadow: '0 8px 32px #000000aa',
        }}>
          {results.map((r, i) => (
            <button key={i} onClick={() => handleSelect(r)} style={{
              display: 'block', width: '100%', textAlign: 'left',
              background: 'transparent', border: 'none',
              borderBottom: i < results.length - 1 ? '1px solid #1e293b' : 'none',
              padding: '9px 14px', cursor: 'pointer', color: '#e2e8f0',
              fontSize: '0.82rem', transition: 'background 0.15s',
            }}
              onMouseEnter={e => e.currentTarget.style.background = '#1e293b'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <span style={{ fontWeight: 600 }}>{r.name}</span>
              <span style={{ color: '#475569', marginLeft: 6 }}>
                {r.state ? `${r.state}, ` : ''}{r.country}
              </span>
              <span style={{ color: '#334155', fontSize: '0.72rem', marginLeft: 8 }}>
                {r.lat.toFixed(2)}°, {r.lon.toFixed(2)}°
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
