// Shift+F2 폴더 비교 (Todo #133-6, Total Commander "Compare directories"):
// 양쪽 패널 목록을 이름(대소문자 무시)으로 맞춰, 각 쪽에서 더 새 파일과 그쪽에만 있는 파일을 고름.
// 날짜가 같은데 크기가 다르면 양쪽 모두. 폴더는 보지 않음. 2초 이내 차이는 같은 시각(FAT).

const SLACK_MS = 2000

export function compareListings(leftFiles, rightFiles) {
  const byName = (files) => new Map(files.filter(f => !f.isDir).map(f => [f.name.toLowerCase(), f]))
  const L = byName(leftFiles), R = byName(rightFiles)
  const left = new Set(), right = new Set()
  for (const [name, l] of L) {
    const r = R.get(name)
    if (!r) { left.add(l.path); continue }
    const d = new Date(l.modified) - new Date(r.modified)
    if (d > SLACK_MS) left.add(l.path)
    else if (d < -SLACK_MS) right.add(r.path)
    else if (l.size !== r.size) { left.add(l.path); right.add(r.path) }
  }
  for (const [name, r] of R) if (!L.has(name)) right.add(r.path)
  return { left, right }
}
