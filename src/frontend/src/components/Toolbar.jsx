import React, { useEffect, useCallback } from 'react'
import {
  Copy, Scissors, Trash2, FolderPlus, FilePlus,
  Edit3, Search, Archive, Globe, Monitor
} from 'lucide-react'
import styles from '../styles/Toolbar.module.css'

const TOOL_BUTTONS = [
  { key: 'F3', label: 'View',    icon: null,       action: 'view' },
  { key: 'F4', label: 'Edit',    icon: Edit3,      action: 'edit' },
  { key: 'F5', label: 'Copy',    icon: Copy,       action: 'copy' },
  { key: 'F6', label: 'Move',    icon: Scissors,   action: 'move' },
  { key: 'F7', label: 'NewDir',  icon: FolderPlus, action: 'newdir' },
  { key: 'F8', label: 'Delete',  icon: Trash2,     action: 'delete' },
]

export default function Toolbar({
  view, onViewChange,
  onNewDir, onNewFile, onRename, onDelete,
  onSearch, onCopy, onMove
}) {

  const handleAction = useCallback((action) => {
    switch(action) {
      case 'copy':   onCopy();   break
      case 'move':   onMove();   break
      case 'newdir': onNewDir(); break
      case 'delete': onDelete(); break
      default: break
    }
  }, [onCopy, onMove, onNewDir, onDelete])

  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      switch(e.key) {
        case 'F5': e.preventDefault(); onCopy();   break
        case 'F6': e.preventDefault(); onMove();   break
        case 'F7': e.preventDefault(); onNewDir(); break
        case 'F8': e.preventDefault(); onDelete(); break
        default: break
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onCopy, onMove, onNewDir, onDelete])

  return (
    <div className={styles.toolbar}>
      {/* View switcher */}
      <div className={styles.viewSwitcher}>
        <button
          className={`${styles.viewBtn} ${view === 'files' ? styles.viewBtnActive : ''}`}
          onClick={() => onViewChange('files')}
          title="File Manager"
        >
          <Monitor size={13} />
          <span>Files</span>
        </button>
        <button
          className={`${styles.viewBtn} ${view === 'ftp' ? styles.viewBtnActive : ''}`}
          onClick={() => onViewChange('ftp')}
          title="FTP Manager"
        >
          <Globe size={13} />
          <span>FTP</span>
        </button>
      </div>

      <div className={styles.divider} />

      {/* Action buttons */}
      <div className={styles.actions}>
        <ToolButton fkey="F2" label="Rename" icon={Edit3}     onClick={onRename} />
        <ToolButton fkey="F5" label="Copy"   icon={Copy}      onClick={onCopy}   />
        <ToolButton fkey="F6" label="Move"   icon={Scissors}  onClick={onMove}   />
        <ToolButton fkey="F7" label="NewDir" icon={FolderPlus} onClick={onNewDir} />
        <ToolButton fkey="F8" label="Delete" icon={Trash2}    onClick={onDelete} danger />

        <div className={styles.divider} />

        <ToolButton fkey="" label="New File" icon={FilePlus} onClick={onNewFile} />
        <ToolButton fkey="" label="Search"   icon={Search}   onClick={onSearch} />
        <ToolButton fkey="" label="Zip"      icon={Archive}  onClick={() => {
          const { useFileStore: s } = require('../stores/fileStore')
        }} />
      </div>

      <div className={styles.spacer} />

      {/* FKey hint strip */}
      <div className={styles.fkeys}>
        {TOOL_BUTTONS.map(b => (
          <div key={b.key} className={styles.fkey} onClick={() => handleAction(b.action)}>
            <span className={styles.fkeyNum}>{b.key}</span>
            <span className={styles.fkeyLabel}>{b.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function ToolButton({ fkey, label, icon: Icon, onClick, danger }) {
  return (
    <button
      className={`${styles.toolBtn} ${danger ? styles.toolBtnDanger : ''}`}
      onClick={onClick}
      title={fkey ? `${label} (${fkey})` : label}
    >
      {Icon && <Icon size={13} />}
      <span>{label}</span>
      {fkey && <span className={styles.fkeyBadge}>{fkey}</span>}
    </button>
  )
}
