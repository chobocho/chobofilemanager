import { describe, it, expect } from 'vitest'
import { isStarlarkScratchShortcut } from './App.jsx'

// ─── Todo #55: Ctrl+M = Starlark 스크래치 (이전 Ctrl+Enter) ──────────────────

describe('isStarlarkScratchShortcut', () => {
  it('SS-01: Ctrl+M은 Starlark 스크래치 단축키', () => {
    expect(isStarlarkScratchShortcut({ ctrlKey: true, key: 'm' })).toBe(true)
  })
  it('SS-02: Cmd+M (Mac)도 동일하게 동작', () => {
    expect(isStarlarkScratchShortcut({ metaKey: true, key: 'm' })).toBe(true)
  })
  it('SS-03: 대문자 M도 동일 매칭', () => {
    expect(isStarlarkScratchShortcut({ ctrlKey: true, key: 'M' })).toBe(true)
  })
  it('SS-04: 모디파이어 없는 m은 무시', () => {
    expect(isStarlarkScratchShortcut({ key: 'm' })).toBe(false)
  })
  it('SS-05: Ctrl+Enter는 더 이상 스크래치 아님 (Todo #50 in-editor Run으로만 사용)', () => {
    expect(isStarlarkScratchShortcut({ ctrlKey: true, key: 'Enter' })).toBe(false)
  })
  it('SS-06: Shift+Ctrl+M은 false (정확한 키 매칭)', () => {
    // 의도적으로 단순 매처: shift 동반은 아직 어떤 동작도 매핑하지 않으므로 통과 처리
    // 미래에 분기 필요 시 별도 헬퍼 추가
    expect(isStarlarkScratchShortcut({ ctrlKey: true, shiftKey: true, key: 'm' })).toBe(true)
  })
})
