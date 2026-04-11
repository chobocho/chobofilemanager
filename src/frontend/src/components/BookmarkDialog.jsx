import React, { useState, useEffect, useRef } from 'react'
import { Bookmark, Plus, Trash2, X, FolderOpen } from 'lucide-react'
import { useFileStore } from '../stores/fileStore'
import api from '../wailsjs/runtime'
import styles from '../styles/BookmarkDialog.module.css'

function Modal({ children, onClose }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}

export default function BookmarkDialog({ onClose }) {
  const store = useFileStore()
  const [bookmarks, setBookmarks] = useState([])
  const [adding, setAdding]       = useState(false)
  const [newName, setNewName]     = useState('')
  const [error, setError]         = useState('')
  const nameInputRef = useRef(null)

  const activePath = store[store.activePanel]?.path || ''

  useEffect(() => { load() }, [])
  useEffect(() => {
    if (adding) nameInputRef.current?.focus()
  }, [adding])

  const load = async () => {
    const bms = await api.GetFileBookmarks()
    setBookmarks(bms || [])
  }

  const handleNavigate = (path) => {
    store.navigate(store.activePanel, path)
    onClose()
  }

  const handleStartAdd = () => {
    const folderName = activePath.split(/[/\\]/).filter(Boolean).pop() || activePath
    setNewName(folderName)
    setError('')
    setAdding(true)
  }

  const handleAdd = async (e) => {
    e.preventDefault()
    if (!newName.trim()) return
    try {
      await api.AddFileBookmark(newName.trim(), activePath)
      await load()
      setAdding(false)
      setNewName('')
      setError('')
    } catch (err) {
      setError(String(err))
    }
  }

  const handleDelete = async (id, e) => {
    e.stopPropagation()
    await api.DeleteFileBookmark(id)
    await load()
  }

  return (
    <Modal onClose={onClose}>
      <div className={styles.header}>
        <Bookmark size={14} className={styles.headerIcon} />
        <span>바로가기</span>
        <button className={styles.closeBtn} onClick={onClose}><X size={13} /></button>
      </div>

      <div className={styles.body}>
        {/* 현재 폴더 추가 */}
        {!adding ? (
          <button className={styles.addBtn} onClick={handleStartAdd}>
            <Plus size={13} />
            <span>현재 폴더 추가</span>
            <span className={styles.addPath}>{activePath}</span>
          </button>
        ) : (
          <form className={styles.addForm} onSubmit={handleAdd}>
            <input
              ref={nameInputRef}
              className={`${styles.nameInput} ${error ? styles.inputError : ''}`}
              value={newName}
              onChange={e => { setNewName(e.target.value); setError('') }}
              placeholder="바로가기 이름"
              spellCheck={false}
            />
            <button type="submit" className={styles.btnSave} disabled={!newName.trim()}>추가</button>
            <button type="button" className={styles.btnCancel} onClick={() => { setAdding(false); setError('') }}>
              <X size={12} />
            </button>
            {error && <span className={styles.errorMsg}>{error}</span>}
          </form>
        )}

        {/* 북마크 목록 */}
        <div className={styles.list}>
          {bookmarks.length === 0 ? (
            <div className={styles.empty}>바로가기가 없습니다. 현재 폴더를 추가해보세요.</div>
          ) : (
            bookmarks.map(bm => (
              <div
                key={bm.id}
                className={styles.row}
                onClick={() => handleNavigate(bm.path)}
                title={bm.path}
              >
                <FolderOpen size={14} className={styles.folderIcon} />
                <div className={styles.info}>
                  <span className={styles.name}>{bm.name}</span>
                  <span className={styles.path}>{bm.path}</span>
                </div>
                <button
                  className={styles.deleteBtn}
                  onClick={(e) => handleDelete(bm.id, e)}
                  title="삭제"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </Modal>
  )
}
