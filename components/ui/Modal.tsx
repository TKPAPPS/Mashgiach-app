'use client'
import { ReactNode, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

interface Props {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
  size?: 'default' | 'lg' | 'xl'
}

export default function Modal({ open, onClose, title, children, footer, size = 'default' }: Props) {
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open || typeof document === 'undefined') return null

  const sizeClass = size === 'lg' ? 'modal--lg' : size === 'xl' ? 'modal--xl' : ''

  // Rendered into <body>: every .card is its own stacking context (isolation:
  // isolate), so a modal left inside a card was painted under later cards.
  return createPortal(
    <div className="modalOverlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={`modal ${sizeClass}`} role="dialog" aria-modal="true">
        <div className="modal__header">
          <span className="modal__title">{title}</span>
          <button className="button button--icon button--ghost" onClick={onClose} aria-label="סגור">
            <X size={16} />
          </button>
        </div>
        <div className="modal__body">{children}</div>
        {footer && <div className="modal__footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}
