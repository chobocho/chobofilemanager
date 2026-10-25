import React, { useState, useEffect, useRef } from 'react'
import { FolderPlus, FilePlus, X } from 'lucide-react'
import Modal from './DialogModal.jsx'
import styles from '../styles/Dialogs.module.css'

// ─── New Item Dialog ──────────────────────────────────────────────────────────

export function NewItemDialog({ type, onConfirm, onClose }) {
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const inputRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name.trim()) return
    setError('')
    try {
      await onConfirm(name.trim())
    } catch (err) {
      setError(String(err))
      inputRef.current?.select()
    }
  }

  const Icon = type === 'directory' ? FolderPlus : FilePlus
  const label = type === 'directory' ? 'New Directory' : 'New File'

  return (
    <Modal onClose={onClose}>
      <div className={styles.header}>
        <Icon size={15} />
        <span>{label}</span>
        <button className={styles.closeBtn} onClick={onClose}><X size={13} /></button>
      </div>
      <form onSubmit={handleSubmit}>
        <div className={styles.body}>
          <label className={styles.label}>
            {type === 'directory' ? 'Directory name' : 'File name'}
          </label>
          <input
            ref={inputRef}
            className={`${styles.input} ${error ? styles.inputError : ''}`}
            value={name}
            onChange={e => { setName(e.target.value); setError('') }}
            placeholder={type === 'directory' ? 'new_folder' : 'file.txt'}
            spellCheck={false}
          />
          {error && <p className={styles.errorMsg}>{error}</p>}
        </div>
        <div className={styles.footer}>
          <button type="button" className={styles.btnCancel} onClick={onClose}>Cancel</button>
          <button type="submit" className={styles.btnConfirm} disabled={!name.trim()}>
            Create
          </button>
        </div>
      </form>
    </Modal>
  )
}

export default NewItemDialog
