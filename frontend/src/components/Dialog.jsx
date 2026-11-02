import { useEffect, useId, useRef } from 'react'
import { useI18n } from '../i18n/react'

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

// Modal dialog: traps focus, closes on Escape or backdrop click and returns
// focus to whatever opened it.
export default function Dialog({ title, onClose, children, labelledBy }) {
  const { t } = useI18n()
  const ref = useRef(null)
  const titleId = useId()

  useEffect(() => {
    const opener = document.activeElement
    const node = ref.current
    node?.querySelector(FOCUSABLE)?.focus()

    const onKey = e => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
        return
      }
      if (e.key !== 'Tab' || !node) return
      const items = [...node.querySelectorAll(FOCUSABLE)]
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      if (opener instanceof HTMLElement) opener.focus()
    }
  }, [onClose])

  return (
    <>
      <div className="backdrop" onClick={onClose} aria-hidden="true" />
      <div ref={ref} className="dialog" role="dialog" aria-modal="true"
        aria-labelledby={labelledBy ?? titleId}>
        <div className="dialog__head">
          <h2 id={titleId} className="dialog__title">{title}</h2>
          <button type="button" className="btn btn--icon btn--ghost" onClick={onClose}
            aria-label={t('common.close')}>✕</button>
        </div>
        {children}
      </div>
    </>
  )
}
