import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useFileStore } from './stores/fileStore'
import { useFTPStore } from './stores/ftpStore'
import { useThemeStore } from './stores/themeStore'
import Toolbar from './components/Toolbar'
import FilePanel from './components/FilePanel'
import StatusBar from './components/StatusBar'
import FKeyBar from './components/FKeyBar'
import FTPManager from './components/FTPManager'
import TextEditor from './components/TextEditor'
import FileViewer from './components/FileViewer'
import { ConfirmDialog, NewItemDialog, RenameDialog, SearchDialog } from './components/ConfirmDialog'
import styles from './styles/App.module.css'

export default function App() {
  const init        = useFileStore(s => s.init)
  const loadBkmarks = useFTPStore(s => s.loadBookmarks)
  const theme       = useThemeStore(s => s.theme)
  const [view, setView]             = useState('files')
  const [modal, setModal]           = useState(null)
  const [editorFile, setEditorFile] = useState(null)
  const [viewerFile, setViewerFile] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteError, setDeleteError]   = useState(null)
  const leftPanelRef  = useRef(null)
  const rightPanelRef = useRef(null)

  // 모달/다이얼로그 닫힌 후 활성 패널로 포커스 복원
  const focusActivePanel = useCallback(() => {
    const active = useFileStore.getState().activePanel
    const ref = active === 'left' ? leftPanelRef : rightPanelRef
    // DOM 업데이트 후 포커스 (requestAnimationFrame으로 한 프레임 뒤)
    requestAnimationFrame(() => ref.current?.focus())
  }, [])

  useEffect(() => { init(); loadBkmarks() }, [])

  const handleDelete = async () => {
    const result = await useFileStore.getState().delete()
    if (result.count > 0) setDeleteTarget(result)
  }

  const handleConfirmDelete = async () => {
    if (deleteTarget) {
      try {
        await useFileStore.getState().confirmDelete(deleteTarget.paths)
        setDeleteTarget(null)
        setDeleteError(null)
        focusActivePanel()
      } catch (err) {
        setDeleteError(String(err))
      }
    }
  }

  const handleCompress = async () => {
    const store = useFileStore.getState()
    await store.compress(store.activePanel)
    focusActivePanel()
  }

  const handleExtract = async () => {
    const store = useFileStore.getState()
    const panel = store[store.activePanel]
    if (panel.cursorOnParent) return
    const visible = panel.showHidden ? panel.files : panel.files.filter(f => !f.isHidden)
    const cursor = visible[panel.cursor]
    if (cursor && !cursor.isDir) {
      await store.extract(store.activePanel, cursor.path)
    }
    focusActivePanel()
  }

  const handleNewFile = async (name) => {
    const store = useFileStore.getState()
    const panel = store[store.activePanel]
    const base  = panel.path
    const sep   = base.includes('\\') ? '\\' : '/'
    const path  = base.replace(/[/\\]+$/, '') + sep + name
    try {
      const api = (await import('./wailsjs/runtime')).default
      await api.CreateFile(path)
      store.refresh(store.activePanel)
    } catch(e) { console.error(e) }
    setModal(null)
    focusActivePanel()
  }

  return (
    <div className={styles.app} data-theme={theme}>
      <Toolbar
        view={view} onViewChange={setView}
        onNewFile={() => setModal('newfile')}
        onSearch={() => setModal('search')}
        onCompress={handleCompress}
        onExtract={handleExtract}
        onRename={() => setModal('rename')}
        onView={() => {
          const s = useFileStore.getState()
          const panel = s[s.activePanel]
          if (panel.cursorOnParent) return
          const visible = panel.showHidden ? panel.files : panel.files.filter(f => !f.isHidden)
          const file = visible[panel.cursor]
          if (file && !file.isDir) setViewerFile(file.path)
        }}
        onCopy={() => useFileStore.getState().copy()}
        onMove={() => useFileStore.getState().move()}
        onNewDir={() => setModal('newdir')}
        onDelete={handleDelete}
      />
      <div className={styles.content}>
        {view === 'files' ? (
          <div className={styles.panels}>
            <FilePanel side="left"  ref={leftPanelRef}  onEdit={setEditorFile} />
            <div className={styles.divider} />
            <FilePanel side="right" ref={rightPanelRef} onEdit={setEditorFile} />
          </div>
        ) : (
          <FTPManager />
        )}
      </div>
      <StatusBar />
      <FKeyBar
        onHelp={() => setModal('help')}
        onRename={() => setModal('rename')}
        onView={() => {
          const s = useFileStore.getState()
          const panel = s[s.activePanel]
          if (panel.cursorOnParent) return
          const visible = panel.showHidden ? panel.files : panel.files.filter(f => !f.isHidden)
          const file = visible[panel.cursor]
          if (file && !file.isDir) setViewerFile(file.path)
        }}
        onCopy={() => useFileStore.getState().copy()}
        onMove={() => useFileStore.getState().move()}
        onNewDir={() => setModal('newdir')}
        onDelete={handleDelete}
      />

      {modal === 'newdir' && (
        <NewItemDialog type="directory"
          onConfirm={(name) => { const s=useFileStore.getState(); s.createDirectory(s.activePanel,name); setModal(null); focusActivePanel() }}
          onClose={() => { setModal(null); focusActivePanel() }} />
      )}
      {modal === 'newfile' && (
        <NewItemDialog type="file" onConfirm={handleNewFile} onClose={() => { setModal(null); focusActivePanel() }} />
      )}
      {modal === 'rename' && (
        <RenameDialog
          onConfirm={(oldPath, newName) => { const s=useFileStore.getState(); s.rename(s.activePanel,oldPath,newName); setModal(null); focusActivePanel() }}
          onClose={() => { setModal(null); focusActivePanel() }} />
      )}
      {modal === 'search' && <SearchDialog onClose={() => { setModal(null); focusActivePanel() }} />}
      {deleteTarget && (
        <ConfirmDialog title="Delete Items"
          message={deleteError ? `삭제 실패: ${deleteError}` : `Permanently delete ${deleteTarget.count} item(s)?`}
          items={deleteTarget.paths.map(p => p.split(/[/\\]/).pop())}
          confirmLabel="Delete" danger
          onConfirm={handleConfirmDelete} onClose={() => { setDeleteTarget(null); setDeleteError(null); focusActivePanel() }} />
      )}
      {viewerFile && <FileViewer path={viewerFile} onClose={() => { setViewerFile(null); focusActivePanel() }} />}
      {editorFile && <TextEditor path={editorFile} onClose={() => { setEditorFile(null); focusActivePanel() }} />}
    </div>
  )
}
