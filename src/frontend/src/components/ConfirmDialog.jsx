import React, { useState, useEffect, useRef } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import Modal from './DialogModal.jsx'
import styles from '../styles/Dialogs.module.css'

// ─── Confirm Dialog ───────────────────────────────────────────────────────────

// 좌우 화살표로 Cancel(0) ↔ Confirm(1) 포커스 이동 (Todo #60, #61)
// hideCancel일 때는 항상 Confirm.
export function nextConfirmFocusIndex(currentIndex, key, hideCancel) {
  if (hideCancel) return 1
  if (key === 'ArrowRight') return Math.min(1, currentIndex + 1)
  if (key === 'ArrowLeft') return Math.max(0, currentIndex - 1)
  return currentIndex
}

export function ConfirmDialog({ title, message, items, confirmLabel = 'Confirm', danger, hideCancel, onConfirm, onClose }) {
  const cancelRef  = useRef(null)
  const confirmRef = useRef(null)
  const [focusIndex, setFocusIndex] = useState(1)  // 기본 Confirm
  const [busy, setBusy] = useState(false)

  // Todo #96: onConfirm(비동기)이 끝날 때까지 기다리고 닫기는 호출 측이 결정 —
  // 실패 시 대화상자를 유지해 오류 메시지를 보여주고 다시 시도/취소할 수 있게 함
  const handleConfirm = async () => {
    if (busy) return
    setBusy(true)
    try {
      await onConfirm()
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    const target = focusIndex === 0 ? cancelRef.current : confirmRef.current
    target?.focus()
  }, [focusIndex])

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault()
      e.stopPropagation()
      setFocusIndex(prev => nextConfirmFocusIndex(prev, e.key, hideCancel))
    }
  }

  return (
    <Modal onClose={onClose}>
      <div className={styles.header}>
        {danger && <AlertTriangle size={15} className={styles.dangerIcon} />}
        <span>{title}</span>
        <button className={styles.closeBtn} onClick={onClose}><X size={13} /></button>
      </div>
      <div className={styles.body}>
        <p className={styles.message}>{message}</p>
        {items && items.length > 0 && (
          <div className={styles.deleteList}>
            {items.map((name, i) => (
              <div key={i} className={styles.deleteItem} title={name}>
                <span className={styles.deleteItemName}>{name}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className={styles.footer} onKeyDown={handleKeyDown}>
        {!hideCancel && (
          <button ref={cancelRef} className={styles.btnCancel} onClick={onClose}>
            Cancel
          </button>
        )}
        <button
          ref={confirmRef}
          className={`${styles.btnConfirm} ${danger ? styles.btnDanger : ''}`}
          onClick={handleConfirm}
          disabled={busy}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  )
}

export default ConfirmDialog

// 다른 대화상자는 파일별로 나눔 (Todo #132-2) — 기존 import 경로 호환
export { NewItemDialog } from './NewItemDialog.jsx'
export { RenameDialog } from './RenameDialog.jsx'
export { ShellCommandDialog } from './ShellCommandDialog.jsx'
export { SearchDialog } from './SearchDialog.jsx'
