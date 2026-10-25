import React from 'react'
import { X } from 'lucide-react'
import styles from '../styles/Terminal.module.css'

// 터미널의 대화상자 틀 하나 (Todo #126): 덮개, role=dialog·이름, 제목 줄(✕), Esc로 닫기,
// 키가 뒤의 작업 공간으로 새지 않게. 대화상자 자신의 onKeyDown이 먼저 받고, 그 키를 썼으면(preventDefault) Esc도 건너뜀.
export default function Modal({ label, title = label, className = '', onClose, onKeyDown, headerExtra, dialogRef, children,
  overlayProps, role = 'dialog', closeTitle = '닫기 (Esc)', ...rest }) {
  function keyDown(e) {
    e.stopPropagation()
    onKeyDown?.(e)
    if (!e.defaultPrevented && e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }
  return (
    <div className={styles.modalOverlay} {...overlayProps}>
      <div ref={dialogRef} className={`${styles.dialog} ${className}`} role={role} aria-label={label} onKeyDown={keyDown} {...rest}>
        <div className={styles.dialogHeader}>
          <span>{title}</span>
          {headerExtra}
          <button type="button" className={styles.iconBtn} title={closeTitle} onClick={onClose}><X size={13} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}
