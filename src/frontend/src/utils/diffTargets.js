// 파일 내용 비교(Ctrl+Shift+D, Todo #133-7)의 대상 두 파일 — Total Commander "Compare by content"와 같게:
// 활성 패널에서 파일 두 개를 골랐으면 그 둘, 아니면 커서 파일 + 반대 패널의 같은 이름 파일(없으면 반대 패널 커서 파일).
// 왼쪽 패널 파일이 diff의 왼쪽. 폴더나 대상이 없으면 null
import { getCursorFile } from '../stores/fileStore.js'

const visible = (p) => p.showHidden ? p.files : p.files.filter(f => !f.isHidden)

export function pickDiffTargets(state) {
  const active = state[state.activePanel]
  const otherSide = state.activePanel === 'left' ? 'right' : 'left'
  const other = state[otherSide]
  if (!active || !other) return null

  const picked = visible(active).filter(f => active.selected.has(f.path) && !f.isDir)
  if (picked.length === 2) return [picked[0].path, picked[1].path]

  const mine = getCursorFile(active)
  if (!mine || mine.isDir) return null
  const sameName = visible(other).find(f => !f.isDir && f.name.toLowerCase() === mine.name.toLowerCase())
  const theirs = sameName || getCursorFile(other)
  if (!theirs || theirs.isDir) return null
  return state.activePanel === 'left' ? [mine.path, theirs.path] : [theirs.path, mine.path]
}
