import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, cleanup, act, waitFor } from '@testing-library/react'
import FolderTree, { ancestorsOf } from './FolderTree.jsx'
import FilePanel from './FilePanel.jsx'
import Toolbar from './Toolbar.jsx'
import { useFileStore } from '../stores/fileStore'
import api from '../wailsjs/runtime'

// Todo #133-10: 폴더 트리 (Ctrl+F8)

vi.mock('../wailsjs/runtime', () => ({ default: { ListDirectory: vi.fn(), SaveSessionState: vi.fn(() => Promise.resolve()) } }))

const h = React.createElement
Element.prototype.scrollIntoView = vi.fn()

const d = (dir, name, extra = {}) => ({ name, path: (dir.endsWith('/') ? dir : dir + '/') + name, isDir: true, isHidden: name.startsWith('.'), ...extra })
const fsTree = {
  '/': [d('/', 'home'), d('/', 'usr'), { name: 'f.txt', path: '/f.txt', isDir: false }],
  '/home': [d('/home', 'me'), d('/home', '.cache')],
  '/home/me': [d('/home/me', 'docs')],
  '/home/me/docs': [],
  '/usr': [d('/usr', 'bin')],
  '/usr/bin': [],
}

describe('ancestorsOf (TA)', () => {
  it('TA-01: 루트부터 그 폴더까지', () => {
    expect(ancestorsOf('/home/me')).toEqual(['/', '/home', '/home/me'])
    expect(ancestorsOf('/')).toEqual(['/'])
    expect(ancestorsOf('C:\\a\\b')).toEqual(['C:\\', 'C:\\a', 'C:\\a\\b'])
    expect(ancestorsOf('C:\\')).toEqual(['C:\\'])
    expect(ancestorsOf('ftp://id/x/y')).toEqual(['ftp://id/', 'ftp://id/x', 'ftp://id/x/y'])
  })
})

describe('폴더 트리 (FT)', () => {
  beforeEach(() => {
    api.ListDirectory.mockReset().mockImplementation(async (p) => ({ path: p, files: fsTree[p] || [] }))
  })
  afterEach(() => cleanup())

  async function mount(path = '/home/me', extra = {}) {
    const onNavigate = vi.fn()
    let r
    await act(async () => { r = render(h(FolderTree, { path, showHidden: false, onNavigate, ...extra })) })
    return { ...r, onNavigate }
  }
  const nodes = () => [...document.querySelectorAll('[role="treeitem"]')].map(n => n.getAttribute('data-path'))

  it('FT-01: 지금 폴더까지 펼쳐서 보여 주고 지금 폴더 표시, 파일·숨김 폴더는 빼고', async () => {
    await mount()
    expect(nodes()).toEqual(['/', '/home', '/home/me', '/home/me/docs', '/usr'])
    expect(document.querySelector('[aria-current="true"]').getAttribute('data-path')).toBe('/home/me')
  })

  it('FT-02: 숨김 표시가 켜져 있으면 숨김 폴더도', async () => {
    await mount('/home/me', { showHidden: true })
    expect(nodes()).toContain('/home/.cache')
  })

  it('FT-03: 이름 클릭 → 그 폴더로, 펼침 단추 → 하위 폴더 읽기', async () => {
    const { onNavigate } = await mount()
    fireEvent.click(screen.getByText('usr'))
    expect(onNavigate).toHaveBeenCalledWith('/usr')
    await act(async () => { fireEvent.click(document.querySelector('[data-path="/usr"] [data-toggle]')) })
    expect(nodes()).toContain('/usr/bin')
  })

  it('FT-04: 키보드 — ↑↓ 이동, → 펼치기, ← 접기/부모, Enter 이동', async () => {
    const { onNavigate } = await mount()
    const tree = screen.getByRole('tree', { name: '폴더 트리' })
    fireEvent.keyDown(tree, { key: 'ArrowDown' }) // /home/me → /home/me/docs
    fireEvent.keyDown(tree, { key: 'ArrowDown' }) // → /usr
    await act(async () => { fireEvent.keyDown(tree, { key: 'ArrowRight' }) }) // /usr 펼침
    expect(nodes()).toContain('/usr/bin')
    fireEvent.keyDown(tree, { key: 'ArrowLeft' }) // 접기
    expect(nodes()).not.toContain('/usr/bin')
    fireEvent.keyDown(tree, { key: 'ArrowLeft' }) // 부모 → /
    fireEvent.keyDown(tree, { key: 'Enter' })
    expect(onNavigate).toHaveBeenLastCalledWith('/')
  })

  it('FT-05: 패널 폴더가 바뀌면 그 폴더까지 다시 펼침', async () => {
    const { rerender } = await mount('/home/me')
    await act(async () => { rerender(h(FolderTree, { path: '/usr/bin', showHidden: false, onNavigate: vi.fn() })) })
    await waitFor(() => expect(document.querySelector('[aria-current="true"]').getAttribute('data-path')).toBe('/usr/bin'))
  })
})

describe('패널 · 단축키 (FP)', () => {
  afterEach(() => cleanup())
  beforeEach(() => {
    api.ListDirectory.mockReset().mockImplementation(async (p) => ({ path: p, files: fsTree[p] || [] }))
    useFileStore.setState(s => ({
      activePanel: 'left',
      left: { ...s.left, path: '/home/me', files: [], cursor: 0, cursorOnParent: false, selected: new Set(), showHidden: false,
        loading: false, error: null, tabs: [{ id: 't', path: '/home/me' }], activeTabIdx: 0, showTree: false },
    }))
  })

  it('FP-01: Ctrl+F8 → 패널 안에 트리 켜고 끄기', async () => {
    const list = render(h(FilePanel, { side: 'left', onView: vi.fn(), onEdit: vi.fn() })).container.firstChild
    await act(async () => { fireEvent.keyDown(list, { key: 'F8', ctrlKey: true }) })
    expect(await screen.findByRole('tree', { name: '폴더 트리' })).toBeTruthy()
    await act(async () => { fireEvent.keyDown(list, { key: 'F8', ctrlKey: true }) })
    expect(screen.queryByRole('tree', { name: '폴더 트리' })).toBeNull()
  })

  it('FP-02: Ctrl+F8은 휴지통이 아님 (F8만 휴지통)', () => {
    const onTrash = vi.fn(), onDelete = vi.fn()
    render(h(Toolbar, { view: 'files', onViewChange: () => {}, onTrash, onDelete, onRename: vi.fn(), onCopy: vi.fn(), onMove: vi.fn(), onNewDir: vi.fn() }))
    fireEvent.keyDown(window, { key: 'F8', ctrlKey: true })
    expect(onTrash).not.toHaveBeenCalled()
    fireEvent.keyDown(window, { key: 'F8' })
    expect(onTrash).toHaveBeenCalledTimes(1)
  })
})
