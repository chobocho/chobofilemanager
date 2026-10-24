import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join } from 'node:path'

import FilePanel from './FilePanel.jsx'
import FileViewer from './FileViewer.jsx'
import TextEditor from './TextEditor.jsx'
import { ShellCommandDialog } from './ConfirmDialog.jsx'
import { useFileStore } from '../stores/fileStore'
import api from '../wailsjs/runtime'
import { findSurfaceWithText, typeText } from '../test/textSurface.js'

const h = React.createElement
const __dirname = dirname(fileURLToPath(import.meta.url))
Element.prototype.scrollIntoView = vi.fn()

// ─── Todo #100: 프론트엔드 잔여 버그 ──────────────────────────────────────────
describe('Todo #100', () => {
  afterEach(() => cleanup())

  it('M-01: Shift+C / Shift+T / Shift+W 퀵 점프 동작', () => {
    const f = (n) => ({ name: n, path: `/d/${n}`, isDir: false, isHidden: false, size: 1, modified: '', extension: '.txt' })
    useFileStore.setState(s => ({
      activePanel: 'left',
      left: { ...s.left, path: '/d', files: [f('a.txt'), f('c.txt'), f('t.txt'), f('w.txt')], cursor: 0, cursorOnParent: false, selected: new Set() },
    }))
    const { container } = render(h(FilePanel, { side: 'left', onView: vi.fn(), onEdit: vi.fn(), onSwitchToPanel: vi.fn() }))
    const list = container.querySelector('[tabindex="0"]')
    fireEvent.keyDown(list, { key: 'C', shiftKey: true })
    expect(useFileStore.getState().left.cursor).toBe(1)
    fireEvent.keyDown(list, { key: 'T', shiftKey: true })
    expect(useFileStore.getState().left.cursor).toBe(2)
    fireEvent.keyDown(list, { key: 'W', shiftKey: true })
    expect(useFileStore.getState().left.cursor).toBe(3)
  })

  it('M-02: 이미지 뷰어에서는 F4/편집 버튼으로 에디터를 열지 않음', async () => {
    useFileStore.setState({ readImage: vi.fn().mockResolvedValue('data:image/png;base64,AA'), readFile: vi.fn() })
    const onSwitchToEditor = vi.fn()
    render(h(FileViewer, { path: '/i/a.png', onClose: () => {}, onSwitchToEditor }))
    await act(async () => {})
    fireEvent.keyDown(window, { key: 'F4' })
    expect(onSwitchToEditor).not.toHaveBeenCalled()
    expect(screen.queryByTitle(/편집기/)).toBeNull()
  })

  it('M-03: 셸 히스토리가 비었을 때 ↑는 입력 중인 명령을 지우지 않음', () => {
    render(h(ShellCommandDialog, { workDir: '/d', onClose: () => {} }))
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'dir /w' } })
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    expect(input.value).toBe('dir /w')
  })

  it('M-04: 미저장 확인창이 뜨면 포커스가 확인창 버튼으로 이동 (뒤에서 계속 입력되지 않음)', async () => {
    useFileStore.setState({ readFile: vi.fn().mockResolvedValue('abc'), writeFile: vi.fn() })
    render(h(TextEditor, { path: '/x/a.txt', onClose: vi.fn() }))
    const ta = await findSurfaceWithText('abc')
    typeText(ta, 'abcd')
    fireEvent.click(screen.getByTitle('Close (Esc)'))
    expect(document.activeElement).toBe(screen.getByText('저장'))
  })

  it('M-05: IME 조합 중 Esc는 에디터를 닫지 않음', async () => {
    const onClose = vi.fn()
    useFileStore.setState({ readFile: vi.fn().mockResolvedValue('abc'), writeFile: vi.fn() })
    render(h(TextEditor, { path: '/x/a.txt', onClose }))
    await findSurfaceWithText('abc')
    fireEvent.keyDown(window, { key: 'Escape', isComposing: true })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('M-06: 비활성 탭을 닫아도 현재 탭이 유지됨', async () => {
    useFileStore.setState(s => ({
      left: { ...s.left, path: '/t0', tabs: [{ id: 0, path: '/t0' }, { id: 1, path: '/t1' }, { id: 2, path: '/t2' }], activeTabIdx: 0 },
    }))
    await useFileStore.getState().closeTab('left', 2)
    let left = useFileStore.getState().left
    expect(left.activeTabIdx).toBe(0)
    expect(left.path).toBe('/t0')
    expect(left.tabs.map(t => t.path)).toEqual(['/t0', '/t1'])

    useFileStore.setState(s => ({
      left: { ...s.left, path: '/t2', tabs: [{ id: 0, path: '/t0' }, { id: 1, path: '/t1' }, { id: 2, path: '/t2' }], activeTabIdx: 2 },
    }))
    await useFileStore.getState().closeTab('left', 0)
    left = useFileStore.getState().left
    expect(left.activeTabIdx).toBe(1)
    expect(left.tabs[left.activeTabIdx].path).toBe('/t2')
  })

  it('M-07: 브라우저 mock API가 프론트에서 호출하는 모든 바인딩을 제공', () => {
    const files = []
    const walk = (d) => readdirSync(d, { withFileTypes: true }).forEach(e => {
      const p = join(d, e.name)
      if (e.isDirectory()) { if (e.name !== 'wailsjs') walk(p) }
      else if (/\.(js|jsx)$/.test(e.name) && !/\.test\.jsx?$/.test(e.name)) files.push(p)
    })
    walk(resolve(__dirname, '..'))
    const used = new Set()
    for (const p of files) {
      for (const m of readFileSync(p, 'utf8').matchAll(/\bapi\.([A-Z][A-Za-z0-9]+)/g)) used.add(m[1])
    }
    const missing = [...used].filter(name => typeof api[name] !== 'function')
    expect(missing).toEqual([])
  })
})
