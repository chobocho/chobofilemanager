import { describe, it, expect } from 'vitest'
import { isStarlarkScratchShortcut, isMultiRenameShortcut } from './App.jsx'

// ─── Starlark 스크래치 = Ctrl+Shift+M (Todo #133-4: Ctrl+M은 Total Commander처럼 여러 이름 바꾸기) ──

describe('isStarlarkScratchShortcut', () => {
  it('SS-01: Ctrl+Shift+M은 Starlark 스크래치 단축키', () => {
    expect(isStarlarkScratchShortcut({ ctrlKey: true, shiftKey: true, key: 'M' })).toBe(true)
  })
  it('SS-02: Cmd+Shift+M (Mac)도 동일하게 동작', () => {
    expect(isStarlarkScratchShortcut({ metaKey: true, shiftKey: true, key: 'M' })).toBe(true)
  })
  it('SS-03: 소문자 m도 동일 매칭', () => {
    expect(isStarlarkScratchShortcut({ ctrlKey: true, shiftKey: true, key: 'm' })).toBe(true)
  })
  it('SS-04: 모디파이어 없는 m은 무시', () => {
    expect(isStarlarkScratchShortcut({ key: 'm' })).toBe(false)
  })
  it('SS-05: Ctrl+Enter는 스크래치 아님 (Todo #50 in-editor Run으로만 사용)', () => {
    expect(isStarlarkScratchShortcut({ ctrlKey: true, key: 'Enter' })).toBe(false)
  })
  it('SS-06: Shift 없는 Ctrl+M은 스크래치가 아니라 여러 이름 바꾸기', () => {
    expect(isStarlarkScratchShortcut({ ctrlKey: true, key: 'm' })).toBe(false)
    expect(isMultiRenameShortcut({ ctrlKey: true, key: 'm' })).toBe(true)
    expect(isMultiRenameShortcut({ ctrlKey: true, shiftKey: true, key: 'M' })).toBe(false)
    expect(isMultiRenameShortcut({ ctrlKey: true, altKey: true, key: 'm' })).toBe(false)
  })
})
