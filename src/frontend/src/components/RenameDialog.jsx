import React, { useState, useEffect, useRef } from 'react'
import { Edit3, X } from 'lucide-react'
import { useFileStore, getCursorFile } from '../stores/fileStore'
import Modal from './DialogModal.jsx'
import styles from '../styles/Dialogs.module.css'

// ─── Rename Dialog ────────────────────────────────────────────────────────────

export function RenameDialog({ onConfirm, onClose }) {
  // 연 순간의 커서 파일로 고정 — 열린 동안 커서가 움직여도(복사 완료 새로 고침 등) 다른 파일을 바꾸지 않음 (Todo #130-3)
  const [currentFile] = useState(() => { const s = useFileStore.getState(); return getCursorFile(s[s.activePanel]) })
  const [name, setName] = useState(currentFile?.name || '')
  const inputRef = useRef(null)

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus()
      // Select filename without extension
      const ext = currentFile?.extension || ''
      const end = ext ? name.length - ext.length : name.length
      inputRef.current.setSelectionRange(0, end)
    }
  }, [])

  if (!currentFile) return null

  const handleSubmit = (e) => {
    e.preventDefault()
    if (name.trim() && name !== currentFile.name) {
      onConfirm(currentFile.path, name.trim())
    } else {
      onClose()
    }
  }

  return (
    <Modal onClose={onClose}>
      <div className={styles.header}>
        <Edit3 size={15} />
        <span>Rename</span>
        <button className={styles.closeBtn} onClick={onClose}><X size={13} /></button>
      </div>
      <form onSubmit={handleSubmit}>
        <div className={styles.body}>
          <label className={styles.label}>New name</label>
          <input
            ref={inputRef}
            className={styles.input}
            value={name}
            onChange={e => setName(e.target.value)}
            spellCheck={false}
          />
          <p className={styles.hint}>Original: {currentFile.name}</p>
        </div>
        <div className={styles.footer}>
          <button type="button" className={styles.btnCancel} onClick={onClose}>Cancel</button>
          <button type="submit" className={styles.btnConfirm} disabled={!name.trim()}>
            Rename
          </button>
        </div>
      </form>
    </Modal>
  )
}

export default RenameDialog
