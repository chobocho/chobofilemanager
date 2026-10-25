import { describe, it, expect, vi, afterEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import Modal from './Modal.jsx'

// ─── Todo #126: 터미널 대화상자 틀 하나 ───────────────────────────────────────────

afterEach(() => cleanup())

describe('Modal (MO)', () => {
  it('MO-01: 이름·제목·✕, Esc와 ✕로 닫힘', () => {
    const onClose = vi.fn()
    render(<Modal label="설정" onClose={onClose}><input aria-label="x" /></Modal>)
    const dlg = screen.getByRole('dialog', { name: '설정' })
    expect(dlg.textContent).toContain('설정')
    fireEvent.keyDown(screen.getByLabelText('x'), { key: 'Escape' })
    fireEvent.click(screen.getByTitle('닫기 (Esc)'))
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('MO-02: 키는 바깥으로 새지 않음', () => {
    const outer = vi.fn()
    render(<div onKeyDown={outer}><Modal label="m" onClose={() => {}}><input aria-label="x" /></Modal></div>)
    fireEvent.keyDown(screen.getByLabelText('x'), { key: 'T', ctrlKey: true, shiftKey: true })
    expect(outer).not.toHaveBeenCalled()
  })

  it('MO-03: 대화상자 자신이 Esc를 쓰면(preventDefault) 닫지 않음 — 안쪽 메뉴부터 닫기 등', () => {
    const onClose = vi.fn()
    const own = vi.fn(e => { if (e.key === 'Escape') e.preventDefault() })
    render(<Modal label="m" onClose={onClose} onKeyDown={own}><input aria-label="x" /></Modal>)
    fireEvent.keyDown(screen.getByLabelText('x'), { key: 'Escape' })
    expect(own).toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('MO-04: 제목 줄에 버튼 더 넣기, 다른 role', () => {
    render(<Modal label="a" title="A (F1)" role="alertdialog" headerExtra={<button>English</button>} onClose={() => {}} />)
    expect(screen.getByRole('alertdialog', { name: 'a' }).textContent).toContain('A (F1)')
    expect(screen.getByRole('button', { name: 'English' })).toBeTruthy()
  })
})
