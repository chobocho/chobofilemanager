import React, { useState, useEffect, useRef } from 'react'
import { CheckSquare, X } from 'lucide-react'
import Modal from './DialogModal.jsx'
import styles from '../styles/Dialogs.module.css'

// ─── 마스크로 선택 / 선택 해제 (Num+ / Num-, Todo #133-2) ────────────────────────────

export default function SelectMaskDialog({ mode, initialMask, onConfirm, onClose }) {
  const [mask, setMask] = useState(initialMask || '*.*')
  const [includeDirs, setIncludeDirs] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => { inputRef.current?.select() }, [])

  const title = mode === 'deselect' ? '선택 해제' : '선택'
  const submit = (e) => {
    e.preventDefault()
    if (!mask.trim()) return
    onConfirm(mask.trim(), { includeDirs })
  }

  return (
    <Modal onClose={onClose}>
      <div className={styles.header}>
        <CheckSquare size={15} />
        <span>{title}</span>
        <button className={styles.closeBtn} onClick={onClose}><X size={13} /></button>
      </div>
      <form onSubmit={submit}>
        <div className={styles.body}>
          <label className={styles.label} htmlFor="select-mask">마스크 (*.txt;*.md · | 뒤는 제외)</label>
          <input id="select-mask" aria-label="마스크" ref={inputRef} className={styles.input}
            value={mask} onChange={e => setMask(e.target.value)} spellCheck={false} />
          <label className={styles.label}>
            <input type="checkbox" aria-label="폴더도" checked={includeDirs} onChange={e => setIncludeDirs(e.target.checked)} />
            {' '}폴더도
          </label>
        </div>
        <div className={styles.footer}>
          <button type="button" className={styles.btnCancel} onClick={onClose}>취소</button>
          <button type="submit" className={styles.btnConfirm} disabled={!mask.trim()}>{title}</button>
        </div>
      </form>
    </Modal>
  )
}
