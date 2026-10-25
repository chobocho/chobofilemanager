import React, { useState, useEffect, useRef } from 'react'
import { Search as SearchIcon, X, Play, Eye, FileEdit } from 'lucide-react'
import { useFileStore, parentDir } from '../stores/fileStore'
import api from '../wailsjs/runtime'
import { isTextFile } from '../utils/fileTypes.js'
import Modal from './DialogModal.jsx'
import styles from '../styles/Dialogs.module.css'

// ─── Search Dialog ────────────────────────────────────────────────────────────


export function SearchDialog({ onClose, onView, onEdit }) {
  const store = useFileStore()
  const panel = store[store.activePanel]
  // Todo #65 (Todo.md): 검색 상태(query/recursive/results)는 store에 보관해
  // 모달을 닫고 다시 Ctrl+F로 열어도 복원됨. 로컬 state로 입력을 처리하고
  // 변경 시 store에 즉시 반영.
  const savedSearch = store.searchState
  const setSearchState = store.setSearchState
  const [query, setQueryLocal]         = useState(savedSearch.query)
  const [recursive, setRecursiveLocal] = useState(savedSearch.recursive)
  const [results, setResults]          = useState(savedSearch.results)
  const [searching, setSearching]      = useState(false)
  const inputRef = useRef(null)

  const setQuery = (v) => {
    setQueryLocal(v)
    setSearchState({ query: v })
  }
  const setRecursive = (v) => {
    setRecursiveLocal(v)
    setSearchState({ recursive: v })
  }

  useEffect(() => {
    inputRef.current?.focus()
    // 보존된 query가 있으면 전체 선택 — 이어서 검색하거나 새로 입력 모두 편함
    if (savedSearch.query) inputRef.current?.select()
  }, [])

  const handleSearch = async (e) => {
    e?.preventDefault()
    if (!query.trim()) return
    setSearching(true)
    setResults([])
    try {
      const found = await api.SearchFiles(panel.path, query.trim(), recursive)
      setResults(found || [])
      setSearchState({ query: query.trim(), recursive, results: found || [] })
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
      // Todo.md #66: 파일 선택 시 부모 폴더로 이동한 뒤 해당 파일에 커서를 둔다.
      // Windows(\) / Unix(/) 구분자 모두 처리. 드라이브·최상위 바로 아래는 "C:\"·"/" (parentDir, Todo #130-3)
      const lastSep = Math.max(file.path.lastIndexOf('/'), file.path.lastIndexOf('\\'))
      const fileName = lastSep >= 0 ? file.path.substring(lastSep + 1) : file.path
      store.navigateAndFocus(store.activePanel, parentDir(file.path), fileName)
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
                  {!file.isDir && isTextFile(file.extension) && (
                    <button
                      className={styles.resultActionBtn}
                      onClick={(e) => handleViewFile(e, file)}
                      title="내장 뷰어로 보기"
                    >
                      <Eye size={12} />
                    </button>
                  )}
                  {!file.isDir && isTextFile(file.extension) && (
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

export default SearchDialog
