import { describe, it, expect, vi, afterEach } from 'vitest'
import React from 'react'
import { render, fireEvent, cleanup } from '@testing-library/react'
import Toolbar from './Toolbar.jsx'
import FilePanel from './FilePanel.jsx'
import { useFileStore } from '../stores/fileStore'

vi.mock('../wailsjs/runtime', () => ({ default: {} }))

const h = React.createElement

// jsdom에는 scrollIntoView가 없음
Element.prototype.scrollIntoView = vi.fn()

function handlers() {
  return {
    onHelp: vi.fn(), onRename: vi.fn(), onView: vi.fn(), onEdit: vi.fn(),
    onCopy: vi.fn(), onMove: vi.fn(), onNewDir: vi.fn(), onDelete: vi.fn(),
    onTrash: vi.fn(), onSwitchPanel: vi.fn(), onSearch: vi.fn(),
    onNewFile: vi.fn(), onBookmarks: vi.fn(),
  }
}

// ─── Todo #77: 모달/뷰어/FTP 화면에서 파일 단축키 차단 ────────────────────────

describe('Toolbar 단축키 소유권 (Todo #77)', () => {
  afterEach(() => cleanup())

  it('KB-01: 평상시(files 뷰, 오버레이 없음) F5/F8/Tab 동작', () => {
    const hs = handlers()
    render(h(Toolbar, { view: 'files', onViewChange: () => {}, ...hs }))
    fireEvent.keyDown(window, { key: 'F5' })
    fireEvent.keyDown(window, { key: 'F8' })
    fireEvent.keyDown(window, { key: 'Tab' })
    expect(hs.onCopy).toHaveBeenCalledTimes(1)
    expect(hs.onTrash).toHaveBeenCalledTimes(1)
    expect(hs.onSwitchPanel).toHaveBeenCalledTimes(1)
  })

  it('KB-02: 오버레이가 열려 있으면 F5/F6/F8/Delete/Shift+Del/Tab 무시', () => {
    const hs = handlers()
    render(h(Toolbar, { view: 'files', onViewChange: () => {}, shortcutsDisabled: true, ...hs }))
    for (const ev of [{ key: 'F5' }, { key: 'F6' }, { key: 'F8' }, { key: 'Delete' },
                      { key: 'Delete', shiftKey: true }, { key: 'Tab' }, { key: 'F2' }, { key: 'F7' }]) {
      fireEvent.keyDown(window, ev)
    }
    for (const fn of Object.values(hs)) expect(fn).not.toHaveBeenCalled()
  })

  it('KB-03: 오버레이 중에는 Tab 기본 동작(포커스 이동)을 막지 않음', () => {
    render(h(Toolbar, { view: 'files', onViewChange: () => {}, shortcutsDisabled: true, ...handlers() }))
    const ev = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    window.dispatchEvent(ev)
    expect(ev.defaultPrevented).toBe(false)
  })

  it('KB-04: FTP 뷰에서는 로컬 파일 단축키 무시, F1 도움말만 허용', () => {
    const hs = handlers()
    render(h(Toolbar, { view: 'ftp', onViewChange: () => {}, ...hs }))
    fireEvent.keyDown(window, { key: 'Delete' })
    fireEvent.keyDown(window, { key: 'F5' })
    fireEvent.keyDown(window, { key: 'F1' })
    expect(hs.onTrash).not.toHaveBeenCalled()
    expect(hs.onCopy).not.toHaveBeenCalled()
    expect(hs.onHelp).toHaveBeenCalledTimes(1)
  })
})

describe('FilePanel 키 입력 차단 (Todo #77)', () => {
  afterEach(() => cleanup())

  const file = (name) => ({ name, path: `/d/${name}`, isDir: false, isHidden: false, size: 1, modified: '2026-01-01T00:00:00Z', extension: '.txt' })

  it('KB-05: keyboardDisabled면 Enter/Backspace/화살표가 패널에 적용되지 않음', () => {
    const navigateUp = vi.fn()
    useFileStore.setState(s => ({
      activePanel: 'left',
      navigateUp,
      left: { ...s.left, path: '/d', files: [file('a.txt'), file('b.txt')], cursor: 0, cursorOnParent: false },
    }))
    const onView = vi.fn()
    const { container } = render(h(FilePanel, { side: 'left', onView, onEdit: vi.fn(), onSwitchToPanel: vi.fn(), keyboardDisabled: true }))
    const list = container.querySelector('[tabindex="0"]')
    fireEvent.keyDown(list, { key: 'ArrowDown' })
    fireEvent.keyDown(list, { key: 'Backspace' })
    fireEvent.keyDown(list, { key: 'Enter' })
    expect(useFileStore.getState().left.cursor).toBe(0)
    expect(navigateUp).not.toHaveBeenCalled()
    expect(onView).not.toHaveBeenCalled()
  })

  it('KB-06: keyboardDisabled가 아니면 ArrowDown으로 커서 이동', () => {
    useFileStore.setState(s => ({
      activePanel: 'left',
      left: { ...s.left, path: '/d', files: [file('a.txt'), file('b.txt')], cursor: 0, cursorOnParent: false },
    }))
    const { container } = render(h(FilePanel, { side: 'left', onView: vi.fn(), onEdit: vi.fn(), onSwitchToPanel: vi.fn() }))
    fireEvent.keyDown(container.querySelector('[tabindex="0"]'), { key: 'ArrowDown' })
    expect(useFileStore.getState().left.cursor).toBe(1)
  })
})

// ─── Todo #133-6: Shift+F2 폴더 비교 / Alt+F2 동기화 / F2 이름 바꾸기 ─────────────
describe('F2 조합 (Todo #133-6)', () => {
  afterEach(() => cleanup())

  it('KB-F2: F2 이름 바꾸기, Shift+F2 비교, Alt+F2 동기화 — 각각 하나만', () => {
    const hs = { ...handlers(), onCompareDirs: vi.fn(), onSyncDirs: vi.fn() }
    render(h(Toolbar, { view: 'files', onViewChange: () => {}, ...hs }))
    fireEvent.keyDown(window, { key: 'F2', shiftKey: true })
    fireEvent.keyDown(window, { key: 'F2', altKey: true })
    fireEvent.keyDown(window, { key: 'F2' })
    expect(hs.onCompareDirs).toHaveBeenCalledTimes(1)
    expect(hs.onSyncDirs).toHaveBeenCalledTimes(1)
    expect(hs.onRename).toHaveBeenCalledTimes(1)
  })
})
