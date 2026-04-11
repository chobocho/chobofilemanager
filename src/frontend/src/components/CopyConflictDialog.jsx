import React from 'react'
import { AlertTriangle, X, Copy, SkipForward, Edit3 } from 'lucide-react'
import styles from '../styles/Dialogs.module.css'
import localStyles from '../styles/CopyConflictDialog.module.css'

export default function CopyConflictDialog({ conflicts, sources, dest, onConfirm, onClose }) {
  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={styles.modal}
        style={{ width: 480 }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className={styles.header}>
          <AlertTriangle size={15} className={styles.dangerIcon} />
          <span>파일 복사 충돌</span>
          <button className={styles.closeBtn} onClick={onClose}><X size={13} /></button>
        </div>

        {/* Body */}
        <div className={styles.body}>
          <p className={styles.message}>
            대상 폴더에 이미 존재하는 파일이 <strong>{conflicts.length}개</strong> 있습니다.
            어떻게 처리할까요?
          </p>

          {/* Conflict file list */}
          <div className={styles.deleteList}>
            {conflicts.map((c, i) => (
              <div key={i} className={styles.deleteItem} title={c.destPath}>
                <span className={styles.deleteItemName}>{c.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer — action buttons */}
        <div className={localStyles.footer}>
          <button className={localStyles.btnOption} onClick={() => onConfirm('overwrite')}>
            <Copy size={13} />
            <span>덮어쓰기</span>
          </button>
          <button className={localStyles.btnOption} onClick={() => onConfirm('rename')}>
            <Edit3 size={13} />
            <span>이름 바꾸어 복사</span>
          </button>
          <button className={localStyles.btnOption} onClick={() => onConfirm('skip')}>
            <SkipForward size={13} />
            <span>건너뛰기</span>
          </button>
          <button className={styles.btnCancel} onClick={onClose}>취소</button>
        </div>
      </div>
    </div>
  )
}
