import React, { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { Plus, X, TerminalSquare, Star, Settings, Command } from 'lucide-react'
import { sessionById, allSessions } from '../core/session'
import { acquireTerminalEvents } from '../store/termEvents'
import { loadSettings } from '../core/settings'
import { loadRules } from '../core/highlight'
import { startI18n, resolveLang } from '../core/i18n'
import { termApi } from '../core/termApi'
import { settings } from '../core/settings'
import { isPaneMoveKey } from '../core/look'
import { workspaceAction } from '../core/workspaceKeys'
import { leaves, paneRects, gutters, ARROWS } from '../core/layout'
import { useTermStore } from '../store/termStore'
import TerminalPane from './TerminalPane.jsx'
import ConnectDialog from './ConnectDialog.jsx'
import AuthPrompt from './AuthPrompt.jsx'
import { PasteConfirm } from './TerminalModals.jsx'
import { checkUpdate } from '../core/update'
import { applySavedTranslucency } from '../core/look'
import { onTermEvent } from '../core/termApi'
import { copySelection, pasteClipboard } from '../core/clipboard'
import TerminalHelp from './TerminalHelp.jsx'
import { terminalTitle } from '../core/title'
import { installDebug } from '../core/debug'
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
import { useScriptStore } from '../store/scriptStore'
import { scriptBadge } from '../core/luaScript'
import { useFilesStore } from '../store/filesStore'
import { macroForKey } from '../core/macros'
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
  // 스크립트가 도는 동안 탭 배지의 시간이 흐름
  const [, tick] = useState(0)
  const anyRunning = Object.values(scripts).some(x => x.script)
  useEffect(() => {
    if (!anyRunning) return
    const t = setInterval(() => tick(n => n + 1), 1000)
    return () => clearInterval(t)
  }, [anyRunning])
  const filesView = useFilesStore(s => (activeId != null ? s.views[activeId] : undefined))
  const xfer = useFilesStore(s => s.xfer)
  const active = tabs.find(t => t.id === activeId)
  const activeGroup = groups.find(g => leaves(g.layout).includes(activeId))
  const [pasteRequest, setPasteRequest] = useState(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [menu, setMenu] = useState(null) // { id, x, y }
  const [helpOpen, setHelpOpen] = useState(false)
  const dragGroup = useRef(null) // 끌고 있는 탭(그룹) id
  const [webServer, setWebServer] = useState(null) // 웹 서버가 켜져 있으면 { clients }
  const areaRef = useRef(null)
  const catRef = useRef(null)

  // 창 제목: 보이는 동안 활성 탭의 연결, 숨기면 원래 제목 (Todo #124)
  const baseTitle = useRef(typeof document !== 'undefined' ? document.title : '')
  useEffect(() => {
    const set = (title) => { document.title = title; window.runtime?.WindowSetTitle?.(title) }
    if (!shown) { set(baseTitle.current); return }
    const s = sessionById(activeId)
    set(terminalTitle(baseTitle.current, active && s ? { state: active.state, proto: active.proto, encoding: s.encoding, req: s.req, docker: active.docker } : undefined))
  }, [shown, activeId, active?.state, active?.proto, active?.label])
  useEffect(() => () => { document.title = baseTitle.current }, [])

  // 고양이: 칸들의 아래쪽을 걸어 다님, 설정을 따름
  useEffect(() => {
    if (!cat) return
    let alive = true
    let handle
    import('../core/cat').then(({ mountCat }) => {
      if (!alive) return
      handle = mountCat({
        floor: () => areaRef.current,
        cursorTerm: (ae) => {
          const own = allSessions().find(s => ae && s.term.element?.contains(ae))
          return (own ?? sessionById(useTermStore.getState().activeId))?.term
        },
        focusActive: () => sessionById(useTermStore.getState().activeId)?.focus(),
      })
      catRef.current = handle
      loadSettings().then(() => { if (alive) handle.apply() })
    })
    return () => { alive = false; handle?.dispose(); catRef.current = null }
  }, [cat])

  useEffect(() => {
    const releaseEvents = acquireTerminalEvents() // 도크와 함께 씀: 마지막이 놓으면 끊김
    installDebug()
    loadSettings().then(async () => {
      loadRules()
      // 언어: 설정, 비면 Go가 정한 언어 (Todo #124)
      const go = await Promise.resolve(termApi.GetLanguage()).catch(() => '')
      startI18n(resolveLang(settings.language, go))
      applySavedTranslucency()
      if (settings.updateCheck) checkUpdate(false)
    })
    if (useTermStore.getState().tabs.length === 0) useTermStore.getState().newTab()
    const offWeb = onTermEvent('web:status', (running, clients) => setWebServer(running ? { clients } : null))
    return () => { releaseEvents(); offWeb() }
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
      <div className={styles.tabBar} role="tablist"
        onDoubleClick={(e) => { if (e.target === e.currentTarget) useTermStore.getState().newTab() }}>
        {groups.map(g => {
          const ids = leaves(g.layout)
          const current = g === activeGroup
          return (
            <div key={g.id} role="tab" aria-selected={current} draggable
              onDragStart={(e) => { dragGroup.current = g.id; if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move' }}
              onDragOver={(e) => { if (dragGroup.current != null && dragGroup.current !== g.id) e.preventDefault() }}
              onDrop={(e) => { e.preventDefault(); if (dragGroup.current != null) useTermStore.getState().moveGroup(dragGroup.current, g.id); dragGroup.current = null }}
              onDragEnd={() => { dragGroup.current = null }}
              className={`${styles.tab} ${current ? styles.tabActive : ''}`}
              onClick={() => { if (!current) useTermStore.getState().setActive(ids[0]) }}>
              {ids.map(id => {
                const t = tabs.find(x => x.id === id)
                if (!t) return null
                return (
                  <span key={id} title={(t.tooltip || t.label) + (t.log ? `\n로그 기록 중: ${t.log}` : '')} data-logging={t.log ? '' : undefined} data-busy={xfer?.tabId === id ? '' : undefined}
                    className={`${styles.paneChip} ${id === activeId ? styles.paneChipActive : ''} ${t.activity ? styles.tabActivity : ''}`}
                    onClick={(e) => { e.stopPropagation(); useTermStore.getState().setActive(id) }}
                    onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); useTermStore.getState().setActive(id); setMenu({ id, x: e.clientX, y: e.clientY }) }}
                    onAuxClick={(e) => { if (e.button === 1) { e.preventDefault(); e.stopPropagation(); useTermStore.getState().closeTab(id) } }}>
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
        {webServer && <span className={styles.webBadge} title="웹 서버가 켜져 있습니다 (설정 > 웹 서버)">{`🌐 웹 서버 · 브라우저 ${webServer.clients}개`}</span>}
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
