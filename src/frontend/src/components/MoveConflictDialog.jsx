import React from 'react'
import { Move, Edit3 } from 'lucide-react'
import ConflictDialog from './ConflictDialog.jsx'

const OPTIONS = [
  { mode: 'overwrite', label: '덮어쓰기', Icon: Move },
  { mode: 'rename', label: '이름 바꾸어 이동', Icon: Edit3 },
]

export default function MoveConflictDialog({ conflicts, onConfirm, onClose }) {
  return <ConflictDialog title="파일 이동 충돌" conflicts={conflicts} options={OPTIONS} onConfirm={onConfirm} onClose={onClose} />
}
