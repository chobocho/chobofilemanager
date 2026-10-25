import React from 'react'
import { AlertTriangle, X, Move, Edit3 } from 'lucide-react'
import styles from '../styles/Dialogs.module.css'
import localStyles from '../styles/CopyConflictDialog.module.css'
import { useBusyGuard } from '../utils/useBusyGuard'

export default function MoveConflictDialog({ conflicts, sources, dest, onConfirm, onClose }) {
  // 진행 중에는 다른 단추·취소·바깥 클릭을 막음 (Todo #130-3)
  const [busy, guard] = useBusyGuard()
  const pick = guard((mode) => onConfirm(mode))
  const close = () => { if (!busy) onClose() }
  return (
    <div className={styles.overlay} onClick={close}>
      <div
        className={styles.modal}
        style={{ width: 480 }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className={styles.header}>
          <AlertTriangle size={15} className={styles.dangerIcon} />
          <span>파일 이동 충돌</span>
          <button className={styles.closeBtn} disabled={busy} onClick={close}><X size={13} /></button>
        </div>

        {/* Body */}
        <div className={styles.body}>
          <p className={styles.message}>
            대상 폴더에 이미 존재하는 파일이 <strong>{conflicts.length}개</strong> 있습니다.
            어떻게 처리할까요?
          </p>

          <div className={styles.deleteList}>
            {conflicts.map((c, i) => (
              <div key={i} className={styles.deleteItem} title={c.destPath}>
                <span className={styles.deleteItemName}>{c.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className={localStyles.footer}>
          <button className={localStyles.btnOption} disabled={busy} onClick={() => pick('overwrite')}>
            <Move size={13} />
            <span>덮어쓰기</span>
          </button>
          <button className={localStyles.btnOption} disabled={busy} onClick={() => pick('rename')}>
            <Edit3 size={13} />
            <span>이름 바꾸어 이동</span>
          </button>
          <button className={styles.btnCancel} disabled={busy} onClick={close}>취소</button>
        </div>
      </div>
    </div>
  )
}
