import React, { useState, useEffect } from 'react'
import { useFileStore } from './stores/fileStore'
import { useFTPStore } from './stores/ftpStore'
import { useThemeStore } from './stores/themeStore'
import Toolbar from './components/Toolbar'
import FilePanel from './components/FilePanel'
import StatusBar from './components/StatusBar'
import FKeyBar from './components/FKeyBar'
import FTPManager from './components/FTPManager'
import TextEditor from './components/TextEditor'
import { ConfirmDialog, NewItemDialog, RenameDialog, SearchDialog } from './components/ConfirmDialog'
import styles from './styles/App.module.css'

export default function App() {
  const init        = useFileStore(s => s.init)
  const loadBkmarks = useFTPStore(s => s.loadBookmarks)
  const theme       = useThemeStore(s => s.theme)
  const [view, setView]             = useState('files')
  const [modal, setModal]           = useState(null)
  const [editorFile, setEditorFile] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)

  useEffect(() => { init(); loadBkmarks() }, [])

  const handleDelete = async () => {
    const result = await useFileStore.getState().delete()
    if (result.count > 0) setDeleteTarget(result)
  }

  const handleConfirmDelete = async () => {
    if (deleteTarget) {
      await useFileStore.getState().confirmDelete(deleteTarget.paths)
      setDeleteTarget(null)
    }
  }

  const handleCompress = () => {
    const store = useFileStore.getState()
    store.compress(store.activePanel)
  }

  const handleExtract = () => {
    const store = useFileStore.getState()
    const panel = store[store.activePanel]
    const cursor = panel.files[panel.cursor]
    if (cursor && !cursor.isDir) {
      store.extract(store.activePanel, cursor.path)
    }
  }

  const handleNewFile = async (name) => {
    const store = useFileStore.getState()
    const panel = store[store.activePanel]
    const path  = panel.path.replace(/[\\/]$/, '') + '/' + name
    try {
      const api = (await import('./wailsjs/runtime')).default
      await api.CreateFile(path)
      store.refresh(store.activePanel)
    } catch(e) { console.error(e) }
    setModal(null)
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
        onCopy={() => useFileStore.getState().copy()}
        onMove={() => useFileStore.getState().move()}
        onNewDir={() => setModal('newdir')}
        onDelete={handleDelete}
      />
      <div className={styles.content}>
        {view === 'files' ? (
          <div className={styles.panels}>
            <FilePanel side="left"  onEdit={setEditorFile} />
            <div className={styles.divider} />
            <FilePanel side="right" onEdit={setEditorFile} />
          </div>
        ) : (
          <FTPManager />
        )}
      </div>
      <StatusBar />
      <FKeyBar
        onHelp={() => setModal('help')}
        onRename={() => setModal('rename')}
        onCopy={() => useFileStore.getState().copy()}
        onMove={() => useFileStore.getState().move()}
        onNewDir={() => setModal('newdir')}
        onDelete={handleDelete}
      />

      {modal === 'newdir' && (
        <NewItemDialog type="directory"
          onConfirm={(name) => { const s=useFileStore.getState(); s.createDirectory(s.activePanel,name); setModal(null) }}
          onClose={() => setModal(null)} />
      )}
      {modal === 'newfile' && (
        <NewItemDialog type="file" onConfirm={handleNewFile} onClose={() => setModal(null)} />
      )}
      {modal === 'rename' && (
        <RenameDialog
          onConfirm={(oldPath, newName) => { const s=useFileStore.getState(); s.rename(s.activePanel,oldPath,newName); setModal(null) }}
          onClose={() => setModal(null)} />
      )}
      {modal === 'search' && <SearchDialog onClose={() => setModal(null)} />}
      {deleteTarget && (
        <ConfirmDialog title="Delete Items"
          message={`Permanently delete ${deleteTarget.count} item(s)?`}
          confirmLabel="Delete" danger
          onConfirm={handleConfirmDelete} onClose={() => setDeleteTarget(null)} />
      )}
      {editorFile && <TextEditor path={editorFile} onClose={() => setEditorFile(null)} />}
    </div>
  )
}
