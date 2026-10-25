import React, { useEffect, useRef, useState } from 'react'
import { Plus, X, Star, Settings, Command } from 'lucide-react'
import { leaves } from '../core/layout'
import { scriptBadge } from '../core/luaScript'
import { useTermStore } from '../store/termStore'
import { useScriptStore } from '../store/scriptStore'
import { useFilesStore } from '../store/filesStore'
import styles from '../styles/Terminal.module.css'

// Terminal 보기의 탭 막대 (Todo #126: TerminalWorkspace에서 나눔).
// 그룹마다 탭 하나, 분할된 그룹은 칸마다 칩. 끌어서 순서, 더블클릭 빈 곳 = 새 탭, 가운데 클릭 = 닫기, 우클릭 = 메뉴
export default function TabBar({ onMenu, webServer }) {
  const tabs = useTermStore(s => s.tabs)
  const groups = useTermStore(s => s.groups)
  const activeId = useTermStore(s => s.activeId)
  const scripts = useScriptStore(s => s.tabs)
  const xfer = useFilesStore(s => s.xfer)
  const dragGroup = useRef(null) // 끌고 있는 탭(그룹) id
  const st = () => useTermStore.getState()

  // 스크립트가 도는 동안 배지의 시간이 흐름
  const [, tick] = useState(0)
  const anyRunning = Object.values(scripts).some(x => x.script)
  useEffect(() => {
    if (!anyRunning) return
    const t = setInterval(() => tick(n => n + 1), 1000)
    return () => clearInterval(t)
  }, [anyRunning])

  const activeGroup = groups.find(g => leaves(g.layout).includes(activeId))
  return (
    <div className={styles.tabBar} role="tablist"
      onDoubleClick={(e) => { if (e.target === e.currentTarget) st().newTab() }}>
      {groups.map(g => {
        const ids = leaves(g.layout)
        const current = g === activeGroup
        return (
          <div key={g.id} role="tab" aria-selected={current} draggable
            onDragStart={(e) => { dragGroup.current = g.id; if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move' }}
            onDragOver={(e) => { if (dragGroup.current != null && dragGroup.current !== g.id) e.preventDefault() }}
            onDrop={(e) => { e.preventDefault(); if (dragGroup.current != null) st().moveGroup(dragGroup.current, g.id); dragGroup.current = null }}
            onDragEnd={() => { dragGroup.current = null }}
            className={`${styles.tab} ${current ? styles.tabActive : ''}`}
            onClick={() => { if (!current) st().setActive(ids[0]) }}>
            {ids.map(id => {
              const t = tabs.find(x => x.id === id)
              if (!t) return null
              const badge = scriptBadge(scripts[id]?.script, scripts[id]?.box?.busy, Date.now())
              return (
                <span key={id} title={(t.tooltip || t.label) + (t.log ? `\n로그 기록 중: ${t.log}` : '')}
                  data-logging={t.log ? '' : undefined} data-busy={xfer?.tabId === id ? '' : undefined}
                  className={`${styles.paneChip} ${id === activeId ? styles.paneChipActive : ''} ${t.activity ? styles.tabActivity : ''}`}
                  onClick={(e) => { e.stopPropagation(); st().setActive(id) }}
                  onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); st().setActive(id); onMenu({ id, x: e.clientX, y: e.clientY }) }}
                  onAuxClick={(e) => { if (e.button === 1) { e.preventDefault(); e.stopPropagation(); st().closeTab(id) } }}>
                  <span className={`${styles.dot} ${t.state !== 'idle' ? styles.dotOn : ''}`} />
                  <span data-tab-label>{t.label}</span>
                  {badge && <span className={styles.runBadge} title={badge.title}>{badge.text}</span>}
                  <button type="button" className={styles.tabClose} title="탭 닫기 (Ctrl+Shift+W)"
                    onClick={(e) => { e.stopPropagation(); st().closeTab(id) }}><X size={11} /></button>
                </span>
              )
            })}
          </div>
        )
      })}
      <button type="button" className={styles.newTab} title="새 탭 (Ctrl+Shift+T)" onClick={() => st().newTab()}><Plus size={13} /></button>
      <button type="button" className={styles.newTab} title="세션 관리 (Ctrl+Shift+H)" onClick={() => st().openSessionManager()}><Star size={13} /></button>
      <button type="button" className={styles.newTab} title="설정 (Ctrl+Shift+O)" onClick={() => st().openPrefs()}><Settings size={13} /></button>
      <button type="button" className={styles.newTab} title="매크로 (Ctrl+Shift+M)" onClick={() => st().openMacros()}><Command size={13} /></button>
      {webServer && <span className={styles.webBadge} title="웹 서버가 켜져 있습니다 (설정 > 웹 서버)">{`🌐 웹 서버 · 브라우저 ${webServer.clients}개`}</span>}
    </div>
  )
}
