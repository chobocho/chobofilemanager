import React, { useEffect } from 'react'
import { Plus, Play, Zap } from 'lucide-react'
import { useButtonStore } from '../stores/buttonStore'
import styles from '../styles/ButtonBar.module.css'

// ─── 사용자 단추 막대 (Todo #133-12) — 클릭: 실행, 우클릭: 고치기, +: 새 단추 ─────────────────

export default function ButtonBar({ onRun, onEdit }) {
  const buttons = useButtonStore(s => s.buttons)
  useEffect(() => { useButtonStore.getState().load() }, [])

  return (
    <div className={styles.bar} role="toolbar" aria-label="사용자 단추">
      {buttons.map(b => (
        <button key={b.id} type="button" className={styles.btn}
          title={`${b.command}${b.params ? ' ' + b.params : ''}\n우클릭: 고치기`}
          onClick={() => onRun(b)}
          onContextMenu={(e) => { e.preventDefault(); onEdit(b) }}>
          {b.command.startsWith('@') ? <Zap size={11} /> : <Play size={11} />}
          <span>{b.name}</span>
        </button>
      ))}
      <button type="button" className={styles.add} title="단추 추가" onClick={() => onEdit(null)}>
        <Plus size={12} />{!buttons.length && <span>단추 추가</span>}
      </button>
    </div>
  )
}
