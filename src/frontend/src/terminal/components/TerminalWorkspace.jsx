import React, { useEffect } from 'react'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { Plus, X, TerminalSquare } from 'lucide-react'
import { startEventRouter } from '../core/session'
import { loadSettings } from '../core/settings'
import { isWorkspaceKey } from '../core/look'
import { useTermStore } from '../store/termStore'
import TerminalPane from './TerminalPane.jsx'
import ConnectDialog from './ConnectDialog.jsx'
import styles from '../styles/Terminal.module.css'

const defaultCreateTerminal = (opts) => new Terminal(opts)

// Terminal 보기 (Todo #120): 탭 막대 + 탭별 터미널 + 연결 대화상자.
// App이 처음 Terminal 보기를 열 때 지연 로딩하며, 다른 보기로 가도 세션이 유지되도록 마운트를 유지합니다.
export default function TerminalWorkspace({ createTerminal = defaultCreateTerminal, addons = true }) {
  const tabs = useTermStore(s => s.tabs)
  const activeId = useTermStore(s => s.activeId)
  const active = tabs.find(t => t.id === activeId)

  useEffect(() => {
    startEventRouter()
    loadSettings()
    if (useTermStore.getState().tabs.length === 0) useTermStore.getState().newTab()
  }, [])

  function onKeyDown(e) {
    if (!isWorkspaceKey(e)) return
    e.preventDefault()
    e.stopPropagation()
    const st = useTermStore.getState()
    const k = e.key.length === 1 ? e.key.toUpperCase() : e.key
    if (k === 'T') st.newTab()
    else if (k === 'W') { if (st.activeId != null) st.closeTab(st.activeId) }
    else if (k === 'Tab') st.cycle(e.shiftKey ? -1 : 1)
    else if (k === 'PageUp') st.cycle(-1)
    else if (k === 'PageDown') st.cycle(1)
  }

  return (
    <div className={styles.workspace} onKeyDown={onKeyDown} data-terminal-root>
      <div className={styles.tabBar} role="tablist">
        {tabs.map(t => (
          <div key={t.id} role="tab" aria-selected={t.id === activeId} title={t.tooltip || t.label}
            className={`${styles.tab} ${t.id === activeId ? styles.tabActive : ''} ${t.activity ? styles.tabActivity : ''}`}
            onClick={() => useTermStore.getState().setActive(t.id)}>
            <span className={`${styles.dot} ${t.state !== 'idle' ? styles.dotOn : ''}`} />
            <span data-tab-label>{t.label}</span>
            <button type="button" className={styles.tabClose} title="탭 닫기 (Ctrl+Shift+W)"
              onClick={(e) => { e.stopPropagation(); useTermStore.getState().closeTab(t.id) }}><X size={11} /></button>
          </div>
        ))}
        <button type="button" className={styles.newTab} title="새 탭 (Ctrl+Shift+T)" onClick={() => useTermStore.getState().newTab()}><Plus size={13} /></button>
      </div>
      <div className={styles.panes}>
        {tabs.map(t => <TerminalPane key={t.id} id={t.id} active={t.id === activeId} createTerminal={createTerminal} addons={addons} />)}
        {tabs.length === 0 && (
          <div className={styles.empty}>
            <TerminalSquare size={28} />
            <span>새 탭을 열려면 + 또는 Ctrl+Shift+T</span>
          </div>
        )}
        {active?.dialog && <ConnectDialog key={active.id} tab={active} />}
      </div>
    </div>
  )
}
