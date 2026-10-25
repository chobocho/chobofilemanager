import React, { useEffect } from 'react'
import styles from '../styles/Dialogs.module.css'

// ─── Dialog Modal (파일 관리자 대화상자 공용 틀, Todo #132-2) ───────────────────────────────────────────────────────────────

export default function Modal({ children, onClose, width = 400 }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={styles.modal}
        style={{ width }}
        onClick={e => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}
