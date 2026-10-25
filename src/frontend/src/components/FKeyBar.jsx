import React from 'react'
import { Quit } from '../../wailsjs/runtime/runtime'
import styles from '../styles/FKeyBar.module.css'

// fileView: 파일 보기일 때만 파일 패널에 작용하는 버튼을 켬 (FTP·Terminal 보기에서는 Help·Quit만, Todo #126)
export default function FKeyBar({ onCopy, onMove, onNewDir, onDelete, onTrash, onRename, onHelp, onView, onEdit, onShell, onCmd, fileView = true }) {
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
    // Todo #57: F8 = 휴지통(onTrash). 옛 동작이 필요하면 onDelete fallback.
    { num: 'F8',     label: 'Trash',  action: onTrash ?? onDelete, active: !!(onTrash ?? onDelete), danger: true },
    // Todo #122: F9 = 하단 터미널 도크 (바깥 명령 창은 Shift+F9)
    { num: 'F9',     label: 'Term',   action: onCmd,    active: !!onCmd },
    { num: 'Ctrl+O',     label: 'Shell',  action: onShell,  active: !!onShell },
    { num: 'Alt+F4', label: 'Quit',   action: handleQuit, active: true },
  ].map(k => (fileView || k.num === 'F1' || k.num === 'Alt+F4' ? k : { ...k, active: false }))

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
