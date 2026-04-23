import { describe, it, expect } from 'vitest'
import { isStarlarkFile } from './TextEditor.jsx'

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
