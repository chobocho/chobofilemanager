import React from 'react'
import { Copy, SkipForward, Edit3 } from 'lucide-react'
import ConflictDialog from './ConflictDialog.jsx'

const OPTIONS = [
  { mode: 'overwrite', label: '덮어쓰기', Icon: Copy },
  { mode: 'rename', label: '이름 바꾸어 복사', Icon: Edit3 },
  { mode: 'skip', label: '건너뛰기', Icon: SkipForward },
]

export default function CopyConflictDialog({ conflicts, onConfirm, onClose }) {
  return <ConflictDialog title="파일 복사 충돌" conflicts={conflicts} options={OPTIONS} onConfirm={onConfirm} onClose={onClose} />
}
