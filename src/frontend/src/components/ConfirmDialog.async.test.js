import { describe, it, expect, vi, afterEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'

vi.mock('../wailsjs/runtime', () => ({ default: {} }))

import { ConfirmDialog } from './ConfirmDialog.jsx'

const h = React.createElement

// ─── Todo #96: 확인 동작 실패 시 대화상자 유지 ───────────────────────────────
describe('ConfirmDialog 비동기 확인 (Todo #96)', () => {
  afterEach(() => cleanup())

  it('CD-01: Confirm 클릭 시 onClose를 직접 호출하지 않음 (닫기는 onConfirm 측 결정)', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined)
    const onClose = vi.fn()
    render(h(ConfirmDialog, { title: 't', message: 'm', confirmLabel: 'OK', onConfirm, onClose }))
    await act(async () => { fireEvent.click(screen.getByText('OK')) })
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('CD-02: 처리 중에는 버튼 비활성화 → 중복 실행 방지', async () => {
    let resolve
    const onConfirm = vi.fn(() => new Promise(r => { resolve = r }))
    render(h(ConfirmDialog, { title: 't', message: 'm', confirmLabel: 'OK', onConfirm, onClose: vi.fn() }))
    const btn = screen.getByText('OK')
    await act(async () => { fireEvent.click(btn) })
    expect(btn.disabled).toBe(true)
    fireEvent.click(btn)
    expect(onConfirm).toHaveBeenCalledTimes(1)
    await act(async () => { resolve() })
    expect(btn.disabled).toBe(false)
  })

  it('CD-03: 실패 후 갱신된 오류 메시지가 같은 대화상자에 표시', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined)
    const { rerender } = render(h(ConfirmDialog, { title: 't', message: '삭제할까요?', confirmLabel: 'OK', onConfirm, onClose: vi.fn() }))
    await act(async () => { fireEvent.click(screen.getByText('OK')) })
    rerender(h(ConfirmDialog, { title: 't', message: '삭제 실패: denied', confirmLabel: 'OK', onConfirm, onClose: vi.fn() }))
    expect(screen.getByText('삭제 실패: denied')).toBeTruthy()
  })
})
