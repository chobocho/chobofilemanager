import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { sessionById } from '../core/session'
import { tabMenuItems } from '../core/tabMenu'
import { THEMES, themeByName } from '../core/themes'
import { settings } from '../core/settings'
import { leaves } from '../core/layout'
import { useTermStore } from '../store/termStore'
import styles from '../styles/Terminal.module.css'

// 탭 우클릭 메뉴 (Todo #121, choboTerm tabmenu.ts). 색 테마는 하위 메뉴로 이 서버에만 저장됩니다.
export default function TabMenu({ id, x, y, onClose }) {
  const tab = useTermStore(s => s.tabs.find(t => t.id === id))
  const paneCount = useTermStore(s => leaves(s.groupOfPane(id)?.layout ?? { type: 'pane', id }).length)
  const [themeOpen, setThemeOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    ref.current?.focus()
    const close = () => onClose()
    window.addEventListener('mousedown', close)
    window.addEventListener('blur', close)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('blur', close)
    }
  }, [onClose])

  if (!tab) return null
  const s = sessionById(id)
  const items = tabMenuItems({ state: tab.state, proto: tab.proto, hasReq: !!s?.req, encoding: s?.encoding ?? 'UTF-8', log: !!tab.log }, paneCount)

  function run(act) {
    const st = useTermStore.getState()
    onClose()
    switch (act) {
      case 'reconnect': return st.reconnect(id)
      case 'duplicate': return st.duplicate(id)
      case 'splitRight': return st.splitPane(id, 'row')
      case 'splitDown': return st.splitPane(id, 'col')
      case 'encoding': return st.toggleEncoding(id)
      case 'break': return st.sendBreak(id)
      case 'log': return st.toggleLog(id)
      case 'logs': return st.showLogs(id)
      case 'saveSession': return st.saveTabSession(id)
      case 'disconnect': return st.disconnect(id)
      case 'close': return st.closeTab(id)
    }
  }

  const left = Math.min(x, window.innerWidth - 260)
  const top = Math.min(y, window.innerHeight - 40 - items.length * 26)
  return createPortal(
    <ul ref={ref} tabIndex={-1} role="menu" className={styles.menu} style={{ left, top }}
      onMouseDown={e => e.stopPropagation()}
      onKeyDown={e => { e.stopPropagation(); if (e.key === 'Escape') { e.preventDefault(); onClose() } }}>
      {items.filter(i => !i.hidden).map(i => (i.act === 'sep'
        ? <li key="sep" className={styles.menuSep} role="separator" />
        : (
          <li key={i.act} role="menuitem" aria-disabled={i.disabled || undefined} aria-label={i.label}
            className={`${styles.menuItem} ${i.disabled ? styles.menuDisabled : ''} ${i.submenu ? styles.menuSub : ''}`}
            onMouseEnter={() => setThemeOpen(i.act === 'theme')}
            onClick={() => { if (i.disabled) return; if (i.submenu) setThemeOpen(true); else run(i.act) }}>
            {i.label}
            {i.act === 'theme' && themeOpen && (
              <ul role="menu" className={`${styles.menu} ${styles.subMenu}`}>
                {[{ name: '', label: `기본값 (설정: ${themeByName(settings.theme).label})`, theme: themeByName(settings.theme).theme }, ...THEMES].map(th => (
                  <li key={th.name || 'default'} role="menuitem" aria-label={th.label}
                    className={`${styles.menuItem} ${(s?.theme ?? '') === th.name ? styles.menuChecked : ''}`}
                    onClick={(e) => { e.stopPropagation(); onClose(); useTermStore.getState().chooseTheme(id, th.name) }}>
                    <span className={styles.swatch} style={{ background: th.theme.background, color: th.theme.foreground }}>A</span>
                    {th.label}
                  </li>
                ))}
              </ul>
            )}
          </li>
        )))}
    </ul>,
    document.body,
  )
}
