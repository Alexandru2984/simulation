import assert from 'node:assert/strict'
import test from 'node:test'
import en from './en.js'
import ro from './ro.js'
import {
  detectLanguage, getLanguage, isLanguage, isLoaded, loadLanguage, resolveLanguage, setLanguage, translate,
} from './i18n.js'

const dictionaries = { en, ro }

test('every listed language has a dictionary file under test', () => {
  for (const lang of ['en', 'ro']) assert.ok(isLanguage(lang))
  assert.equal(isLanguage('auto'), false)
  assert.equal(isLanguage('constructor'), false)
})

const placeholders = message => {
  const texts = typeof message === 'object' ? Object.values(message) : [message]
  return [...new Set(texts.flatMap(text => [...text.matchAll(/\{(\w+)\}/g)].map(m => m[1])))].sort()
}

test('every language has exactly the English keys', () => {
  const english = Object.keys(dictionaries.en).sort()
  for (const [lang, dictionary] of Object.entries(dictionaries)) {
    const keys = Object.keys(dictionary).sort()
    assert.deepEqual(keys.filter(k => !english.includes(k)), [], `${lang}: keys English does not have`)
    assert.deepEqual(english.filter(k => !keys.includes(k)), [], `${lang}: missing keys`)
  }
})

test('translations keep the same placeholders and are never empty', () => {
  for (const [lang, dictionary] of Object.entries(dictionaries)) {
    for (const [key, message] of Object.entries(dictionary)) {
      assert.deepEqual(placeholders(message), placeholders(dictionaries.en[key]), `${lang} ${key}`)
      const texts = typeof message === 'object' ? Object.values(message) : [message]
      assert.ok(texts.every(text => typeof text === 'string' && text.trim()), `${lang} ${key} is empty`)
    }
  }
})

test('plural messages cover every category the language uses', () => {
  for (const [lang, dictionary] of Object.entries(dictionaries)) {
    const categories = new Intl.PluralRules(lang).resolvedOptions().pluralCategories
    for (const [key, message] of Object.entries(dictionary)) {
      if (typeof message !== 'object') continue
      for (const category of categories) assert.ok(message[category], `${lang} ${key} lacks "${category}"`)
    }
  }
})

test('other languages load on demand; until then everything stays English', async () => {
  assert.equal(isLoaded('en'), true)
  assert.equal(isLoaded('ro'), false)
  assert.equal(translate('ro', 'feed.flyTo', { place: 'X' }), 'Fly to X')
  setLanguage('ro')
  assert.equal(getLanguage(), 'en', 'formatters wait for the dictionary too')

  await Promise.all([loadLanguage('ro'), loadLanguage('ro')])
  assert.equal(isLoaded('ro'), true)
  setLanguage('ro')
  assert.equal(getLanguage(), 'ro')
  setLanguage('en')
  await assert.rejects(loadLanguage('xx'), /unknown language/)
})

test('Romanian plurals follow the 1 / 2–19 / 20+ rule', async () => {
  await loadLanguage('ro')
  assert.equal(translate('ro', 'storms.count', { count: 1 }), '1 furtună')
  assert.equal(translate('ro', 'storms.count', { count: 3 }), '3 furtuni')
  assert.equal(translate('ro', 'storms.count', { count: 20 }), '20 de furtuni')
  assert.equal(translate('ro', 'storms.count', { count: 101 }), '101 furtuni')
  assert.equal(translate('en', 'storms.count', { count: 1 }), '1 storm')
  assert.equal(translate('en', 'storms.count', { count: 2 }), '2 storms')
})

test('interpolation, fallbacks and unknown keys', async () => {
  await loadLanguage('ro')
  assert.equal(translate('en', 'feed.flyTo', { place: '44°N' }), 'Fly to 44°N')
  assert.equal(translate('ro', 'feed.flyTo', { place: '44°N' }), 'Zboară la 44°N')
  assert.equal(translate('xx', 'feed.flyTo', { place: 'X' }), 'Fly to X', 'unknown language falls back to English')
  assert.equal(translate('en', 'no.such.key'), 'no.such.key')
  assert.equal(translate('en', 'feed.flyTo'), 'Fly to {place}', 'missing parameters stay visible')
})

test('the browser language picks the interface, "auto" follows it', () => {
  assert.equal(detectLanguage(['ro-RO', 'en-US']), 'ro')
  assert.equal(detectLanguage(['de-DE', 'ro']), 'ro')
  assert.equal(detectLanguage(['de-DE', 'fr']), 'en')
  assert.equal(detectLanguage([]), 'en')
  assert.equal(resolveLanguage('auto', ['ro-MD']), 'ro')
  assert.equal(resolveLanguage('en', ['ro-RO']), 'en')
  assert.equal(resolveLanguage('ro', ['en-US']), 'ro')
  assert.equal(resolveLanguage('klingon', ['en-GB']), 'en')
})
