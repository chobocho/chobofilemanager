import React from 'react'
import { transferText, transferPercent } from '../core/remoteFiles'
import { useFilesStore } from '../store/filesStore'
import styles from '../styles/Terminal.module.css'

// 파일 전송 진행 (SFTP/SCP/FTP·Zmodem 공용, Todo #123·#124): 이름, 막대, 크기·속도, 취소.
// floating: 파일 창이 없을 때 칸 구석에 떠 있는 상자 (sz / rz)
export default function TransferProgress({ xfer, floating = false }) {
  return (
    <div className={`${styles.xfer} ${floating ? styles.xferFloat : ''}`} role="status" aria-label="파일 전송 진행">
      <span>{`${xfer.upload ? '⬆' : '⬇'} ${xfer.name}`}</span>
      <div className={styles.xferTrack} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={transferPercent(xfer)}>
        <div className={styles.xferBar} style={{ width: `${transferPercent(xfer)}%` }} />
      </div>
      <span className={styles.dim}>{transferText(xfer, xfer.secs)}</span>
      <button type="button" onClick={() => useFilesStore.getState().cancelTransfer()}>전송 취소</button>
    </div>
  )
}
