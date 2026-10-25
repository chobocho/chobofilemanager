import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, cleanup, act, within } from '@testing-library/react'
import CloseGuard from './CloseGuard.jsx'
import { setTermBackend } from '../terminal/core/termApi'

// ─── Todo #124: 창 닫기 확인 — 터미널 보기를 열지 않아도(도크만 연결) 항상 응답 ───────

let api, handlers
beforeEach(() => {
  handlers = {}
  api = { Quit: vi.fn().mockResolvedValue(undefined), WebHideWindow: vi.fn().mockResolvedValue(undefined) }
  setTermBackend(api, { EventsOn: (n, fn) => { handlers[n] = fn; return () => delete handlers[n] } })
})
afterEach(() => { cleanup(); setTermBackend(null) })
const emit = (n, ...a) => act(() => handlers[n](...a))

describe('창 닫기 확인 (CG)', () => {
  it('CG-01: app:close → 확인, 취소면 그대로, 종료면 Quit', async () => {
    render(<CloseGuard />)
    emit('app:close')
    const dlg = screen.getByRole('dialog', { name: '종료' })
    expect(dlg.textContent).toContain('연결된 터미널이 있습니다')
    // 본문은 다른 확인 상자처럼 .message(진한 글자색) — 흐린 기본색으로 읽기 어렵지 않게
    expect(within(dlg).getByText(/연결된 터미널이 있습니다/).className).toMatch(/message/)
    fireEvent.click(within(dlg).getByRole('button', { name: '취소' }))
    expect(api.Quit).not.toHaveBeenCalled()
    emit('app:close')
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '모두 끊고 종료' })) })
    expect(api.Quit).toHaveBeenCalled()
    expect(screen.queryByRole('dialog', { name: '종료' })).toBeNull()
  })

  it('CG-02: app:closeWeb(브라우저 수) → 모두 종료 / 창만 닫기(웹 서버 유지) / 취소', async () => {
    render(<CloseGuard />)
    emit('app:closeWeb', 2)
    let dlg = screen.getByRole('dialog', { name: 'Chobocho Commander 끝내기' })
    expect(dlg.textContent).toContain('브라우저 2개가 웹 서버에 연결되어 있습니다')
    await act(async () => { fireEvent.click(within(dlg).getByRole('button', { name: '창만 닫기 (웹 서버 유지)' })) })
    expect(api.WebHideWindow).toHaveBeenCalled()
    emit('app:closeWeb', 1)
    dlg = screen.getByRole('dialog', { name: 'Chobocho Commander 끝내기' })
    await act(async () => { fireEvent.click(within(dlg).getByRole('button', { name: '모두 종료' })) })
    expect(api.Quit).toHaveBeenCalled()
  })

  it('CG-03: 창만 닫기가 실패하면 이유를 보여 줌', async () => {
    api.WebHideWindow.mockRejectedValueOnce(new Error('창이 없습니다'))
    render(<CloseGuard />)
    emit('app:closeWeb', 1)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '창만 닫기 (웹 서버 유지)' })) })
    expect(screen.getByRole('alert').textContent).toContain('창이 없습니다')
  })

  it('CG-04: Esc는 취소', () => {
    render(<CloseGuard />)
    emit('app:close')
    fireEvent.keyDown(screen.getByRole('dialog', { name: '종료' }), { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: '종료' })).toBeNull()
  })
})
