import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { isTextFile, isImageFile, isViewableFile, formatSize, formatDate, TEXT_EXTS, MAX_VIEWER_FILE_SIZE, exceedsViewerLimit } from './fileTypes.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(resolve(__dirname, p), 'utf8')

// ─── Todo #102: 파일 종류/포맷 공통 모듈 ──────────────────────────────────────
describe('fileTypes (Todo #102)', () => {
  it('FT102-01: 텍스트/이미지 판별 (대소문자 무시)', () => {
    expect(isTextFile('.STAR')).toBe(true)
    expect(isTextFile('.csv')).toBe(true)
    expect(isTextFile('.bat')).toBe(true)
    expect(isImageFile('.PNG')).toBe(true)
    expect(isViewableFile('.png')).toBe(true)
    expect(isViewableFile('.exe')).toBe(false)
    expect(isTextFile(undefined)).toBe(false)
  })

  it('FT102-02: formatSize', () => {
    expect(formatSize(0, true)).toBe('<DIR>')
    expect(formatSize(0, false)).toBe('0 B')
    expect(formatSize(1536, false)).toBe('1.5 KB')
    expect(formatSize(5 * 1024 ** 5, false)).toBe('5120.0 TB')
  })

  it('FT102-03: formatDate', () => {
    expect(formatDate('')).toBe('')
    expect(formatDate('not a date')).toBe('')
    expect(formatDate('2026-01-02T03:04:00')).toBe('2026-01-02 03:04')
  })

  it('FT102-04: 컴포넌트가 확장자 목록/포맷 함수를 자체 정의하지 않음 (중복 방지)', () => {
    for (const f of ['../components/FilePanel.jsx', '../components/FTPManager.jsx', '../components/ConfirmDialog.jsx', '../components/FileViewer.jsx']) {
      const src = read(f)
      expect(src, f).not.toMatch(/const textExts\s*=|const TEXT_EXTS\s*=|export const VIEWABLE_EXTS\s*=\s*new Set/)
      expect(src, f).not.toMatch(/^function formatSize\(/m)
    }
  })

  it('FT102-05: 더블클릭/Enter/검색 결과가 같은 텍스트 목록 사용 (.csv, .bat 포함)', () => {
    expect(TEXT_EXTS.has('.csv') && TEXT_EXTS.has('.bat') && TEXT_EXTS.has('.star')).toBe(true)
  })
})

describe('버전 표시 (Todo #102)', () => {
  it('VER-01: 도움말 제목이 package.json 버전을 사용', () => {
    const src = read('../components/HelpDialog.jsx')
    expect(src).toMatch(/Chobocho Commander V\{pkg\.version\}/)
    const pkg = JSON.parse(read('../../package.json'))
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+$/)
  })
})

// ─── Todo #114: 내장 뷰어/에디터 파일 크기 제한 32MB ─────────────────────────
describe('뷰어 크기 제한 (Todo #114)', () => {
  it('LIM-01: 제한은 32MB', () => {
    expect(MAX_VIEWER_FILE_SIZE).toBe(32 * 1024 * 1024)
  })
  it('LIM-02: 경계값 — 32MB 이하는 열림, 초과는 거부', () => {
    expect(exceedsViewerLimit(10 * 1024 * 1024 + 1)).toBe(false) // 예전 10MB 제한은 해제
    expect(exceedsViewerLimit(32 * 1024 * 1024)).toBe(false)
    expect(exceedsViewerLimit(32 * 1024 * 1024 + 1)).toBe(true)
    expect(exceedsViewerLimit(0)).toBe(false)
    expect(exceedsViewerLimit(undefined)).toBe(false)
  })
})
