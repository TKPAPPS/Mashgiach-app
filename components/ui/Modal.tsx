'use client'
import { ReactNode, useEffect } from 'react'
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

  if (!open) return null

  const sizeClass = size === 'lg' ? 'modal--lg' : size === 'xl' ? 'modal--xl' : ''

  return (
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
    </div>
  )
}
