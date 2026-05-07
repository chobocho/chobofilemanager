import { describe, it, expect } from 'vitest'
import { nextConfirmFocusIndex } from './ConfirmDialog.jsx'

// ─── Todo #60, #61: ConfirmDialog 좌우 커서 네비게이션 ─────────────────────────

describe('nextConfirmFocusIndex (Todo #60, #61)', () => {
  it('CD-01: 기본 Confirm(1)에서 ArrowLeft → Cancel(0)', () => {
    expect(nextConfirmFocusIndex(1, 'ArrowLeft', false)).toBe(0)
  })

  it('CD-02: Cancel(0)에서 ArrowRight → Confirm(1)', () => {
    expect(nextConfirmFocusIndex(0, 'ArrowRight', false)).toBe(1)
  })

  it('CD-03: Cancel(0)에서 ArrowLeft → 그대로 Cancel(0) (좌측 끝 클램프)', () => {
    expect(nextConfirmFocusIndex(0, 'ArrowLeft', false)).toBe(0)
  })

  it('CD-04: Confirm(1)에서 ArrowRight → 그대로 Confirm(1) (우측 끝 클램프)', () => {
    expect(nextConfirmFocusIndex(1, 'ArrowRight', false)).toBe(1)
  })

  it('CD-05: hideCancel일 때는 ArrowLeft도 Confirm(1)에 머무름', () => {
    expect(nextConfirmFocusIndex(1, 'ArrowLeft', true)).toBe(1)
  })

  it('CD-06: hideCancel일 때 ArrowRight도 Confirm(1)', () => {
    expect(nextConfirmFocusIndex(1, 'ArrowRight', true)).toBe(1)
  })

  it('CD-07: 화살표 외 키는 인덱스 유지', () => {
    expect(nextConfirmFocusIndex(1, 'Enter', false)).toBe(1)
    expect(nextConfirmFocusIndex(0, 'Tab', false)).toBe(0)
  })
})
