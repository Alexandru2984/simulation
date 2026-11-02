import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { isLoaded, loadLanguage, resolveLanguage, setLanguage, translate } from './i18n.js'

const I18nContext = createContext({ lang: 'en', t: (key, params) => translate('en', key, params) })

export const I18nProvider = I18nContext.Provider

// { lang, t } for components.
export const useI18n = () => useContext(I18nContext)

// Resolves the user's choice ('auto', 'en', 'ro') at the app root and returns
// the value for <I18nProvider>. A language whose dictionary is still loading
// shows in English for that moment (behind the splash on first load).
// Formatters outside React read the same language through getLanguage().
export function useLanguage(choice) {
  const browser = typeof navigator === 'undefined' ? [] : navigator.languages ?? [navigator.language]
  const wanted = resolveLanguage(choice, browser)
  const [, setArrivals] = useState(0)
  const lang = isLoaded(wanted) ? wanted : 'en'
  setLanguage(lang)

  useEffect(() => {
    if (isLoaded(wanted)) return undefined
    let current = true
    loadLanguage(wanted)
      .then(() => { if (current) setArrivals(n => n + 1) })
      // Offline, or a chunk from before a deploy: stay in English.
      .catch(() => {})
    return () => { current = false }
  }, [wanted])

  const value = useMemo(() => ({ lang, t: (key, params) => translate(lang, key, params) }), [lang])
  useEffect(() => {
    document.documentElement.lang = lang
    document.title = translate(lang, 'app.documentTitle')
  }, [lang])
  return value
}
