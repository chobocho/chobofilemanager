import React, { useEffect } from 'react'
import {
  FilePlus, Search, Globe, Monitor, Sun, Moon,
  Archive, PackageOpen
} from 'lucide-react'
import styles from '../styles/Toolbar.module.css'
import { useThemeStore } from '../stores/themeStore'

// Todo #54: 영구 삭제는 Shift+Delete만 허용 (단독 Delete는 트래시 — Todo #57)
export function isPermanentDeleteShortcut(e) {
  return e.key === 'Delete' && e.shiftKey === true
}

// Todo #57: F8 또는 단독 Delete = 휴지통으로 이동 (단, Shift 동반은 영구 삭제로 분기)
export function isTrashShortcut(e) {
  if (e.key === 'F8') return true
  if (e.key === 'Delete' && !e.shiftKey) return true
  return false
}

export default function Toolbar({
  view, onViewChange,
  onNewFile, onSearch, onCompress, onExtract,
  onRename, onCopy, onMove, onNewDir, onDelete, onTrash, onView, onEdit, onSwitchPanel, onBookmarks, onHelp,
}) {
  const theme       = useThemeStore(s => s.theme)
  const toggleTheme = useThemeStore(s => s.toggleTheme)

  // 키보드 단축키 (F키바와 동일하게 유지)
  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      // Todo #54: Shift+Delete = 영구 삭제. 일반 Delete + F8 = 휴지통(Todo #57)
      if (isPermanentDeleteShortcut(e)) {
        e.preventDefault()
        onDelete?.()
        return
      }
      if (isTrashShortcut(e)) {
        e.preventDefault()
        ;(onTrash ?? onDelete)?.()
        return
      }
      switch(e.key) {
        case 'F1': e.preventDefault(); onHelp?.();         break
        case 'Tab':
          e.preventDefault()
          if (!e.ctrlKey) onSwitchPanel?.()
          break
        case 'F2': e.preventDefault(); onRename();         break
        case 'F3': e.preventDefault(); onView?.();         break
        case 'F4': e.preventDefault(); onEdit?.();         break
        case 'F5': e.preventDefault(); onCopy();           break
        case 'F6': e.preventDefault(); onMove();           break
        case 'F7': e.preventDefault(); onNewDir();         break
        case 'f':
        case 'F':
          if (e.ctrlKey) { e.preventDefault(); onSearch?.(); }
          break
        case 'n':
        case 'N':
          if (e.ctrlKey) { e.preventDefault(); onNewFile?.(); }
          break
        case 'd':
        case 'D':
          if (e.ctrlKey) { e.preventDefault(); onBookmarks?.(); }
          break
        // Ctrl+R 는 FilePanel 에서 새로고침(refresh)으로 처리 — 여기서는 무시
        default: break
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onHelp, onSearch, onRename, onView, onEdit, onCopy, onMove, onNewDir, onDelete, onTrash, onSwitchPanel, onNewFile, onBookmarks])

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

      {/* 상단 전용 버튼 (하단 F키바와 겹치지 않는 기능만) */}
      <div className={styles.actions}>
        <ToolButton label="New File"  icon={FilePlus}    onClick={onNewFile}  />
        <ToolButton label="Search"    icon={Search}      onClick={onSearch}   />

        <div className={styles.divider} />

        <ToolButton label="압축하기"  icon={Archive}     onClick={onCompress} />
        <ToolButton label="압축 풀기" icon={PackageOpen} onClick={onExtract}  />
      </div>

      <div className={styles.spacer} />

      {/* 테마 전환 버튼 */}
      <button
        className={styles.themeBtn}
        onClick={toggleTheme}
        title={theme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
        aria-label="Toggle theme"
      >
        {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
      </button>
    </div>
  )
}

function ToolButton({ label, icon: Icon, onClick }) {
  return (
    <button
      className={styles.toolBtn}
      onClick={onClick}
      title={label}
    >
      {Icon && <Icon size={13} />}
      <span>{label}</span>
    </button>
  )
}
