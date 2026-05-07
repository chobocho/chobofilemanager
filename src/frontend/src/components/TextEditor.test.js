import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { isStarlarkFile, buildCursorPosition, isStarlarkRunShortcut, isSwitchToViewerShortcut } from './TextEditor.jsx'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ─── isStarlarkFile ────────────────────────────────────────────────────────────

describe('isStarlarkFile', () => {
  it('TE-01: .star 파일은 Starlark 파일이다', () => {
    expect(isStarlarkFile('.star')).toBe(true)
  })

  it('TE-02: .bzl 파일은 Starlark 파일이다', () => {
    expect(isStarlarkFile('.bzl')).toBe(true)
  })

  it('TE-03: .STAR 대문자도 Starlark 파일이다', () => {
    expect(isStarlarkFile('.STAR')).toBe(true)
  })

  it('TE-04: .BZL 대문자도 Starlark 파일이다', () => {
    expect(isStarlarkFile('.BZL')).toBe(true)
  })

  it('TE-05: .py 파일은 Starlark 파일이 아니다', () => {
    expect(isStarlarkFile('.py')).toBe(false)
  })

  it('TE-06: .go 파일은 Starlark 파일이 아니다', () => {
    expect(isStarlarkFile('.go')).toBe(false)
  })

  it('TE-07: .txt 파일은 Starlark 파일이 아니다', () => {
    expect(isStarlarkFile('.txt')).toBe(false)
  })

  it('TE-08: 빈 확장자는 Starlark 파일이 아니다', () => {
    expect(isStarlarkFile('')).toBe(false)
  })
})

// ─── buildCursorPosition ──────────────────────────────────────────────────────

describe('buildCursorPosition', () => {
  it('CP-01: 빈 텍스트, selectionStart=0 → line 1, col 1', () => {
    expect(buildCursorPosition('', 0)).toEqual({ line: 1, col: 1 })
  })

  it('CP-02: 단일 줄 첫 번째 문자 위치 → line 1, col 1', () => {
    expect(buildCursorPosition('hello', 0)).toEqual({ line: 1, col: 1 })
  })

  it('CP-03: 단일 줄 끝 위치 → line 1, col = 길이+1', () => {
    expect(buildCursorPosition('hello', 5)).toEqual({ line: 1, col: 6 })
  })

  it('CP-04: 첫 번째 줄바꿈 바로 뒤 → line 2, col 1', () => {
    expect(buildCursorPosition('hello\nworld', 6)).toEqual({ line: 2, col: 1 })
  })

  it('CP-05: 두 번째 줄 중간 → line 2, col 3', () => {
    expect(buildCursorPosition('hello\nworld', 8)).toEqual({ line: 2, col: 3 })
  })

  it('CP-06: 세 번째 줄 시작 → line 3, col 1', () => {
    expect(buildCursorPosition('a\nb\nc', 4)).toEqual({ line: 3, col: 1 })
  })

  it('CP-07: 텍스트 맨 끝 → 마지막 줄, 마지막 col', () => {
    const text = 'line1\nline2\nline3'
    expect(buildCursorPosition(text, text.length)).toEqual({ line: 3, col: 6 })
  })

  it('CP-08: 첫 줄이 빈 줄 (\\n으로 시작) → line 1, col 1 후 다음 줄', () => {
    expect(buildCursorPosition('\nhello', 1)).toEqual({ line: 2, col: 1 })
  })
})

// ─── isStarlarkRunShortcut (Todo #50: F5 / Ctrl+Enter) ────────────────────────

describe('isStarlarkRunShortcut', () => {
  it('SR-01: F5는 실행 단축키', () => {
    expect(isStarlarkRunShortcut({ key: 'F5' })).toBe(true)
  })

  it('SR-02: Ctrl+Enter는 실행 단축키', () => {
    expect(isStarlarkRunShortcut({ key: 'Enter', ctrlKey: true })).toBe(true)
  })

  it('SR-03: Cmd+Enter (macOS)도 실행 단축키', () => {
    expect(isStarlarkRunShortcut({ key: 'Enter', metaKey: true })).toBe(true)
  })

  it('SR-04: Enter 단독은 실행 단축키 아님', () => {
    expect(isStarlarkRunShortcut({ key: 'Enter' })).toBe(false)
  })

  it('SR-05: Ctrl+S는 실행 단축키 아님', () => {
    expect(isStarlarkRunShortcut({ key: 's', ctrlKey: true })).toBe(false)
  })

  it('SR-06: F4는 실행 단축키 아님', () => {
    expect(isStarlarkRunShortcut({ key: 'F4' })).toBe(false)
  })
})

// ─── Todo #58: 모달 95% 크기 ──────────────────────────────────────────────────

describe('TextEditor 모달 크기 (Todo #58)', () => {
  const css = readFileSync(
    resolve(__dirname, '../styles/TextEditor.module.css'),
    'utf8'
  )
  const editorBlock = css.match(/\.editor\s*\{([^}]+)\}/)?.[1] ?? ''

  it('ES-01: .editor는 너비 95vw로 설정된다', () => {
    expect(editorBlock).toMatch(/width:\s*95vw/)
  })

  it('ES-02: .editor는 높이 95vh로 설정된다', () => {
    expect(editorBlock).toMatch(/height:\s*95vh/)
  })

  it('ES-03: .editor max-width는 95vw 이내로 제한된다', () => {
    expect(editorBlock).toMatch(/max-width:\s*95vw/)
  })

  it('ES-04: .editor max-height는 95vh 이내로 제한된다', () => {
    expect(editorBlock).toMatch(/max-height:\s*95vh/)
  })
})

// ─── Todo #59: F3 = 에디터 → 뷰어 전환 ─────────────────────────────────────────

describe('isSwitchToViewerShortcut (Todo #59)', () => {
  it('SV-01: F3는 뷰어 전환 단축키', () => {
    expect(isSwitchToViewerShortcut({ key: 'F3' })).toBe(true)
  })

  it('SV-02: F4는 뷰어 전환 아님', () => {
    expect(isSwitchToViewerShortcut({ key: 'F4' })).toBe(false)
  })

  it('SV-03: Ctrl+F3은 뷰어 전환 아님', () => {
    expect(isSwitchToViewerShortcut({ key: 'F3', ctrlKey: true })).toBe(false)
  })

  it('SV-04: Alt+F3은 뷰어 전환 아님', () => {
    expect(isSwitchToViewerShortcut({ key: 'F3', altKey: true })).toBe(false)
  })

  it('SV-05: Cmd+F3 (macOS)도 뷰어 전환 아님', () => {
    expect(isSwitchToViewerShortcut({ key: 'F3', metaKey: true })).toBe(false)
  })

  it('SV-06: Esc는 뷰어 전환 아님', () => {
    expect(isSwitchToViewerShortcut({ key: 'Escape' })).toBe(false)
  })
})
