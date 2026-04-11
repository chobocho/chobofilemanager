import React, { useEffect } from 'react'
import {
  FilePlus, Search, Globe, Monitor, Sun, Moon,
  Archive, PackageOpen
} from 'lucide-react'
import styles from '../styles/Toolbar.module.css'
import { useThemeStore } from '../stores/themeStore'

export default function Toolbar({
  view, onViewChange,
  onNewFile, onSearch, onCompress, onExtract,
  onRename, onCopy, onMove, onNewDir, onDelete, onView, onSwitchPanel,
}) {
  const theme       = useThemeStore(s => s.theme)
  const toggleTheme = useThemeStore(s => s.toggleTheme)

  // 키보드 단축키 (F키바와 동일하게 유지)
  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      switch(e.key) {
        case 'Tab': e.preventDefault(); onSwitchPanel?.(); break
        case 'F2': e.preventDefault(); onRename();         break
        case 'F3': e.preventDefault(); onView?.();         break
        case 'F5': e.preventDefault(); onCopy();           break
        case 'F6': e.preventDefault(); onMove();           break
        case 'F7': e.preventDefault(); onNewDir();         break
        case 'F8': e.preventDefault(); onDelete();         break
        case 'r':
        case 'R':
          if (e.ctrlKey) { e.preventDefault(); onRename(); }
          break
        default: break
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onRename, onView, onCopy, onMove, onNewDir, onDelete, onSwitchPanel])

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
