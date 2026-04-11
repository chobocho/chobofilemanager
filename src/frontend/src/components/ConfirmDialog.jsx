import React, { useState, useEffect, useRef } from 'react'
import { AlertTriangle, FolderPlus, FilePlus, Edit3, Search as SearchIcon, X } from 'lucide-react'
import { useFileStore } from '../stores/fileStore'
import api from '../wailsjs/runtime'
import styles from '../styles/Dialogs.module.css'

// ─── Base Modal ───────────────────────────────────────────────────────────────

function Modal({ children, onClose, width = 400 }) {
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

// ─── Confirm Dialog ───────────────────────────────────────────────────────────

export function ConfirmDialog({ title, message, confirmLabel = 'Confirm', danger, onConfirm, onClose }) {
  return (
    <Modal onClose={onClose}>
      <div className={styles.header}>
        {danger && <AlertTriangle size={15} className={styles.dangerIcon} />}
        <span>{title}</span>
        <button className={styles.closeBtn} onClick={onClose}><X size={13} /></button>
      </div>
      <div className={styles.body}>
        <p className={styles.message}>{message}</p>
      </div>
      <div className={styles.footer}>
        <button className={styles.btnCancel} onClick={onClose}>Cancel</button>
        <button
          className={`${styles.btnConfirm} ${danger ? styles.btnDanger : ''}`}
          onClick={() => { onConfirm(); onClose() }}
          autoFocus
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  )
}

export default ConfirmDialog

// ─── New Item Dialog ──────────────────────────────────────────────────────────

export function NewItemDialog({ type, onConfirm, onClose }) {
  const [name, setName] = useState('')
  const inputRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const handleSubmit = (e) => {
    e.preventDefault()
    if (name.trim()) {
      onConfirm(name.trim())
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
            className={styles.input}
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder={type === 'directory' ? 'new_folder' : 'file.txt'}
            spellCheck={false}
          />
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

// ─── Rename Dialog ────────────────────────────────────────────────────────────

export function RenameDialog({ onConfirm, onClose }) {
  const store = useFileStore()
  const panel = store[store.activePanel]
  const currentFile = panel.files[panel.cursor]
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

// ─── Search Dialog ────────────────────────────────────────────────────────────

export function SearchDialog({ onClose }) {
  const store = useFileStore()
  const panel = store[store.activePanel]
  const [query, setQuery]           = useState('')
  const [recursive, setRecursive]   = useState(true)
  const [results, setResults]       = useState([])
  const [searching, setSearching]   = useState(false)
  const inputRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const handleSearch = async (e) => {
    e?.preventDefault()
    if (!query.trim()) return
    setSearching(true)
    setResults([])
    try {
      const found = await api.SearchFiles(panel.path, query.trim(), recursive)
      setResults(found || [])
    } catch(e) {
      console.error(e)
    } finally {
      setSearching(false)
    }
  }

  const handleOpenResult = (file) => {
    if (file.isDir) {
      store.navigate(store.activePanel, file.path)
    } else {
      store.navigate(store.activePanel, file.path.substring(0, file.path.lastIndexOf('/')) || '/')
    }
    onClose()
  }

  const formatSize = (bytes, isDir) => {
    if (isDir) return '<DIR>'
    if (!bytes) return '0 B'
    const units = ['B','KB','MB','GB']
    const i = Math.floor(Math.log(Math.max(bytes,1))/Math.log(1024))
    return `${(bytes/Math.pow(1024,i)).toFixed(1)} ${units[i]}`
  }

  return (
    <Modal onClose={onClose} width={600}>
      <div className={styles.header}>
        <SearchIcon size={15} />
        <span>Search Files</span>
        <button className={styles.closeBtn} onClick={onClose}><X size={13} /></button>
      </div>
      <div className={styles.body}>
        <form onSubmit={handleSearch} className={styles.searchForm}>
          <input
            ref={inputRef}
            className={styles.input}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search pattern..."
            spellCheck={false}
          />
          <button type="submit" className={styles.btnSearch} disabled={searching || !query.trim()}>
            {searching ? '...' : <SearchIcon size={13} />}
          </button>
        </form>
        <div className={styles.searchOptions}>
          <label className={styles.checkLabel}>
            <input
              type="checkbox"
              checked={recursive}
              onChange={e => setRecursive(e.target.checked)}
            />
            Search subdirectories
          </label>
          <span className={styles.hint}>In: {panel.path}</span>
        </div>

        {results.length > 0 && (
          <div className={styles.results}>
            <div className={styles.resultsHeader}>
              {results.length} result{results.length !== 1 ? 's' : ''}
            </div>
            <div className={styles.resultsList}>
              {results.map(file => (
                <div
                  key={file.path}
                  className={styles.resultRow}
                  onClick={() => handleOpenResult(file)}
                  title={file.path}
                >
                  <span className={styles.resultIcon}>{file.isDir ? '📁' : '📄'}</span>
                  <div className={styles.resultInfo}>
                    <span className={styles.resultName}>{file.name}</span>
                    <span className={styles.resultPath}>{file.path}</span>
                  </div>
                  <span className={styles.resultSize}>{formatSize(file.size, file.isDir)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {!searching && query && results.length === 0 && (
          <div className={styles.noResults}>No files found matching "{query}"</div>
        )}
      </div>
    </Modal>
  )
}
