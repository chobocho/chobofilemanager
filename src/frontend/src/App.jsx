import React, { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react'
import { useFileStore, getCursorFile, operationPaths, READ_ONLY_MSG } from './stores/fileStore'
import { useFTPStore } from './stores/ftpStore'
import { useThemeStore } from './stores/themeStore'
import Toolbar from './components/Toolbar'
import FilePanel from './components/FilePanel'
import StatusBar from './components/StatusBar'
import FKeyBar from './components/FKeyBar'
import FTPManager, { ConnectModal } from './components/FTPManager'
import { isFtpPath, ftpRoot } from './utils/ftpPath.js'
import { ConfirmDialog, NewItemDialog, RenameDialog, SearchDialog, ShellCommandDialog } from './components/ConfirmDialog'
import BookmarkDialog from './components/BookmarkDialog'
import HelpDialog from './components/HelpDialog'
import SelectMaskDialog from './components/SelectMaskDialog'
import MultiRenameDialog from './components/MultiRenameDialog'
import PermissionsDialog from './components/PermissionsDialog'
import SyncDialog from './components/SyncDialog'
import { pickDiffTargets } from './utils/diffTargets.js'
import ButtonBar from './components/ButtonBar'
import ButtonEditDialog from './components/ButtonEditDialog'
import PluginDialog from './components/PluginDialog'
import { useButtonStore } from './stores/buttonStore'
import { expandParams } from './utils/buttonParams.js'
import CopyConflictDialog from './components/CopyConflictDialog'
import MoveConflictDialog from './components/MoveConflictDialog'
import { MAX_VIEWER_FILE_SIZE, exceedsViewerLimit, isImageFile } from './utils/fileTypes.js'
import { isTerminalTarget } from './utils/keyboard.js'
import { useDockStore } from './stores/dockStore'
import { useEditorStore } from './stores/editorStore'
import CloseGuard from './components/CloseGuard'
import WebStartNotice from './components/WebStartNotice'

// Todo #115: 뷰어/에디터(CodeMirror·marked·DOMPurify 포함)는 처음 열 때 불러와 초기 번들을 줄임
const loadTextEditor = () => import('./components/TextEditor')
const loadFileViewer = () => import('./components/FileViewer')
const TextEditor = lazy(loadTextEditor)
// Todo #120: 터미널(choboTerm)은 Terminal 보기를 처음 열 때 불러옴 (xterm 포함)
const TerminalWorkspace = lazy(() => import('./terminal/components/TerminalWorkspace.jsx'))
// Todo #122: 하단 터미널 도크 — F9로 처음 열 때 불러옴
const TerminalDock = lazy(() => import('./terminal/components/TerminalDock.jsx'))
const FileViewer = lazy(loadFileViewer)
// Todo #133-7: 파일 내용 비교 (@codemirror/merge) — 처음 열 때 불러옴
const DiffView = lazy(() => import('./components/DiffView'))
// Todo #133-9: 빠른 보기 (Ctrl+Q)
const QuickView = lazy(() => import('./components/QuickView'))

// 빠른 보기 자리: 반대(활성) 패널의 커서 파일을 보여 줌
function QuickViewPane({ side }) {
  const other = side === 'left' ? 'right' : 'left'
  const file = useFileStore(s => getCursorFile(s[other]))
  const dirSize = useFileStore(s => { const f = getCursorFile(s[other]); return f?.isDir ? s[other].dirSizes?.[f.path] : undefined })
  return <Suspense fallback={null}><QuickView file={file} dirSize={dirSize} /></Suspense>
}

// 시작 후 여유 시간에 미리 받아 두어 첫 F3/F4도 바로 열리게 함
export function prefetchViewerChunks() {
  const run = () => { loadFileViewer().catch(() => {}); loadTextEditor().catch(() => {}) }
  if (typeof window !== 'undefined' && window.requestIdleCallback) window.requestIdleCallback(run, { timeout: 3000 })
  else setTimeout(run, 1500)
}
import styles from './styles/App.module.css'

// Starlark 스크래치 — Ctrl+Shift+M (Todo #55, #133-4: Ctrl+M은 Total Commander처럼 여러 이름 바꾸기)
export function isStarlarkScratchShortcut(e) {
  if (!(e.ctrlKey || e.metaKey) || !e.shiftKey || e.altKey) return false
  return (e.key || '').toLowerCase() === 'm'
}

// Ctrl+Shift+D: 파일 내용 비교 (Todo #133-7)
export function isDiffShortcut(e) {
  return !!(e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey && (e.key || '').toLowerCase() === 'd'
}

// Alt+A: 권한 · 소유자 (Todo #137-2, TC "속성 바꾸기" 자리)
export function isPermsShortcut(e) {
  return !!e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && (e.key || '').toLowerCase() === 'a'
}

export function isMultiRenameShortcut(e) {
  return !!(e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && (e.key || '').toLowerCase() === 'm'
}

// 활성 패널에 보이는 이미지 파일들 (뷰어의 ←/→ 넘기기용)
function panelImages() {
  const s = useFileStore.getState()
  const panel = s[s.activePanel]
  if (!panel) return null
  const visible = panel.showHidden ? panel.files : panel.files.filter(f => !f.isHidden)
  return visible.filter(f => !f.isDir && isImageFile(f.extension || '')).map(f => f.path)
}

// Todo #124: 다른 PC의 브라우저 화면(웹 서버, internal/web)은 터미널만 — 파일 관리자 Go 바인딩이 없음
export const isWebPage = () => typeof window !== 'undefined' && !!window.__cbt

export function WebTerminal() {
  return (
    <div className={styles.webTerminal}>
      <Suspense fallback={null}>
        <TerminalWorkspace />
      </Suspense>
    </div>
  )
}

export default function App() {
  return isWebPage() ? <WebTerminal /> : <FileManagerApp />
}

function FileManagerApp() {
  const init        = useFileStore(s => s.init)
  const loadBkmarks = useFTPStore(s => s.loadBookmarks)
  const theme       = useThemeStore(s => s.theme)

  const [view, setView]             = useState('files')
  // 한 번 연 터미널은 다른 보기로 가도 세션이 유지되도록 마운트 유지
  const [terminalMounted, setTerminalMounted] = useState(false)
  useEffect(() => {
    if (view === 'terminal') setTerminalMounted(true)
    // 창 투명도는 터미널 보기일 때만 페이지 배경을 비움 (global.css)
    document.body.classList.toggle('term-view-active', view === 'terminal')
  }, [view])
  const dockOpen    = useDockStore(s => s.open)
  const dockMounted = useDockStore(s => s.mounted)
  const [modal, setModal]           = useState(null)
  // Todo #123: 뷰어/에디터 열림 상태는 공용 스토어 (터미널의 원격 파일 창도 엶)
  const viewer = useEditorStore(s => s.viewer)
  const editor = useEditorStore(s => s.editor)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteError, setDeleteError]   = useState(null)
  const [trashTarget, setTrashTarget]   = useState(null) // Todo #57: F8/Delete 휴지통 대상
  const [trashError, setTrashError]     = useState(null)
  const [copyConflict, setCopyConflict] = useState(null) // { conflicts, sources, dest }
  const [moveConflict, setMoveConflict] = useState(null) // { conflicts, sources, dest }
  const [fileSizeError, setFileSizeError] = useState(null) // 크기 초과 파일명
  const [diff, setDiff] = useState(null) // { left, right } 파일 내용 비교 (Todo #133-7)
  const [quickView, setQuickView] = useState(null) // 빠른 보기가 차지한 쪽 'left' | 'right' (Todo #133-9)
  const [plugin, setPlugin] = useState(null) // 플러그인 창 { autoRun } (Todo #133-13)
  const [buttonEdit, setButtonEdit] = useState(undefined) // 단추 고치기: 단추 | null(새 단추) | undefined(닫힘) (Todo #133-12)
  const leftPanelRef  = useRef(null)
  const rightPanelRef = useRef(null)

  // Todo #77: 화면 위에 무언가 떠 있으면 파일 패널 단축키를 막음 (키 입력이 뒤 패널로 새지 않게)
  const overlayOpen = !!(modal || editor || viewer || deleteTarget || trashTarget
    || copyConflict || moveConflict || fileSizeError || diff || buttonEdit !== undefined || plugin)

  // 모달/다이얼로그 닫힌 후 활성 패널로 포커스 복원
  const focusActivePanel = useCallback(() => {
    const active = useFileStore.getState().activePanel
    const ref = active === 'left' ? leftPanelRef : rightPanelRef
    // DOM 업데이트 후 포커스 (requestAnimationFrame으로 한 프레임 뒤)
    requestAnimationFrame(() => ref.current?.focus())
  }, [])

  // 도크를 닫으면 파일 패널로 포커스
  const dockWasOpen = useRef(false)
  useEffect(() => {
    if (dockWasOpen.current && !dockOpen) focusActivePanel()
    dockWasOpen.current = dockOpen
  }, [dockOpen, focusActivePanel])

  const openCmdWindow = useCallback(() => {
    const s = useFileStore.getState()
    import('./wailsjs/runtime').then(m => m.default.OpenCmdWindow(s[s.activePanel].path))
      .catch(err => useFileStore.getState().setStatus(`명령 창 열기 실패: ${err}`))
  }, [])

  // Ctrl+Enter(이름) / Ctrl+Shift+Enter(전체 경로) → 터미널 도크
  const pastePath = useCallback((file, full) => {
    useDockStore.getState().paste(full ? file.path : file.name)
  }, [])

  // Enter/더블클릭: 실행 권한 파일 → 터미널 도크에서 그 폴더로 cd 후 실행 (Todo #136-2)
  const runFile = useCallback((file, dir) => {
    useDockStore.getState().run(dir, file.path)
  }, [])

  // 대화상자를 닫고 활성 파일 패널로 포커스 (10곳이 같은 두 줄이던 것)
  const closeModal = useCallback(() => { setModal(null); focusActivePanel() }, [focusActivePanel])

  const tryOpenViewer = useCallback((file) => {
    if (exceedsViewerLimit(file.size)) { setFileSizeError(file.name); return }
    useEditorStore.getState().openViewer(file.path, { siblings: panelImages() })
  }, [])

  const tryOpenEditor = useCallback((file) => {
    if (exceedsViewerLimit(file.size)) { setFileSizeError(file.name); return }
    // 압축 파일 안은 F3 보기만 (Todo #133-5)
    const s = useFileStore.getState()
    if (s[s.activePanel].readOnly && file.path.startsWith(s[s.activePanel].path)) { s.setStatus(READ_ONLY_MSG); return }
    useEditorStore.getState().openEditor(file.path)
  }, [])

  // 뷰어/에디터를 닫은 뒤: 연 쪽이 정한 곳(원격 파일 창 등), 없으면 활성 파일 패널로 포커스
  const closeViewer = useCallback(() => { (useEditorStore.getState().closeViewer() ?? focusActivePanel)() }, [focusActivePanel])
  const closeEditor = useCallback(() => { (useEditorStore.getState().closeEditor() ?? focusActivePanel)() }, [focusActivePanel])

  useEffect(() => {
    Promise.all([init(), loadBkmarks()])
      .catch(err => console.error('초기화 실패:', err))
      .finally(() => {
        requestAnimationFrame(() => leftPanelRef.current?.focus())
        prefetchViewerChunks()
      })
  }, [])

  // Ctrl+Shift+M: Starlark 스크래치 — 임시 .star 파일 생성 후 F4 에디터로 열기. (Todo #55, #133-4)
  // 에디터/뷰어/모달이 떠 있을 때는 그쪽 핸들러에 양보.
  const handleStarlarkScratch = useCallback(async () => {
    try {
      const api = (await import('./wailsjs/runtime')).default
      const path = await api.CreateStarlarkScratchFile()
      if (path) useEditorStore.getState().openEditor(path)
    } catch (e) {
      console.error('Starlark scratch 생성 실패:', e)
    }
  }, [])

  // Ctrl+M 여러 이름 바꾸기 (Todo #133-4): 선택한 항목(보이는 순서), 없으면 커서 파일
  const [renameTargets, setRenameTargets] = useState(null)
  const openMultiRename = useCallback(() => {
    const s = useFileStore.getState()
    const p = s[s.activePanel]
    if (p.readOnly) { s.setStatus(READ_ONLY_MSG); return }
    const paths = new Set(operationPaths(p))
    const visible = p.showHidden ? p.files : p.files.filter(f => !f.isHidden)
    const files = visible.filter(f => paths.has(f.path))
    if (!files.length) return
    setRenameTargets({ files, existingNames: p.files.map(f => f.name) })
    setModal('multirename')
  }, [])

  // Alt+A 권한 · 소유자 (Todo #137-2): 리눅스 · macOS 로컬 폴더만
  const [permTargets, setPermTargets] = useState(null)
  const openPerms = useCallback(() => {
    const s = useFileStore.getState()
    const p = s[s.activePanel]
    if (p.readOnly) { s.setStatus(READ_ONLY_MSG); return }
    if (!p.path?.startsWith('/')) { s.setStatus('권한 · 소유자 바꾸기는 리눅스 · macOS 폴더에서만 됩니다'); return }
    const paths = new Set(operationPaths(p))
    const visible = p.showHidden ? p.files : p.files.filter(f => !f.isHidden)
    const files = visible.filter(f => paths.has(f.path))
    if (!files.length) return
    setPermTargets(files)
    setModal('perms')
  }, [])

  const toggleQuickView = useCallback(() => {
    const active = useFileStore.getState().activePanel
    setQuickView(q => q ? null : (active === 'left' ? 'right' : 'left'))
    focusActivePanel()
  }, [focusActivePanel])

  const openDiff = useCallback(() => {
    const t = pickDiffTargets(useFileStore.getState())
    if (t) setDiff({ left: t[0], right: t[1] })
    else useFileStore.getState().setStatus('비교할 파일: 한 패널에서 두 개를 고르거나, 양쪽 패널의 커서를 파일에 두세요')
  }, [])

  useEffect(() => {
    const handler = (e) => {
      if (overlayOpen) return
      if (isTerminalTarget(e.target)) return // 터미널 안의 키는 셸로 (Todo #119)
      // Todo #126: 모두 파일 패널에 작용하는 키 — 파일 보기에서만, 입력 칸 안에서는 그 칸의 키 (Toolbar와 같은 규칙)
      if (view !== 'files') return
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      if (e.ctrlKey && e.key === 'o') {
        e.preventDefault()
        setModal('shell')
      }
      // Todo #122: F9 하단 터미널 도크, Shift+F9 바깥 명령 창
      if (e.key === 'F9' && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        if (e.shiftKey) openCmdWindow()
        else useDockStore.getState().toggle()
      }
      // 다른 다이얼로그/뷰어/에디터가 떠 있으면 무시 (그쪽 단축키와 충돌 방지)
      if (isStarlarkScratchShortcut(e)) {
        e.preventDefault()
        handleStarlarkScratch()
      }
      if (isMultiRenameShortcut(e)) {
        e.preventDefault()
        openMultiRename()
      }
      if (isPermsShortcut(e)) {
        e.preventDefault()
        openPerms()
      }
      // Ctrl+Q 빠른 보기: 반대 패널 자리에 커서 파일 미리 보기 (Todo #133-9)
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && (e.key === 'q' || e.key === 'Q')) {
        e.preventDefault()
        toggleQuickView()
      }
      if (isDiffShortcut(e)) {
        e.preventDefault()
        openDiff()
      }
      // Ctrl+Shift+X: 플러그인 (Todo #133-13)
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey && (e.key === 'x' || e.key === 'X')) {
        e.preventDefault()
        setPlugin({ autoRun: null })
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [overlayOpen, handleStarlarkScratch, openCmdWindow, openMultiRename, openPerms, view, toggleQuickView, openDiff])

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

  // Todo #57: F8/Delete 휴지통 이동 흐름 (영구 삭제와 분리된 별도 확인 다이얼로그)
  const handleTrash = async () => {
    // FTP에는 휴지통이 없음 → 영구 삭제 확인 (Todo #133-8)
    const st = useFileStore.getState()
    if (isFtpPath(st[st.activePanel].path)) return handleDelete()
    const result = await useFileStore.getState().trash()
    if (result.count > 0) setTrashTarget(result)
  }

  const handleConfirmTrash = async () => {
    if (trashTarget) {
      try {
        await useFileStore.getState().confirmTrash(trashTarget.paths)
        setTrashTarget(null)
        setTrashError(null)
        focusActivePanel()
      } catch (err) {
        setTrashError(String(err))
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
    const cursor = getCursorFile(store[store.activePanel])
    if (cursor && !cursor.isDir) {
      await store.extract(store.activePanel, cursor.path)
    }
    focusActivePanel()
  }

  const handleNewFile = async (name) => {
    const store = useFileStore.getState()
    // Todo #56: 생성 후 커서가 새 파일로 이동 + 스크롤 (store가 처리)
    await store.createFile(store.activePanel, name)
    closeModal()
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

  // 이름 변경 대상이 없으면([..] 또는 빈 폴더) 대화상자를 열지 않음 — RenameDialog가 null을 렌더링해
  // 보이지 않는 modal이 단축키를 막는 상태 방지 (Todo #78)
  // F3/F4 (도구 막대·F키 막대): 활성 패널 커서 파일을 보기/편집 (Todo #131-4)
  const cursorFileOnly = () => { const s = useFileStore.getState(); const f = getCursorFile(s[s.activePanel]); return f && !f.isDir ? f : null }
  const handleViewCursor = () => { const f = cursorFileOnly(); if (f) tryOpenViewer(f) }
  const handleEditCursor = () => { const f = cursorFileOnly(); if (f) tryOpenEditor(f) }

  const handleRename = () => {
    const s = useFileStore.getState()
    if (s[s.activePanel].readOnly) { s.setStatus(READ_ONLY_MSG); return }
    if (getCursorFile(s[s.activePanel])) setModal('rename')
  }

  // 드라이브 목록의 "FTP 연결..." → 연결하면 활성 패널에 그 FTP 루트 (Todo #133-8)
  const openFtpConnect = useCallback(() => setModal('ftpconnect'), [])
  const handleFtpConnect = async (config) => {
    const st = useFileStore.getState()
    const panel = st.activePanel
    try {
      const conn = await useFTPStore.getState().connect(config)
      useFTPStore.getState().addHistory(config)
      closeModal()
      if (conn) await useFileStore.getState().navigate(panel, ftpRoot(conn.id))
    } catch (err) {
      st.setStatus(`FTP 연결 실패: ${err?.message ?? err}`)
      closeModal()
    }
  }

  // Num+ / Num- (Todo #133-2)
  const openMaskSelect = useCallback((mode) => setModal(mode === 'deselect' ? 'deselect' : 'select'), [])

  const handleSwitchPanel = useCallback(() => {
    if (quickViewRef.current) return // 빠른 보기 중에는 반대 패널이 없음
    const next = useFileStore.getState().activePanel === 'left' ? 'right' : 'left'
    useFileStore.getState().setActivePanel(next)
    const ref = next === 'left' ? leftPanelRef : rightPanelRef
    requestAnimationFrame(() => ref.current?.focus())
  }, [])
  // 사용자 단추 실행 (Todo #133-12): "@기능"은 앱 안의 기능, 그 밖은 자리 표시를 바꿔 프로그램 실행
  const runInternal = (cmd) => {
    const s = useFileStore.getState()
    const actions = {
      '@copy': handleCopy, '@move': handleMove, '@mkdir': () => setModal('newdir'), '@delete': handleTrash,
      '@search': () => setModal('search'), '@compare': () => s.compareDirsSelect(), '@sync': () => setModal('sync'),
      '@diff': openDiff, '@multirename': openMultiRename, '@perms': openPerms, '@quickview': toggleQuickView,
      '@tree': () => s.toggleTree(s.activePanel), '@terminal': () => useDockStore.getState().toggle(),
      '@ftp': () => setModal('ftpconnect'), '@refresh': () => s.refresh(s.activePanel), '@hidden': () => s.toggleHidden(s.activePanel),
    }
    if (cmd.toLowerCase().startsWith('@plugin:')) { setPlugin({ autoRun: cmd.slice('@plugin:'.length) }); return }
    if (cmd.toLowerCase() === '@plugins') { setPlugin({ autoRun: null }); return }
    const fn = actions[cmd.toLowerCase()]
    if (fn) fn()
    else s.setStatus(`모르는 기능: ${cmd}`)
  }
  const runUserButton = async (btn) => {
    if (btn.command.startsWith('@')) { runInternal(btn.command); return }
    const s = useFileStore.getState()
    const active = s[s.activePanel], other = s[s.activePanel === 'left' ? 'right' : 'left']
    const ctx = { activePath: active.path, targetPath: other.path, cursor: getCursorFile(active), selected: [...active.selected] }
    try {
      const api = (await import('./wailsjs/runtime')).default
      await api.RunUserCommand(btn.command, expandParams(btn.params, ctx), expandParams(btn.startDir || '%P', ctx))
      s.setStatus(`실행: ${btn.name}`)
    } catch (err) {
      s.setStatus(`실행 실패: ${btn.name}: ${err?.message ?? err}`)
    }
    focusActivePanel()
  }
  const closeButtonEdit = () => { setButtonEdit(undefined); focusActivePanel() }
  const pluginContext = useCallback(() => {
    const s = useFileStore.getState()
    const active = s[s.activePanel], other = s[s.activePanel === 'left' ? 'right' : 'left']
    return { panelPath: active.path, targetPath: other.path, cursor: getCursorFile(active)?.path || '', selected: [...active.selected] }
  }, [])
  const refreshPanels = useCallback(() => { const s = useFileStore.getState(); s.refresh('left'); s.refresh('right') }, [])

  const quickViewRef = useRef(null)
  quickViewRef.current = quickView
  const switchToPanel = (target) => {
    if (quickView === target) return
    useFileStore.getState().setActivePanel(target)
    const ref = target === 'left' ? leftPanelRef : rightPanelRef
    requestAnimationFrame(() => ref.current?.focus())
  }

  return (
    <div className={styles.app} data-theme={theme} data-app-root>
      <CloseGuard />
      <WebStartNotice />
      <Toolbar
        view={view} onViewChange={setView}
        shortcutsDisabled={overlayOpen}
        onHelp={() => setModal('help')}
        onNewFile={() => setModal('newfile')}
        onSearch={() => setModal('search')}
        onCompress={handleCompress}
        onExtract={handleExtract}
        onRename={handleRename}
        onView={handleViewCursor}
        onEdit={handleEditCursor}
        onCopy={handleCopy}
        onMove={handleMove}
        onNewDir={() => setModal('newdir')}
        onDelete={handleDelete}
        onTrash={handleTrash}
        onSwitchPanel={handleSwitchPanel}
        onBookmarks={() => setModal('bookmarks')}
        onCompareDirs={() => useFileStore.getState().compareDirsSelect()}
        onSyncDirs={() => setModal('sync')}
      />
      {view === 'files' && <ButtonBar onRun={runUserButton} onEdit={setButtonEdit} />}
      <div className={styles.content}>
        {view === 'files' ? (
          <div className={styles.panels}>
            {quickView === 'left' ? <QuickViewPane side="left" /> : (
            <FilePanel side="left" ref={leftPanelRef} onEdit={tryOpenEditor} onView={tryOpenViewer} keyboardDisabled={overlayOpen} onRunFile={runFile} onPastePath={pastePath} onMaskSelect={openMaskSelect} onFtpConnect={openFtpConnect}
              onSwitchToPanel={switchToPanel} />)}
            <div className={styles.divider} />
            {quickView === 'right' ? <QuickViewPane side="right" /> : (
            <FilePanel side="right" ref={rightPanelRef} onEdit={tryOpenEditor} onView={tryOpenViewer} keyboardDisabled={overlayOpen} onRunFile={runFile} onPastePath={pastePath} onMaskSelect={openMaskSelect} onFtpConnect={openFtpConnect}
              onSwitchToPanel={switchToPanel} />)}
          </div>
        ) : view === 'ftp' ? (
          <FTPManager />
        ) : null}
        {dockMounted && (
          <div className={styles.dockView} hidden={!(dockOpen && view === 'files')}>
            <Suspense fallback={null}>
              <TerminalDock />
            </Suspense>
          </div>
        )}
        {terminalMounted && (
          <div className={styles.terminalView} hidden={view !== 'terminal'}>
            <Suspense fallback={null}>
              <TerminalWorkspace shown={view === 'terminal'} />
            </Suspense>
          </div>
        )}
      </div>
      <StatusBar />
      <FKeyBar
        fileView={view === 'files'}
        onHelp={() => setModal('help')}
        onRename={handleRename}
        onView={handleViewCursor}
        onEdit={handleEditCursor}
        onCopy={handleCopy}
        onMove={handleMove}
        onNewDir={() => setModal('newdir')}
        onDelete={handleDelete}
        onTrash={handleTrash}
        onShell={() => setModal('shell')}
        onCmd={() => useDockStore.getState().toggle()}
      />

      {modal === 'newdir' && (
        <NewItemDialog type="directory"
          onConfirm={async (name) => { const s=useFileStore.getState(); await s.createDirectory(s.activePanel,name); closeModal() }}
          onClose={closeModal} />
      )}
      {modal === 'newfile' && (
        <NewItemDialog type="file" onConfirm={handleNewFile} onClose={closeModal} />
      )}
      {modal === 'rename' && (
        <RenameDialog
          onConfirm={async (oldPath, newName) => { const s=useFileStore.getState(); await s.rename(s.activePanel,oldPath,newName); closeModal() }}
          onClose={closeModal} />
      )}
      {modal === 'search'    && <SearchDialog   onClose={closeModal} onView={(file) => { setModal(null); tryOpenViewer(file) }} onEdit={(file) => { setModal(null); tryOpenEditor(file) }} />}
      {modal === 'bookmarks' && <BookmarkDialog onClose={closeModal} />}
      {modal === 'help'      && <HelpDialog     onClose={closeModal} />}
      {plugin && (
        <PluginDialog getContext={pluginContext} autoRun={plugin.autoRun} onRefresh={refreshPanels}
          onAddButton={(p) => { useButtonStore.getState().upsert({ name: p.name, command: `@plugin:${p.file}` }); useFileStore.getState().setStatus(`단추 추가: ${p.name}`) }}
          onClose={() => { setPlugin(null); focusActivePanel() }} />
      )}
      {buttonEdit !== undefined && (
        <ButtonEditDialog button={buttonEdit}
          onSave={async (b) => { await useButtonStore.getState().upsert(b); closeButtonEdit() }}
          onDelete={async (id) => { await useButtonStore.getState().remove(id); closeButtonEdit() }}
          onMove={(id, dir) => useButtonStore.getState().move(id, dir)}
          onClose={closeButtonEdit} />
      )}
      {modal === 'ftpconnect' && <ConnectModal onConnect={handleFtpConnect} onClose={closeModal} />}
      {modal === 'sync' && (() => {
        const s = useFileStore.getState()
        return <SyncDialog left={s.left.path} right={s.right.path} onClose={closeModal}
          onDiff={(l, r) => setDiff({ left: l, right: r })}
          onDone={() => { const st = useFileStore.getState(); st.refresh('left'); st.refresh('right') }} />
      })()}
      {modal === 'multirename' && renameTargets && (
        <MultiRenameDialog files={renameTargets.files} existingNames={renameTargets.existingNames}
          onConfirm={async (pairs) => { const s = useFileStore.getState(); await s.multiRename(s.activePanel, pairs); closeModal() }}
          onClose={closeModal} />
      )}
      {(modal === 'select' || modal === 'deselect') && (
        <SelectMaskDialog mode={modal} initialMask={useFileStore.getState().lastMask}
          onConfirm={(mask, opts) => { const s = useFileStore.getState(); s.selectByMask(s.activePanel, mask, { ...opts, select: modal === 'select' }); closeModal() }}
          onClose={closeModal} />
      )}
      {modal === 'perms' && permTargets && (
        <PermissionsDialog files={permTargets} onClose={closeModal}
          onConfirm={(opts) => { const s = useFileStore.getState(); closeModal(); s.changePerms(s.activePanel, permTargets.map(f => f.path), opts) }} />
      )}
      {modal === 'shell' && (() => {
        const s = useFileStore.getState()
        return <ShellCommandDialog workDir={s[s.activePanel].path} onClose={closeModal} />
      })()}
      {deleteTarget && (
        <ConfirmDialog title="영구 삭제"
          message={deleteError ? `삭제 실패: ${deleteError}` : `${deleteTarget.count}개 항목을 영구 삭제하시겠습니까? (복구 불가)`}
          items={deleteTarget.paths.map(p => p.split(/[/\\]/).pop())}
          confirmLabel="영구 삭제" danger
          onConfirm={handleConfirmDelete} onClose={() => { setDeleteTarget(null); setDeleteError(null); focusActivePanel() }} />
      )}
      {trashTarget && (
        <ConfirmDialog title="휴지통으로 이동"
          message={trashError ? `휴지통 이동 실패: ${trashError}` : `${trashTarget.count}개 항목을 휴지통으로 이동하시겠습니까?`}
          items={trashTarget.paths.map(p => p.split(/[/\\]/).pop())}
          confirmLabel="휴지통으로 이동"
          onConfirm={handleConfirmTrash} onClose={() => { setTrashTarget(null); setTrashError(null); focusActivePanel() }} />
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
          message={`"${fileSizeError}" 파일이 ${MAX_VIEWER_FILE_SIZE / 1024 / 1024}MB를 초과하여 내장 뷰어/에디터로 열 수 없습니다.`}
          confirmLabel="확인"
          hideCancel
          onConfirm={() => { setFileSizeError(null); focusActivePanel() }}
          onClose={() => { setFileSizeError(null); focusActivePanel() }}
        />
      )}
      <Suspense fallback={null}>
      {viewer && <FileViewer path={viewer.path} source={viewer.source} onClose={closeViewer}
        onSwitchToEditor={() => useEditorStore.getState().viewerToEditor()}
        siblingImages={viewer.siblings ?? null}
        onChangePath={(p) => useEditorStore.getState().changeViewerPath(p)} />}
      {diff && <DiffView leftPath={diff.left} rightPath={diff.right}
        onClose={() => { setDiff(null); if (!modal) focusActivePanel() }} />}
      {editor && <TextEditor path={editor.path} source={editor.source} onClose={closeEditor}
        onSwitchToViewer={() => useEditorStore.getState().editorToViewer()} />}
      </Suspense>
    </div>
  )
}
