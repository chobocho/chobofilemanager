import React from 'react'
import { Quit } from '../../wailsjs/runtime/runtime'
import styles from '../styles/FKeyBar.module.css'

export default function FKeyBar({ onCopy, onMove, onNewDir, onDelete, onRename, onHelp, onView, onEdit }) {
  const handleQuit = () => {
    try { Quit() } catch { /* 브라우저 개발 환경에서는 무시 */ }
  }

  const keys = [
    { num: 'F1',     label: 'Help',   action: onHelp,   active: !!onHelp },
    { num: 'F2',     label: 'Rename', action: onRename, active: !!onRename },
    { num: 'F3',     label: 'View',   action: onView,   active: !!onView },
    { num: 'F4',     label: 'Edit',   action: onEdit,   active: !!onEdit },
    { num: 'F5',     label: 'Copy',   action: onCopy,   active: !!onCopy },
    { num: 'F6',     label: 'Move',   action: onMove,   active: !!onMove },
    { num: 'F7',     label: 'NewDir', action: onNewDir, active: !!onNewDir },
    { num: 'F8',     label: 'Delete', action: onDelete, active: !!onDelete, danger: true },
    { num: 'Alt+F4', label: 'Quit',   action: handleQuit, active: true },
  ]

  return (
    <div className={styles.fkeyBar}>
      {keys.map(({ num, label, action, active, danger }) => (
        <button
          key={num}
          className={`${styles.fkey} ${!active ? styles.fkeyDisabled : ''} ${danger ? styles.fkeyDanger : ''}`}
          onClick={active ? action : undefined}
          disabled={!active}
          title={active ? `${label} (${num})` : `${label} — not implemented`}
        >
          <span className={styles.fkeyNum}>{num}</span>
          <span className={styles.fkeyLabel}>{label}</span>
        </button>
      ))}
    </div>
  )
}
