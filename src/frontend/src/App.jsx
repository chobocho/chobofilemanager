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
import FileViewer, { isImageFile } from './components/FileViewer'
import { ConfirmDialog, NewItemDialog, RenameDialog, SearchDialog, ShellCommandDialog } from './components/ConfirmDialog'
import BookmarkDialog from './components/BookmarkDialog'
import HelpDialog from './components/HelpDialog'
import CopyConflictDialog from './components/CopyConflictDialog'
import MoveConflictDialog from './components/MoveConflictDialog'
import styles from './styles/App.module.css'

export default function App() {
  const init        = useFileStore(s => s.init)
  const loadBkmarks = useFTPStore(s => s.loadBookmarks)
  const theme       = useThemeStore(s => s.theme)
  const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB

  const [view, setView]             = useState('files')
  const [modal, setModal]           = useState(null)
  const [editorFile, setEditorFile] = useState(null)
  const [viewerFile, setViewerFile] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteError, setDeleteError]   = useState(null)
  const [copyConflict, setCopyConflict] = useState(null) // { conflicts, sources, dest }
  const [moveConflict, setMoveConflict] = useState(null) // { conflicts, sources, dest }
  const [fileSizeError, setFileSizeError] = useState(null) // 크기 초과 파일명
  const leftPanelRef  = useRef(null)
  const rightPanelRef = useRef(null)

  // 모달/다이얼로그 닫힌 후 활성 패널로 포커스 복원
  const focusActivePanel = useCallback(() => {
    const active = useFileStore.getState().activePanel
    const ref = active === 'left' ? leftPanelRef : rightPanelRef
    // DOM 업데이트 후 포커스 (requestAnimationFrame으로 한 프레임 뒤)
    requestAnimationFrame(() => ref.current?.focus())
  }, [])

  const tryOpenViewer = useCallback((file) => {
    if (file.size > MAX_FILE_SIZE) { setFileSizeError(file.name); return }
    setViewerFile(file.path)
  }, [])

  const tryOpenEditor = useCallback((file) => {
    if (file.size > MAX_FILE_SIZE) { setFileSizeError(file.name); return }
    setEditorFile(file.path)
  }, [])

  useEffect(() => {
    Promise.all([init(), loadBkmarks()]).then(() => {
      requestAnimationFrame(() => leftPanelRef.current?.focus())
    })
  }, [])

  // Ctrl+Enter: Starlark 스크래치 — 임시 .star 파일 생성 후 F4 에디터로 열기.
  // 에디터/뷰어/모달이 떠 있을 때는 그쪽 핸들러에 양보.
  const handleStarlarkScratch = useCallback(async () => {
    try {
      const api = (await import('./wailsjs/runtime')).default
      const path = await api.CreateStarlarkScratchFile()
      if (path) setEditorFile(path)
    } catch (e) {
      console.error('Starlark scratch 생성 실패:', e)
    }
  }, [])

  useEffect(() => {
    const handler = (e) => {
      if (e.ctrlKey && e.key === 'o') {
        e.preventDefault()
        setModal('shell')
      }
      if (e.key === 'F9') {
        e.preventDefault()
        const s = useFileStore.getState()
        const workDir = s[s.activePanel].path
        import('./wailsjs/runtime').then(m => m.default.OpenCmdWindow(workDir))
      }
      // 다른 다이얼로그/뷰어/에디터가 떠 있으면 무시 (그쪽 단축키와 충돌 방지)
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter'
          && !editorFile && !viewerFile && !modal) {
        e.preventDefault()
        handleStarlarkScratch()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [editorFile, viewerFile, modal, handleStarlarkScratch])

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
    const api = (await import('./wailsjs/runtime')).default
    await api.CreateFile(path)  // 에러 시 throw → NewItemDialog에서 캐치
    store.refresh(store.activePanel)
    setModal(null)
    focusActivePanel()
  }

  const handleCopy = async () => {
    const result = await useFileStore.getState().copy()
    if (result?.conflicts?.length > 0) setCopyConflict(result)
    else focusActivePanel()
  }

  const handleCopyConflictConfirm = async (mode) => {
    if (copyConflict) {
      await useFileStore.getState().copyWithMode(copyConflict.sources, copyConflict.dest, mode)
      setCopyConflict(null)
      focusActivePanel()
    }
  }

  const handleMove = async () => {
    const result = await useFileStore.getState().move()
    if (result?.conflicts?.length > 0) setMoveConflict(result)
    else focusActivePanel()
  }

  const handleMoveConflictConfirm = async (mode) => {
    if (moveConflict) {
      await useFileStore.getState().moveWithMode(moveConflict.sources, moveConflict.dest, mode)
      setMoveConflict(null)
      focusActivePanel()
    }
  }

  const handleSwitchPanel = useCallback(() => {
    const next = useFileStore.getState().activePanel === 'left' ? 'right' : 'left'
    useFileStore.getState().setActivePanel(next)
    const ref = next === 'left' ? leftPanelRef : rightPanelRef
    requestAnimationFrame(() => ref.current?.focus())
  }, [])

  return (
    <div className={styles.app} data-theme={theme}>
      <Toolbar
        view={view} onViewChange={setView}
        onHelp={() => setModal('help')}
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
          if (file && !file.isDir) tryOpenViewer(file)
        }}
        onEdit={() => {
          const s = useFileStore.getState()
          const panel = s[s.activePanel]
          if (panel.cursorOnParent) return
          const visible = panel.showHidden ? panel.files : panel.files.filter(f => !f.isHidden)
          const file = visible[panel.cursor]
          if (file && !file.isDir) tryOpenEditor(file)
        }}
        onCopy={handleCopy}
        onMove={handleMove}
        onNewDir={() => setModal('newdir')}
        onDelete={handleDelete}
        onSwitchPanel={handleSwitchPanel}
        onBookmarks={() => setModal('bookmarks')}
      />
      <div className={styles.content}>
        {view === 'files' ? (
          <div className={styles.panels}>
            <FilePanel side="left"  ref={leftPanelRef}  onEdit={tryOpenEditor} onView={tryOpenViewer}
              onSwitchToPanel={(target) => {
                useFileStore.getState().setActivePanel(target)
                const ref = target === 'left' ? leftPanelRef : rightPanelRef
                requestAnimationFrame(() => ref.current?.focus())
              }} />
            <div className={styles.divider} />
            <FilePanel side="right" ref={rightPanelRef} onEdit={tryOpenEditor} onView={tryOpenViewer}
              onSwitchToPanel={(target) => {
                useFileStore.getState().setActivePanel(target)
                const ref = target === 'left' ? leftPanelRef : rightPanelRef
                requestAnimationFrame(() => ref.current?.focus())
              }} />
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
          if (file && !file.isDir) tryOpenViewer(file)
        }}
        onEdit={() => {
          const s = useFileStore.getState()
          const panel = s[s.activePanel]
          if (panel.cursorOnParent) return
          const visible = panel.showHidden ? panel.files : panel.files.filter(f => !f.isHidden)
          const file = visible[panel.cursor]
          if (file && !file.isDir) tryOpenEditor(file)
        }}
        onCopy={handleCopy}
        onMove={handleMove}
        onNewDir={() => setModal('newdir')}
        onDelete={handleDelete}
        onShell={() => setModal('shell')}
        onCmd={() => {
          const s = useFileStore.getState()
          import('./wailsjs/runtime').then(m => m.default.OpenCmdWindow(s[s.activePanel].path))
        }}
      />

      {modal === 'newdir' && (
        <NewItemDialog type="directory"
          onConfirm={async (name) => { const s=useFileStore.getState(); await s.createDirectory(s.activePanel,name); setModal(null); focusActivePanel() }}
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
      {modal === 'search'    && <SearchDialog   onClose={() => { setModal(null); focusActivePanel() }} onView={(file) => { setModal(null); tryOpenViewer(file) }} onEdit={(file) => { setModal(null); tryOpenEditor(file) }} />}
      {modal === 'bookmarks' && <BookmarkDialog onClose={() => { setModal(null); focusActivePanel() }} />}
      {modal === 'help'      && <HelpDialog     onClose={() => { setModal(null); focusActivePanel() }} />}
      {modal === 'shell' && (() => {
        const s = useFileStore.getState()
        return <ShellCommandDialog workDir={s[s.activePanel].path} onClose={() => { setModal(null); focusActivePanel() }} />
      })()}
      {deleteTarget && (
        <ConfirmDialog title="Delete Items"
          message={deleteError ? `삭제 실패: ${deleteError}` : `Permanently delete ${deleteTarget.count} item(s)?`}
          items={deleteTarget.paths.map(p => p.split(/[/\\]/).pop())}
          confirmLabel="Delete" danger
          onConfirm={handleConfirmDelete} onClose={() => { setDeleteTarget(null); setDeleteError(null); focusActivePanel() }} />
      )}
      {copyConflict && (
        <CopyConflictDialog
          conflicts={copyConflict.conflicts}
          sources={copyConflict.sources}
          dest={copyConflict.dest}
          onConfirm={handleCopyConflictConfirm}
          onClose={() => { setCopyConflict(null); focusActivePanel() }}
        />
      )}
      {moveConflict && (
        <MoveConflictDialog
          conflicts={moveConflict.conflicts}
          sources={moveConflict.sources}
          dest={moveConflict.dest}
          onConfirm={handleMoveConflictConfirm}
          onClose={() => { setMoveConflict(null); focusActivePanel() }}
        />
      )}
      {fileSizeError && (
        <ConfirmDialog
          title="파일 크기 초과"
          message={`"${fileSizeError}" 파일이 10MB를 초과하여 내장 뷰어/에디터로 열 수 없습니다.`}
          confirmLabel="확인"
          hideCancel
          onConfirm={() => { setFileSizeError(null); focusActivePanel() }}
          onClose={() => { setFileSizeError(null); focusActivePanel() }}
        />
      )}
      {viewerFile && <FileViewer path={viewerFile} onClose={() => { setViewerFile(null); focusActivePanel() }}
        onSwitchToEditor={() => { const p = viewerFile; setViewerFile(null); setEditorFile(p) }}
        siblingImages={(() => {
          // 활성 패널의 visible 파일 중 이미지만 절대 경로로 추출 (←/→ 네비게이션용)
          const s = useFileStore.getState()
          const panel = s[s.activePanel]
          if (!panel) return null
          const visible = panel.showHidden ? panel.files : panel.files.filter(f => !f.isHidden)
          return visible.filter(f => !f.isDir && isImageFile(f.extension || '')).map(f => f.path)
        })()}
        onChangePath={(p) => setViewerFile(p)} />}
      {editorFile && <TextEditor path={editorFile} onClose={() => { setEditorFile(null); focusActivePanel() }}
        onSwitchToViewer={() => { const p = editorFile; setEditorFile(null); setViewerFile(p) }} />}
    </div>
  )
}
