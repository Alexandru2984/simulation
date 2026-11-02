import { t } from '../i18n/i18n.js'

const FRONT_DETECTION_THRESHOLD = 2.5
const STRONG_FRONT_REFERENCE = 6.5

export function normalizeFrontIntensity(value) {
  if (!Number.isFinite(value)) return 0
  const normalized = (value - FRONT_DETECTION_THRESHOLD) /
    (STRONG_FRONT_REFERENCE - FRONT_DETECTION_THRESHOLD)
  return Math.max(0, Math.min(1, normalized))
}

// This is deliberately pressure-anomaly language, not a hurricane category.
// The simulation does not calculate the sustained wind measurements required
// by operational tropical-cyclone scales.
export function pressureAnomalyLabel(anomaly) {
  if (!Number.isFinite(anomaly)) return t('storm.low')
  const depth = Math.max(0, -anomaly)
  if (depth >= 20) return t('storm.exceptional')
  if (depth >= 15) return t('storm.veryDeep')
  if (depth >= 10) return t('storm.deep')
  return t('storm.low')
}
