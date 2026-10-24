import { describe, it, expect, vi, afterEach } from 'vitest'
import React from 'react'
import { render, cleanup, fireEvent } from '@testing-library/react'
import Toolbar from './Toolbar.jsx'
import { isTerminalTarget } from '../utils/keyboard.js'

vi.mock('../wailsjs/runtime', () => ({ default: {} }))

const h = React.createElement

// ─── Todo #119: 키보드 소유권 — 포커스가 터미널 안이면 파일 관리자 단축키 양보 ───
// 터미널에서는 Tab·F키·Delete·Ctrl+문자가 모두 셸(vim, mc, htop 등)로 가야 함

function terminalTextarea() {
  const root = document.createElement('div')
  root.className = 'xterm'
  const ta = document.createElement('textarea')
  ta.className = 'xterm-helper-textarea'
  root.appendChild(ta)
  document.body.appendChild(root)
  return { root, ta }
}

function handlers() {
  return {
    onHelp: vi.fn(), onRename: vi.fn(), onView: vi.fn(), onEdit: vi.fn(), onCopy: vi.fn(), onMove: vi.fn(),
    onNewDir: vi.fn(), onDelete: vi.fn(), onTrash: vi.fn(), onSwitchPanel: vi.fn(), onSearch: vi.fn(),
    onNewFile: vi.fn(), onBookmarks: vi.fn(),
  }
}

const KEYS = [
  { key: 'F1' }, { key: 'F2' }, { key: 'F3' }, { key: 'F4' }, { key: 'F5' }, { key: 'F6' }, { key: 'F7' }, { key: 'F8' },
  { key: 'Delete' }, { key: 'Delete', shiftKey: true }, { key: 'Tab' },
  { key: 'n', ctrlKey: true }, { key: 'f', ctrlKey: true }, { key: 'd', ctrlKey: true },
]

describe('키보드 소유권 (KO)', () => {
  afterEach(() => { cleanup(); document.body.innerHTML = '' })

  it('KO-01: isTerminalTarget — 터미널 안의 요소만 true', () => {
    const { root, ta } = terminalTextarea()
    expect(isTerminalTarget(ta)).toBe(true)
    expect(isTerminalTarget(root)).toBe(true)
    const outside = document.createElement('input')
    document.body.appendChild(outside)
    expect(isTerminalTarget(outside)).toBe(false)
    expect(isTerminalTarget(null)).toBe(false)
    expect(isTerminalTarget(window)).toBe(false)
  })

  it('KO-02: 터미널에서 누른 F키·Tab·Delete·Ctrl+문자는 파일 관리자 단축키를 실행하지 않음', () => {
    const hs = handlers()
    render(h(Toolbar, { view: 'files', onViewChange: () => {}, ...hs }))
    const { root, ta } = terminalTextarea()
    // xterm의 입력용 textarea뿐 아니라 터미널 화면 요소(div)에서 온 키도 양보
    const screenEl = document.createElement('div')
    screenEl.tabIndex = 0
    root.appendChild(screenEl)
    for (const target of [ta, screenEl]) for (const ev of KEYS) fireEvent.keyDown(target, ev)
    for (const [name, fn] of Object.entries(hs)) expect(fn, name).not.toHaveBeenCalled()
  })

  it('KO-03: 터미널에서 누른 Tab은 기본 동작을 막지 않음 (셸 자동 완성)', () => {
    render(h(Toolbar, { view: 'files', onViewChange: () => {}, ...handlers() }))
    const { ta } = terminalTextarea()
    const ev = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    ta.dispatchEvent(ev)
    expect(ev.defaultPrevented).toBe(false)
  })

  it('KO-04: 터미널 밖에서는 기존 단축키 그대로', () => {
    const hs = handlers()
    render(h(Toolbar, { view: 'files', onViewChange: () => {}, ...hs }))
    fireEvent.keyDown(window, { key: 'F5' })
    fireEvent.keyDown(window, { key: 'Tab' })
    expect(hs.onCopy).toHaveBeenCalledTimes(1)
    expect(hs.onSwitchPanel).toHaveBeenCalledTimes(1)
  })
})
