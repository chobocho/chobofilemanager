import React, { useState, useEffect, useRef } from 'react'
import { AlertTriangle, FolderPlus, FilePlus, Edit3, Search as SearchIcon, X, Terminal, Play, Eye, FileEdit } from 'lucide-react'
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

export function ConfirmDialog({ title, message, items, confirmLabel = 'Confirm', danger, hideCancel, onConfirm, onClose }) {
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
      <div className={styles.footer}>
        {!hideCancel && <button className={styles.btnCancel} onClick={onClose}>Cancel</button>}
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

// ─── Rename Dialog ────────────────────────────────────────────────────────────

export function RenameDialog({ onConfirm, onClose }) {
  const store = useFileStore()
  const panel = store[store.activePanel]
  const visibleFiles = panel.showHidden ? panel.files : panel.files.filter(f => !f.isHidden)
  const currentFile = visibleFiles[panel.cursor]
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

// ─── Shell Command Dialog ─────────────────────────────────────────────────────

export function ShellCommandDialog({ workDir, onClose }) {
  const [command, setCommand]   = useState('')
  const [output, setOutput]     = useState(null)
  const [running, setRunning]   = useState(false)
  const [exitError, setExitError] = useState(false)
  const [history, setHistory]   = useState([])
  const [histIdx, setHistIdx]   = useState(-1)
  const inputRef  = useRef(null)
  const outputRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  useEffect(() => {
    if (output !== null) {
      outputRef.current?.scrollTo(0, outputRef.current.scrollHeight)
    }
  }, [output])

  const handleRun = async (e) => {
    e?.preventDefault()
    if (!command.trim() || running) return
    setRunning(true)
    setOutput(null)
    setExitError(false)
    try {
      const result = await api.RunShellCommand(command.trim(), workDir)
      setOutput(result)
      setExitError(false)
    } catch (err) {
      // Wails wraps non-zero exit codes as errors; output is in the message
      const msg = String(err)
      // Try to extract combined output from error message
      setOutput(msg)
      setExitError(true)
    } finally {
      setHistory(prev => [command.trim(), ...prev.filter(c => c !== command.trim())].slice(0, 50))
      setHistIdx(-1)
      setRunning(false)
      inputRef.current?.select()
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      const next = Math.min(histIdx + 1, history.length - 1)
      setHistIdx(next)
      setCommand(history[next] ?? '')
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      const next = histIdx - 1
      if (next < 0) { setHistIdx(-1); setCommand('') }
      else { setHistIdx(next); setCommand(history[next]) }
    }
  }

  return (
    <Modal onClose={onClose} width={620}>
      <div className={styles.header}>
        <Terminal size={15} />
        <span>Shell Command</span>
        <span className={styles.shellWorkDir}>{workDir}</span>
        <button className={styles.closeBtn} onClick={onClose}><X size={13} /></button>
      </div>
      <form onSubmit={handleRun}>
        <div className={styles.body}>
          <div className={styles.searchForm}>
            <input
              ref={inputRef}
              className={styles.input}
              value={command}
              onChange={e => { setCommand(e.target.value); setHistIdx(-1) }}
              onKeyDown={handleKeyDown}
              placeholder="명령어 입력 (↑↓ 히스토리)"
              spellCheck={false}
              disabled={running}
            />
            <button type="submit" className={styles.btnSearch} disabled={running || !command.trim()}>
              {running ? '...' : '실행'}
            </button>
          </div>
          {output !== null && (
            <pre
              ref={outputRef}
              className={`${styles.shellOutput} ${exitError ? styles.shellOutputError : ''}`}
            >{output || '(출력 없음)'}</pre>
          )}
        </div>
        <div className={styles.footer}>
          <button type="button" className={styles.btnCancel} onClick={onClose}>닫기</button>
        </div>
      </form>
    </Modal>
  )
}

// ─── Search Dialog ────────────────────────────────────────────────────────────

const TEXT_EXTS = new Set(['.txt','.md','.js','.jsx','.ts','.tsx','.go','.py','.rs','.c','.cpp','.h','.html','.css','.json','.xml','.yaml','.yml','.sh','.log','.ini','.cfg','.conf','.env'])

export function SearchDialog({ onClose, onView, onEdit }) {
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
      // Windows(\) / Unix(/) 구분자 모두 처리
      const lastSep = Math.max(file.path.lastIndexOf('/'), file.path.lastIndexOf('\\'))
      const dir = lastSep > 0 ? file.path.substring(0, lastSep) : file.path
      store.navigate(store.activePanel, dir)
    }
    onClose()
  }

  const handleRunFile = (e, file) => {
    e.stopPropagation()
    api.OpenFile(file.path)
  }

  const handleViewFile = (e, file) => {
    e.stopPropagation()
    onView?.(file)
  }

  const handleEditFile = (e, file) => {
    e.stopPropagation()
    onEdit?.(file)
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
            placeholder="Search pattern... (comma = AND, e.g. 우리,나라)"
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
                  {!file.isDir && TEXT_EXTS.has(file.extension) && (
                    <button
                      className={styles.resultActionBtn}
                      onClick={(e) => handleViewFile(e, file)}
                      title="내장 뷰어로 보기"
                    >
                      <Eye size={12} />
                    </button>
                  )}
                  {!file.isDir && TEXT_EXTS.has(file.extension) && (
                    <button
                      className={styles.resultActionBtn}
                      onClick={(e) => handleEditFile(e, file)}
                      title="내장 에디터로 편집"
                    >
                      <FileEdit size={12} />
                    </button>
                  )}
                  {!file.isDir && (
                    <button
                      className={styles.resultActionBtn}
                      onClick={(e) => handleRunFile(e, file)}
                      title="파일 실행"
                    >
                      <Play size={12} />
                    </button>
                  )}
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
