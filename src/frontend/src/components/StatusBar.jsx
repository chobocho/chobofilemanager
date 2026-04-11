import React from 'react'
import { useFileStore } from '../stores/fileStore'
import styles from '../styles/StatusBar.module.css'

export default function StatusBar() {
  const status = useFileStore(s => s.status)
  const activePanel = useFileStore(s => s.activePanel)
  const panel = useFileStore(s => s[activePanel])

  const selectedCount = panel?.selected?.size || 0
  const totalFiles = panel?.files?.length || 0
  const path = panel?.path || ''

  return (
    <div className={styles.statusBar}>
      <div className={styles.left}>
        <span className={styles.path} title={path}>
          {path}
        </span>
      </div>

      <div className={styles.center}>
        {status && (
          <span className={styles.status}>{status}</span>
        )}
      </div>

      <div className={styles.right}>
        <span className={styles.stat}>
          {totalFiles} items
        </span>
        {selectedCount > 0 && (
          <span className={styles.statSelected}>
            {selectedCount} selected
          </span>
        )}
        <span className={styles.panel}>
          Panel: <span className={styles.panelName}>{activePanel.toUpperCase()}</span>
        </span>
      </div>
    </div>
  )
}
