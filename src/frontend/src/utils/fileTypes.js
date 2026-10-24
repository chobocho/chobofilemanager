// 파일 종류 판별 / 표시 형식 공통 모듈 (Todo #102 — 진입점마다 달랐던 확장자 목록·포맷 함수 통일)

// 내장 뷰어/에디터로 여는 텍스트 확장자
export const TEXT_EXTS = new Set([
  '.txt', '.md', '.js', '.jsx', '.ts', '.tsx',
  '.go', '.py', '.rs', '.c', '.cpp', '.h',
  '.html', '.css', '.json', '.xml', '.yaml', '.yml',
  '.sh', '.bat', '.log', '.ini', '.cfg', '.conf', '.env',
  '.csv', '.sql', '.toml', '.gitignore', '.dockerfile',
  '.star', '.bzl',
])

// 이미지 확장자 (Todo #52). F3 뷰어에서 base64 data URL로 표시.
export const IMAGE_EXTS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg', '.ico',
])

// 내장 뷰어/에디터로 여는 최대 파일 크기 (Todo #114 — CodeMirror 전환 후 10MB → 32MB).
// 백엔드 maxViewerFileSize(filemanager.go)와 같아야 하며 limit_sync_test.go가 검사합니다.
export const MAX_VIEWER_FILE_SIZE = 32 * 1024 * 1024

export function exceedsViewerLimit(size) {
  return (size || 0) > MAX_VIEWER_FILE_SIZE
}

export function isTextFile(ext) {
  return TEXT_EXTS.has((ext || '').toLowerCase())
}

export function isImageFile(ext) {
  return IMAGE_EXTS.has((ext || '').toLowerCase())
}

export function isViewableFile(ext) {
  return isTextFile(ext) || isImageFile(ext)
}

export function formatSize(bytes, isDir) {
  if (isDir) return '<DIR>'
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(units.length - 1, Math.floor(Math.log(Math.max(bytes, 1)) / Math.log(1024)))
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`
}

export function formatDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (isNaN(d)) return ''
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
