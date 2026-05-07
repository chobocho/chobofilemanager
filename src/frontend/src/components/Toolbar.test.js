import { describe, it, expect } from 'vitest'
import { isPermanentDeleteShortcut, isTrashShortcut } from './Toolbar.jsx'

// ─── Todo #54: Shift+Delete = 영구 삭제 ─────────────────────────────────────

describe('isPermanentDeleteShortcut', () => {
  it('PD-01: Shift+Delete는 영구 삭제 단축키', () => {
    expect(isPermanentDeleteShortcut({ key: 'Delete', shiftKey: true })).toBe(true)
  })
  it('PD-02: 단독 Delete는 영구 삭제 아님', () => {
    expect(isPermanentDeleteShortcut({ key: 'Delete', shiftKey: false })).toBe(false)
  })
  it('PD-03: Shift+다른 키는 영구 삭제 아님', () => {
    expect(isPermanentDeleteShortcut({ key: 'Backspace', shiftKey: true })).toBe(false)
  })
  it('PD-04: 시프트 키 미정의 시 false', () => {
    expect(isPermanentDeleteShortcut({ key: 'Delete' })).toBe(false)
  })
})

// ─── Todo #57: F8 / 단독 Delete = 휴지통 ────────────────────────────────────

describe('isTrashShortcut', () => {
  it('TR-01: F8은 휴지통 단축키', () => {
    expect(isTrashShortcut({ key: 'F8' })).toBe(true)
  })
  it('TR-02: 단독 Delete는 휴지통 단축키', () => {
    expect(isTrashShortcut({ key: 'Delete', shiftKey: false })).toBe(true)
  })
  it('TR-03: Shift+Delete는 휴지통 아님 (영구 삭제로 분기)', () => {
    expect(isTrashShortcut({ key: 'Delete', shiftKey: true })).toBe(false)
  })
  it('TR-04: 다른 F키는 휴지통 아님', () => {
    expect(isTrashShortcut({ key: 'F7' })).toBe(false)
    expect(isTrashShortcut({ key: 'F9' })).toBe(false)
  })
})
