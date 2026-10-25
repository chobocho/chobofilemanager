import React, { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { Plus, X, TerminalSquare, Star, Settings, Command } from 'lucide-react'
import { startEventRouter } from '../core/session'
import { loadSettings } from '../core/settings'
import { loadRules } from '../core/highlight'
import { isWorkspaceKey, isPaneMoveKey } from '../core/look'
import { leaves, paneRects, gutters, splitKeyDir, ARROWS } from '../core/layout'
import { useTermStore } from '../store/termStore'
import TerminalPane from './TerminalPane.jsx'
import ConnectDialog from './ConnectDialog.jsx'
import AuthPrompt from './AuthPrompt.jsx'
import { CloseConfirm, PasteConfirm } from './TerminalModals.jsx'
import SearchBar from './SearchBar.jsx'
import TabMenu from './TabMenu.jsx'
import SessionManager from './SessionManager.jsx'
import SaveSessionDialog from './SaveSessionDialog.jsx'
import PrefsDialog from './PrefsDialog.jsx'
import MacrosDialog from './MacrosDialog.jsx'
import MemoPad from './MemoPad.jsx'
import RemoteFiles from './RemoteFiles.jsx'
import ForwardsDialog from './ForwardsDialog.jsx'
import ContainersDialog from './ContainersDialog.jsx'
import ScriptBox from './ScriptBox.jsx'
import { useScriptStore, startScriptEvents, stopScriptEvents } from '../store/scriptStore'
import { scriptBadge } from '../core/luaScript'
import { useFilesStore, startTransferEvents, stopTransferEvents } from '../store/filesStore'
import { macroForKey } from '../core/macros'
import styles from '../styles/Terminal.module.css'

const defaultCreateTerminal = (opts) => new Terminal(opts)

// Terminal 보기 (Todo #120, #121): 탭 막대(그룹) + 칸별 터미널 + 연결 대화상자.
// 모든 칸은 하나의 부모 아래에 평평하게 마운트하고 분할 트리로 계산한 위치에 배치합니다
// (분할할 때 칸을 다른 부모로 옮기면 React가 다시 만들어 화면 내용이 사라지므로).
export default function TerminalWorkspace({ createTerminal = defaultCreateTerminal, addons = true }) {
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
  // 스크립트가 도는 동안 탭 배지의 시간이 흐름
  const [, tick] = useState(0)
  const anyRunning = Object.values(scripts).some(x => x.script)
  useEffect(() => {
    if (!anyRunning) return
    const t = setInterval(() => tick(n => n + 1), 1000)
    return () => clearInterval(t)
  }, [anyRunning])
  const filesView = useFilesStore(s => (activeId != null ? s.views[activeId] : undefined))
  const active = tabs.find(t => t.id === activeId)
  const activeGroup = groups.find(g => leaves(g.layout).includes(activeId))
  const [pasteRequest, setPasteRequest] = useState(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [menu, setMenu] = useState(null) // { id, x, y }
  const areaRef = useRef(null)

  useEffect(() => {
    startEventRouter()
    startTransferEvents()
    startScriptEvents()
    loadSettings().then(loadRules)
    if (useTermStore.getState().tabs.length === 0) useTermStore.getState().newTab()
    return () => { stopTransferEvents(); stopScriptEvents() }
  }, [])

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
    if (!isWorkspaceKey(e)) return
    e.preventDefault()
    e.stopPropagation()
    const dir = splitKeyDir(e)
    const k = e.key.length === 1 ? e.key.toUpperCase() : e.key
    if (dir) { if (st.activeId != null) st.splitPane(st.activeId, dir) }
    else if (k === 'S') setSearchOpen(true)
    else if (k === 'T') st.newTab()
    else if (k === 'H') st.openSessionManager()
    else if (k === 'O') st.openPrefs()
    else if (k === 'M') st.openMacros()
    else if (k === 'B') st.toggleMemo(st.activeId)
    else if (k === 'F') { if (st.activeId != null) st.openFiles(st.activeId) }
    else if (k === 'P') { if (st.activeId != null) st.openPanel('forwards', st.activeId) }
    else if (k === 'J') { if (st.activeId != null) st.openPanel('containers', st.activeId) }
    else if (k === 'K') { if (st.activeId != null) useScriptStore.getState().toggleConsole(st.activeId) }
    else if (k === 'L') { if (st.activeId != null) st.toggleLog(st.activeId) }
    else if (k === 'W') { if (st.activeId != null) st.closeTab(st.activeId) }
    else if (k === 'Tab') st.cycle(e.shiftKey ? -1 : 1)
    else if (k === 'PageUp') st.cycle(-1)
    else if (k === 'PageDown') st.cycle(1)
  }

  // 경계선 끌기: 마우스 위치 → 그 분할의 비율
  function dragGutter(e, groupId, g) {
    if (e.button !== 0) return
    e.preventDefault()
    const move = (ev) => {
      const r = areaRef.current.getBoundingClientRect()
      const pos = g.dir === 'row' ? (ev.clientX - r.left) / r.width : (ev.clientY - r.top) / r.height
      const start = g.dir === 'row' ? g.area.x : g.area.y
      const size = g.dir === 'row' ? g.area.w : g.area.h
      useTermStore.getState().setRatio(groupId, g.path, (pos - start) / size)
    }
    const up = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  const rectsOf = new Map(groups.map(g => [g.id, paneRects(g.layout)]))
  const pct = (v) => `${Math.round(v * 10000) / 100}%`

  return (
    <div className={styles.workspace} onKeyDown={onKeyDown} data-terminal-root>
      <div className={styles.tabBar} role="tablist">
        {groups.map(g => {
          const ids = leaves(g.layout)
          const current = g === activeGroup
          return (
            <div key={g.id} role="tab" aria-selected={current}
              className={`${styles.tab} ${current ? styles.tabActive : ''}`}
              onClick={() => { if (!current) useTermStore.getState().setActive(ids[0]) }}>
              {ids.map(id => {
                const t = tabs.find(x => x.id === id)
                if (!t) return null
                return (
                  <span key={id} title={(t.tooltip || t.label) + (t.log ? `\n로그 기록 중: ${t.log}` : '')} data-logging={t.log ? '' : undefined}
                    className={`${styles.paneChip} ${id === activeId ? styles.paneChipActive : ''} ${t.activity ? styles.tabActivity : ''}`}
                    onClick={(e) => { e.stopPropagation(); useTermStore.getState().setActive(id) }}
                    onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); useTermStore.getState().setActive(id); setMenu({ id, x: e.clientX, y: e.clientY }) }}>
                    <span className={`${styles.dot} ${t.state !== 'idle' ? styles.dotOn : ''}`} />
                    <span data-tab-label>{t.label}</span>
                    {(() => {
                      const b = scriptBadge(scripts[id]?.script, scripts[id]?.box?.busy, Date.now())
                      return b && <span className={styles.runBadge} title={b.title}>{b.text}</span>
                    })()}
                    <button type="button" className={styles.tabClose} title="탭 닫기 (Ctrl+Shift+W)"
                      onClick={(e) => { e.stopPropagation(); useTermStore.getState().closeTab(id) }}><X size={11} /></button>
                  </span>
                )
              })}
            </div>
          )
        })}
        <button type="button" className={styles.newTab} title="새 탭 (Ctrl+Shift+T)" onClick={() => useTermStore.getState().newTab()}><Plus size={13} /></button>
        <button type="button" className={styles.newTab} title="세션 관리 (Ctrl+Shift+H)" onClick={() => useTermStore.getState().openSessionManager()}><Star size={13} /></button>
        <button type="button" className={styles.newTab} title="설정 (Ctrl+Shift+O)" onClick={() => useTermStore.getState().openPrefs()}><Settings size={13} /></button>
        <button type="button" className={styles.newTab} title="매크로 (Ctrl+Shift+M)" onClick={() => useTermStore.getState().openMacros()}><Command size={13} /></button>
      </div>
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
          {activeGroup && memos.filter(id => leaves(activeGroup.layout).includes(id)).map(id => {
            const r = rectsOf.get(activeGroup.id)[id]
            return (
              <div key={`memo${id}`} className={styles.memoArea} style={{ left: pct(r.x), top: pct(r.y), width: pct(r.w), height: pct(r.h) }}>
                <MemoPad id={id} />
              </div>
            )
          })}
          {activeGroup && leaves(activeGroup.layout).filter(id => scripts[id]?.box).map(id => {
            const r = rectsOf.get(activeGroup.id)[id]
            return (
              <div key={`script${id}`} className={styles.memoArea} style={{ left: pct(r.x), top: pct(r.y), width: pct(r.w), height: pct(r.h) }}>
                <ScriptBox id={id} />
              </div>
            )
          })}
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
        {searchOpen && active && <SearchBar tabId={active.id} onClose={() => setSearchOpen(false)} />}
      </div>
      <AuthPrompt describeTab={id => useTermStore.getState().tabs.find(t => t.id === id)?.tooltip ?? ''} />
      <CloseConfirm />
      {menu && <TabMenu {...menu} onClose={() => setMenu(null)} />}
      {sessionManager && <SessionManager />}
      {saveRequest && <SaveSessionDialog request={saveRequest} />}
      {prefsOpen && <PrefsDialog />}
      {macrosOpen && <MacrosDialog />}
      {panel?.kind === 'forwards' && <ForwardsDialog key={panel.id} id={panel.id} />}
      {panel?.kind === 'containers' && <ContainersDialog key={panel.id} id={panel.id} />}
      <PasteConfirm request={pasteRequest} onAnswer={ok => { if (ok) pasteRequest?.paste(); setPasteRequest(null) }} />
    </div>
  )
}
