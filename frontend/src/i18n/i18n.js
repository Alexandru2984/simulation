// Interface language: dictionaries, detection, plural-aware translation.
// Pure module (no React, no DOM), so it runs under `node --test`.
//
// A message is a string with {placeholders}, or an object of plural forms
// keyed by Intl.PluralRules categories ({ one, few, other }) and chosen by
// the `count` parameter. Missing keys fall back to English, then to the key.
//
// English is in the main bundle: it is the fallback and most visitors' choice.
// Every other language is its own chunk, fetched only by people who use it.
import en from './en.js'

export const LANGUAGES = [
  { id: 'en', name: 'English' },
  { id: 'ro', name: 'Română' },
]

const LOADERS = {
  ro: () => import('./ro.js'),
}
const DICTIONARIES = { en }
const pending = new Map()
const pluralRules = new Map()

export const isLanguage = id => LANGUAGES.some(language => language.id === id)
export const isLoaded = lang => Object.hasOwn(DICTIONARIES, lang)

// Resolves once the language's dictionary is available. Concurrent calls share
// one request; a failed request can be retried later.
export function loadLanguage(lang) {
  if (!isLanguage(lang)) return Promise.reject(new Error(`unknown language: ${lang}`))
  if (isLoaded(lang)) return Promise.resolve()
  if (!pending.has(lang)) {
    const request = LOADERS[lang]()
      .then(module => { DICTIONARIES[lang] = module.default })
      .finally(() => pending.delete(lang))
    pending.set(lang, request)
  }
  return pending.get(lang)
}

// First supported language in the browser's preference list, else English.
export function detectLanguage(preferred = []) {
  for (const tag of preferred) {
    const base = String(tag).toLowerCase().split('-')[0]
    if (isLanguage(base)) return base
  }
  return 'en'
}

// 'auto' (or anything unknown) follows the browser.
export function resolveLanguage(choice, preferred) {
  return isLanguage(choice) ? choice : detectLanguage(preferred)
}

function pluralCategory(lang, count) {
  if (!pluralRules.has(lang)) pluralRules.set(lang, new Intl.PluralRules(lang))
  return pluralRules.get(lang).select(count)
}

function interpolate(text, params) {
  if (!params) return text
  return text.replace(/\{(\w+)\}/g, (match, name) =>
    (Object.hasOwn(params, name) ? String(params[name]) : match))
}

export function translate(lang, key, params) {
  const dictionary = DICTIONARIES[lang] ?? en
  let message = Object.hasOwn(dictionary, key) ? dictionary[key] : en[key]
  if (message === undefined) return key
  if (typeof message === 'object') {
    const count = Number(params?.count)
    message = message[pluralCategory(lang, count)] ?? message.other
  }
  return interpolate(message, params)
}

// The active language for code outside React components (formatters, API
// error messages). Set by the app before it renders. Stays English until the
// dictionary has loaded, so numbers and words never disagree.
let current = 'en'

export function setLanguage(lang) {
  current = isLoaded(lang) ? lang : 'en'
}

export const getLanguage = () => current

export const t = (key, params) => translate(current, key, params)
