import { useCallback, useEffect, useId, useImperativeHandle, useRef, useState } from 'react'
import { ApiError, apiErrorMessage, fetchErrorMessage } from '../utils/api'
import { formatNumber } from '../utils/units'
import { useI18n } from '../i18n/react'

// React 19: `ref` is a regular prop for function components.
export default function SearchBar({ onSelect, autoFocus = false, ref }) {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [activeIdx, setActiveIdx] = useState(-1)
  const debounceRef = useRef(null)
  const abortRef = useRef(null)
  const wrapRef = useRef(null)
  const inputRef = useRef(null)
  const listId = useId()

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
  }), [])

  // Cancel timers and in-flight requests on unmount.
  useEffect(() => () => {
    clearTimeout(debounceRef.current)
    abortRef.current?.abort()
  }, [])

  const reset = useCallback(() => {
    clearTimeout(debounceRef.current)
    abortRef.current?.abort()
    setResults([])
    setOpen(false)
    setMessage('')
    setActiveIdx(-1)
    setLoading(false)
  }, [])

  const runSearch = useCallback(async (text) => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setLoading(true)
    try {
      const res = await fetch(`/api/weather/search?q=${encodeURIComponent(text)}`,
        { signal: controller.signal })
      if (!res.ok) throw new ApiError(await apiErrorMessage(res))
      const data = await res.json()
      const list = Array.isArray(data) ? data.filter(d =>
        typeof d?.name === 'string' && Number.isFinite(d.lat) && Number.isFinite(d.lon)) : []
      setResults(list)
      setMessage(list.length ? '' : t('search.none'))
      setActiveIdx(list.length ? 0 : -1)
      setOpen(true)
    } catch (err) {
      if (err.name === 'AbortError') return
      setResults([])
      setMessage(fetchErrorMessage(err, 'search.failed'))
      setOpen(true)
    } finally {
      if (abortRef.current === controller) setLoading(false)
    }
  }, [t])

  const handleChange = useCallback((e) => {
    const value = e.target.value
    setQuery(value)
    // Always cancel the pending search first: a stale timer must not reopen
    // old results after the query was shortened or cleared.
    clearTimeout(debounceRef.current)
    abortRef.current?.abort()
    if (value.trim().length < 2) {
      setResults([])
      setOpen(false)
      setMessage('')
      setLoading(false)
      return
    }
    debounceRef.current = setTimeout(() => runSearch(value.trim()), 300)
  }, [runSearch])

  const handleSelect = useCallback((result) => {
    setQuery(result.country ? `${result.name}, ${result.country}` : result.name)
    reset()
    inputRef.current?.blur()
    onSelect(result.lat, result.lon, result.name)
  }, [onSelect, reset])

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      if (open) { setOpen(false); return }
      inputRef.current?.blur()
      return
    }
    if (!open || results.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx(i => (i + 1) % results.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx(i => (i - 1 + results.length) % results.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      handleSelect(results[Math.max(0, activeIdx)])
    }
  }, [open, results, activeIdx, handleSelect])

  useEffect(() => {
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', handler)
    return () => document.removeEventListener('pointerdown', handler)
  }, [])

  const showList = open && (results.length > 0 || message)
  const activeId = activeIdx >= 0 ? `${listId}-opt-${activeIdx}` : undefined

  return (
    <div ref={wrapRef} className="search" role="search">
      <div className="search__field">
        <span aria-hidden="true">🔍</span>
        <label className="sr-only" htmlFor={`${listId}-input`}>{t('search.label')}</label>
        <input
          id={`${listId}-input`}
          ref={inputRef}
          className="search__input"
          type="search"
          value={query}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => (results.length > 0 || message) && setOpen(true)}
          placeholder={t('search.placeholder')}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
          maxLength={100}
          autoFocus={autoFocus}
          role="combobox"
          aria-expanded={Boolean(showList)}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList ? activeId : undefined}
        />
        {loading && <span className="spinner" aria-hidden="true">⟳</span>}
        {query && !loading && (
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => { setQuery(''); reset(); inputRef.current?.focus() }}
            aria-label={t('search.clear')}
          >✕</button>
        )}
      </div>

      {showList && (
        <ul id={listId} className="search__results" role="listbox" aria-label={t('search.results')}>
          {results.map((r, i) => (
            <li
              key={`${r.name}-${r.lat}-${r.lon}`}
              id={`${listId}-opt-${i}`}
              role="option"
              aria-selected={i === activeIdx}
              className="search__option"
              onPointerDown={e => e.preventDefault()}
              onClick={() => handleSelect(r)}
              onPointerEnter={() => setActiveIdx(i)}
            >
              <span className="search__option-name">{r.name}</span>
              <span className="search__option-meta">
                {[r.state, r.country].filter(Boolean).join(', ')} · {formatNumber(r.lat, 2)}°, {formatNumber(r.lon, 2)}°
              </span>
            </li>
          ))}
          {results.length === 0 && message && <li className="search__empty" role="presentation">{message}</li>}
        </ul>
      )}
    </div>
  )
}
