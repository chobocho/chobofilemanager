import { describe, it, expect } from 'vitest'
import { isStarlarkFile, buildCursorPosition } from './TextEditor.jsx'

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
