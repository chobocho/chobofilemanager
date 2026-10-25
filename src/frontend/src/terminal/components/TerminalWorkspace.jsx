import React, { useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { TerminalSquare } from 'lucide-react'
import { sessionById } from '../core/session'
import { isPaneMoveKey } from '../core/look'
import { workspaceAction } from '../core/workspaceKeys'
import { leaves, paneRects, gutters, ARROWS } from '../core/layout'
import { startWindowDrag, pct, rectStyle } from '../core/drag'
import { copySelection, pasteClipboard } from '../core/clipboard'
import { macroForKey } from '../core/macros'
import { useTermStore } from '../store/termStore'
import { useScriptStore } from '../store/scriptStore'
import { useFilesStore } from '../store/filesStore'
import { useTerminalBootstrap, useWindowTitle, useCat } from './workspaceHooks'
import TabBar from './TabBar.jsx'
import TerminalPane from './TerminalPane.jsx'
import ConnectDialog from './ConnectDialog.jsx'
import AuthPrompt from './AuthPrompt.jsx'
import { PasteConfirm } from './TerminalModals.jsx'
import TerminalHelp from './TerminalHelp.jsx'
import SearchBar from './SearchBar.jsx'
import TabMenu from './TabMenu.jsx'
import SessionManager from './SessionManager.jsx'
import SaveSessionDialog from './SaveSessionDialog.jsx'
import PrefsDialog from './PrefsDialog.jsx'
import MacrosDialog from './MacrosDialog.jsx'
import MemoPad from './MemoPad.jsx'
import RemoteFiles from './RemoteFiles.jsx'
import TransferProgress from './TransferProgress.jsx'
import ForwardsDialog from './ForwardsDialog.jsx'
import ContainersDialog from './ContainersDialog.jsx'
import ScriptBox from './ScriptBox.jsx'
import styles from '../styles/Terminal.module.css'

const defaultCreateTerminal = (opts) => new Terminal(opts)

// Terminal 보기 (Todo #120, #121): 탭 막대(그룹) + 칸별 터미널 + 연결 대화상자.
// 모든 칸은 하나의 부모 아래에 평평하게 마운트하고 분할 트리로 계산한 위치에 배치합니다
// (분할할 때 칸을 다른 부모로 옮기면 React가 다시 만들어 화면 내용이 사라지므로).
// cat: 고양이 (Todo #124) — jsdom 테스트에서는 끔 (24fps 애니메이션)
// shown: 이 보기가 화면에 보이는지 (창 제목을 활성 연결로 바꿀지)
export default function TerminalWorkspace({ createTerminal = defaultCreateTerminal, addons = true, cat = addons, shown = true }) {
  const tabs = useTermStore(s => s.tabs)
  const groups = useTermStore(s => s.groups)
  const activeId = useTermStore(s => s.activeId)
  const saveRequest = useTermStore(s => s.saveRequest)
  const sessionManager = useTermStore(s => s.sessionManager)
  const prefsOpen = useTermStore(s => s.prefs)
  const macrosOpen = useTermStore(s => s.macros)
  const memos = useTermStore(s => s.memos)
  const panel = useTermStore(s => s.panel)
  const scripts = useScriptStore(s => s.tabs)
  const filesView = useFilesStore(s => (activeId != null ? s.views[activeId] : undefined))
  const xfer = useFilesStore(s => s.xfer)
  const active = tabs.find(t => t.id === activeId)
  const activeGroup = groups.find(g => leaves(g.layout).includes(activeId))
  const [pasteRequest, setPasteRequest] = useState(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [menu, setMenu] = useState(null) // { id, x, y }
  const [helpOpen, setHelpOpen] = useState(false)
  const areaRef = useRef(null)

  const webServer = useTerminalBootstrap()
  useWindowTitle(shown, active)
  useCat(cat, areaRef)

  function onKeyDown(e) {
    const st = useTermStore.getState()
    const macro = macroForKey(e)
    if (macro) {
      // 연결 창·질문 창이 열려 있으면 그 창의 키
      const a = st.tabs.find(t => t.id === st.activeId)
      if (a?.dialog || st.prefs || st.macros || st.sessionManager || st.saveRequest) return
      e.preventDefault()
      e.stopPropagation()
      st.sendMacro(macro)
      return
    }
    if (isPaneMoveKey(e)) {
      const [dx, dy] = ARROWS[e.key]
      if (st.focusDir(dx, dy)) { e.preventDefault(); e.stopPropagation() }
      return
    }
    const action = workspaceAction(e)
    if (!action) return
    e.preventDefault()
    e.stopPropagation()
    const id = st.activeId
    const s = sessionById(id)
    // 단축키 표(core/workspaceKeys)의 동작마다 할 일 — 활성 칸이 있어야 하는 것은 없으면 건너뜀
    const run = {
      splitRight: () => id != null && st.splitPane(id, 'row'),
      splitDown: () => id != null && st.splitPane(id, 'col'),
      newTab: () => st.newTab(),
      closeTab: () => id != null && st.closeTab(id),
      nextTab: () => st.cycle(1),
      prevTab: () => st.cycle(-1),
      search: () => setSearchOpen(true),
      sessions: () => st.openSessionManager(),
      prefs: () => st.openPrefs(),
      macros: () => st.openMacros(),
      log: () => id != null && st.toggleLog(id),
      memo: () => st.toggleMemo(id),
      files: () => id != null && st.openFiles(id),
      forwards: () => id != null && st.openPanel('forwards', id),
      containers: () => id != null && st.openPanel('containers', id),
      console: () => id != null && useScriptStore.getState().toggleConsole(id),
      copy: () => s && copySelection(s),
      paste: () => s && pasteClipboard(s, setPasteRequest),
      disconnect: () => id != null && st.disconnect(id),
      encoding: () => id != null && st.toggleEncoding(id),
      help: () => setHelpOpen(o => !o),
      fontUp: () => st.changeFontSize(1),
      fontDown: () => st.changeFontSize(-1),
      fontReset: () => st.changeFontSize('reset'),
    }
    run[action]()
  }

  // 경계선 끌기: 마우스 위치 → 그 분할의 비율
  function dragGutter(e, groupId, g) {
    if (e.button !== 0) return
    e.preventDefault()
    startWindowDrag((ev) => {
      const r = areaRef.current.getBoundingClientRect()
      const pos = g.dir === 'row' ? (ev.clientX - r.left) / r.width : (ev.clientY - r.top) / r.height
      const start = g.dir === 'row' ? g.area.x : g.area.y
      const size = g.dir === 'row' ? g.area.w : g.area.h
      useTermStore.getState().setRatio(groupId, g.path, (pos - start) / size)
    })
  }

  const rectsOf = new Map(groups.map(g => [g.id, paneRects(g.layout)]))
  const shownIds = activeGroup ? leaves(activeGroup.layout) : []
  // 칸 위에 뜨는 것(메모장·스크립트 상자)은 그 칸의 자리에
  const overPane = (id, key, child) => (
    <div key={key} className={styles.memoArea} style={rectStyle(rectsOf.get(activeGroup.id)[id])}>{child}</div>
  )

  return (
    <div className={styles.workspace} onKeyDown={onKeyDown} data-terminal-root>
      <TabBar onMenu={setMenu} webServer={webServer} />
      <div className={styles.panes}>
        <div className={styles.groupArea} ref={areaRef} data-group-area>
          {tabs.map(t => {
            const g = groups.find(x => leaves(x.layout).includes(t.id))
            return (
              <TerminalPane key={t.id} id={t.id} active={t.id === activeId} visible={!!g && g === activeGroup}
                rect={g ? rectsOf.get(g.id)[t.id] : undefined} createTerminal={createTerminal} addons={addons}
                onPasteRequest={setPasteRequest} />
            )
          })}
          {shownIds.filter(id => memos.includes(id)).map(id => overPane(id, `memo${id}`, <MemoPad id={id} />))}
          {shownIds.filter(id => scripts[id]?.box).map(id => overPane(id, `script${id}`, <ScriptBox id={id} />))}
          {activeGroup && gutters(activeGroup.layout).map(gt => (
            <div key={gt.path} data-gutter className={gt.dir === 'row' ? styles.gutterRow : styles.gutterCol}
              title="끌어서 크기 조절 · 더블클릭: 반반"
              style={gt.dir === 'row' ? { left: pct(gt.x), top: pct(gt.y), height: pct(gt.h) } : { left: pct(gt.x), top: pct(gt.y), width: pct(gt.w) }}
              onMouseDown={(e) => dragGutter(e, activeGroup.id, gt)}
              onDoubleClick={() => useTermStore.getState().setRatio(activeGroup.id, gt.path, 0.5)} />
          ))}
        </div>
        {tabs.length === 0 && (
          <div className={styles.empty}>
            <TerminalSquare size={28} />
            <span>새 탭을 열려면 + 또는 Ctrl+Shift+T</span>
          </div>
        )}
        {active?.dialog && <ConnectDialog key={active.id} tab={active} />}
        {filesView && <RemoteFiles key={activeId} id={activeId} />}
        {/* sz / rz: 파일 창이 없으면 칸 구석에 떠 있는 진행 상자 (Todo #124) */}
        {!filesView && xfer && xfer.tabId === activeId && <TransferProgress xfer={xfer} floating />}
        {searchOpen && active && <SearchBar tabId={active.id} onClose={() => setSearchOpen(false)} />}
      </div>
      <AuthPrompt describeTab={id => useTermStore.getState().tabs.find(t => t.id === id)?.tooltip ?? ''} />
      {menu && <TabMenu {...menu} onClose={() => setMenu(null)} />}
      {sessionManager && <SessionManager />}
      {saveRequest && <SaveSessionDialog request={saveRequest} />}
      {prefsOpen && <PrefsDialog />}
      {macrosOpen && <MacrosDialog />}
      {helpOpen && <TerminalHelp onClose={() => { setHelpOpen(false); sessionById(useTermStore.getState().activeId)?.focus() }} />}
      {panel?.kind === 'forwards' && <ForwardsDialog key={panel.id} id={panel.id} />}
      {panel?.kind === 'containers' && <ContainersDialog key={panel.id} id={panel.id} />}
      <PasteConfirm request={pasteRequest} onAnswer={ok => { if (ok) pasteRequest?.paste(); setPasteRequest(null) }} />
    </div>
  )
}
