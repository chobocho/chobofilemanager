import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import FilePanel from './FilePanel.jsx'
import { useFileStore } from '../stores/fileStore'
import { useThemeStore } from '../stores/themeStore'

vi.mock('../wailsjs/runtime', () => ({ default: {
  ChangeWorkingDirectory: vi.fn(() => Promise.resolve()),
  SaveSessionState: vi.fn(() => Promise.resolve()),
} }))

const h = React.createElement
Element.prototype.scrollIntoView = vi.fn()

const initial = useFileStore.getState()

const f = (name, extra = {}) => ({
  name, path: `/d/${name}`, isDir: false, isHidden: false, size: 100,
  modified: '2026-01-01T00:00:00Z', extension: name.includes('.') ? '.' + name.split('.').pop() : '', ...extra,
})
const dir = (name) => f(name, { isDir: true, extension: '', size: 0 })

let actions
function setup({ files, path = '/d', panelExtra = {}, props = {}, drives = [] } = {}) {
  actions = {
    navigate: vi.fn().mockResolvedValue(undefined),
    navigateUp: vi.fn(),
    navigateBack: vi.fn(),
    refresh: vi.fn(),
    openFile: vi.fn().mockResolvedValue(undefined),
    toggleHidden: vi.fn(),
    setSort: vi.fn(),
    newTab: vi.fn(),
    closeTab: vi.fn(),
    switchTab: vi.fn(),
    selectAll: vi.fn(),
    setStatus: vi.fn(),
  }
  useFileStore.setState(s => ({
    ...actions,
    activePanel: 'left',
    drives,
    left: {
      ...s.left, path, files: files || [dir('sub'), f('a.txt'), f('b.png'), f('c.zip'), f('.hid', { isHidden: true })],
      cursor: 0, cursorOnParent: false, selected: new Set(), showHidden: false, loading: false, error: null,
      tabs: [{ id: 't1', path }], activeTabIdx: 0, ...panelExtra,
    },
  }))
  const onView = vi.fn(), onEdit = vi.fn(), onSwitchToPanel = vi.fn()
  const r = render(h(FilePanel, { side: 'left', onView, onEdit, onSwitchToPanel, ...props }))
  const list = r.container.firstChild
  return { ...r, list, onView, onEdit, onSwitchToPanel }
}
const left = () => useFileStore.getState().left
const rows = (c) => c.querySelectorAll('[data-row]')

describe('FilePanel 커버리지 (FPC)', () => {
  beforeEach(() => { useFileStore.setState(initial, true); useThemeStore.setState({ theme: 'dark' }) })
  afterEach(() => cleanup())

  it('FPC-01: 숨김 파일은 기본 숨김, [..] 행과 항목 수 표시', () => {
    const { container } = setup()
    expect(rows(container).length).toBe(4)
    expect(screen.getByText('[..]')).toBeTruthy()
    expect(screen.getByText('4 items')).toBeTruthy()
    expect(screen.queryByText('.hid')).toBeNull()
  })

  it('FPC-02: showHidden이면 숨김 파일 표시, 라이트 테마 아이콘 렌더', () => {
    useThemeStore.setState({ theme: 'light' })
    const { container } = setup({ panelExtra: { showHidden: true } })
    expect(rows(container).length).toBe(5)
    expect(screen.getByText('.hid')).toBeTruthy()
    expect(screen.getByTitle('Hide dotfiles (Ctrl+H)')).toBeTruthy()
  })

  it('FPC-03: 루트 경로에서는 [..] 행이 없음', () => {
    setup({ path: '/' })
    expect(screen.queryByText('[..]')).toBeNull()
  })

  it('FPC-04: 로딩/에러 상태 표시', () => {
    setup({ panelExtra: { loading: true } })
    expect(screen.getByText('Loading...')).toBeTruthy()
    cleanup()
    setup({ panelExtra: { error: 'boom' } })
    expect(screen.getByText(/boom/)).toBeTruthy()
    expect(screen.queryByText('[..]')).toBeNull()
  })

  it('FPC-05: 행 클릭 → 커서 이동, Ctrl+클릭 → 선택 토글', () => {
    const { container } = setup()
    fireEvent.click(rows(container)[2])
    expect(left().cursor).toBe(2)
    fireEvent.click(rows(container)[1], { ctrlKey: true })
    expect(left().selected.has('/d/a.txt')).toBe(true)
    fireEvent.click(rows(container)[1], { ctrlKey: true })
    expect(left().selected.has('/d/a.txt')).toBe(false)
  })

  it('FPC-06: Shift+클릭 → 커서부터 범위 선택, 푸터에 선택 수/크기', () => {
    const { container } = setup()
    fireEvent.click(rows(container)[1])
    fireEvent.click(rows(container)[3], { shiftKey: true })
    const sel = left().selected
    expect([...sel].sort()).toEqual(['/d/a.txt', '/d/b.png', '/d/c.zip'])
    expect(screen.getByText(/3 selected/)).toBeTruthy()
  })

  it('FPC-07: 더블클릭 — 폴더는 navigate, 텍스트는 onEdit, 기타/.bat은 openFile', async () => {
    const files = [dir('sub'), f('a.txt'), f('b.png'), f('run.bat')]
    const { container, onEdit } = setup({ files })
    await act(async () => { fireEvent.doubleClick(rows(container)[0]) })
    expect(actions.navigate).toHaveBeenCalledWith('left', '/d/sub')
    await act(async () => { fireEvent.doubleClick(rows(container)[1]) })
    expect(onEdit).toHaveBeenCalledWith(files[1])
    await act(async () => { fireEvent.doubleClick(rows(container)[2]) })
    expect(actions.openFile).toHaveBeenCalledWith('/d/b.png')
    await act(async () => { fireEvent.doubleClick(rows(container)[3]) })
    expect(actions.openFile).toHaveBeenCalledWith('/d/run.bat')
    expect(onEdit).toHaveBeenCalledTimes(1)
  })

  it('FPC-08: [..] 클릭은 cursorOnParent, 더블클릭은 navigateUp', () => {
    setup()
    fireEvent.click(screen.getByTitle('Parent directory'))
    expect(left().cursorOnParent).toBe(true)
    fireEvent.doubleClick(screen.getByTitle('Parent directory'))
    expect(actions.navigateUp).toHaveBeenCalledWith('left')
  })

  it('FPC-09: Enter — 폴더 navigate / 뷰어 대상 onView / 기타 openFile / [..] navigateUp', async () => {
    const files = [dir('sub'), f('a.txt'), f('c.zip')]
    const { list, onView } = setup({ files })
    await act(async () => { fireEvent.keyDown(list, { key: 'Enter' }) })
    expect(actions.navigate).toHaveBeenCalledWith('left', '/d/sub')
    act(() => useFileStore.getState().setCursor('left', 1))
    await act(async () => { fireEvent.keyDown(list, { key: 'Enter' }) })
    expect(onView).toHaveBeenCalledWith(files[1])
    act(() => useFileStore.getState().setCursor('left', 2))
    await act(async () => { fireEvent.keyDown(list, { key: 'Enter' }) })
    expect(actions.openFile).toHaveBeenCalledWith('/d/c.zip')
    act(() => useFileStore.getState().setCursorOnParent('left', true))
    fireEvent.keyDown(list, { key: 'Enter' })
    expect(actions.navigateUp).toHaveBeenCalledWith('left')
  })

  it('FPC-10: ArrowDown/ArrowUp 이동, 맨 위에서 ↑ → [..], [..]에서 ↓ → 0', () => {
    const { list } = setup()
    fireEvent.keyDown(list, { key: 'ArrowDown' })
    fireEvent.keyDown(list, { key: 'ArrowDown' })
    expect(left().cursor).toBe(2)
    fireEvent.keyDown(list, { key: 'ArrowUp' })
    expect(left().cursor).toBe(1)
    fireEvent.keyDown(list, { key: 'ArrowUp' })
    fireEvent.keyDown(list, { key: 'ArrowUp' })
    expect(left().cursorOnParent).toBe(true)
    fireEvent.keyDown(list, { key: 'ArrowUp' })
    expect(left().cursorOnParent).toBe(true)
    fireEvent.keyDown(list, { key: 'ArrowDown' })
    expect(left().cursorOnParent).toBe(false)
    expect(left().cursor).toBe(0)
  })

  it('FPC-11: 마지막 항목에서 ↓는 더 이동하지 않음', () => {
    const { list } = setup({ panelExtra: { cursor: 3 } })
    fireEvent.keyDown(list, { key: 'ArrowDown' })
    expect(left().cursor).toBe(3)
  })

  it('FPC-12: vim j/k, WASD s/w 이동', () => {
    const { list } = setup()
    fireEvent.keyDown(list, { key: 'j' })
    expect(left().cursor).toBe(1)
    fireEvent.keyDown(list, { key: 's' })
    expect(left().cursor).toBe(2)
    fireEvent.keyDown(list, { key: 'k' })
    expect(left().cursor).toBe(1)
    fireEvent.keyDown(list, { key: 'w' })
    expect(left().cursor).toBe(0)
    fireEvent.keyDown(list, { key: 'w' })
    expect(left().cursorOnParent).toBe(true)
    fireEvent.keyDown(list, { key: 'k' })
    expect(left().cursorOnParent).toBe(true)
    fireEvent.keyDown(list, { key: 'j' })
    expect(left().cursorOnParent).toBe(false)
    act(() => useFileStore.getState().setCursorOnParent('left', true))
    fireEvent.keyDown(list, { key: 's' })
    expect(left().cursorOnParent).toBe(false)
    act(() => useFileStore.getState().setCursorOnParent('left', true))
    fireEvent.keyDown(list, { key: 'w' })
    expect(left().cursorOnParent).toBe(true)
  })

  it('FPC-13: k at top → [..]', () => {
    const { list } = setup()
    fireEvent.keyDown(list, { key: 'k' })
    expect(left().cursorOnParent).toBe(true)
  })

  it('FPC-14: Backspace → navigateUp, - → navigateBack', () => {
    const { list } = setup()
    fireEvent.keyDown(list, { key: 'Backspace' })
    expect(actions.navigateUp).toHaveBeenCalledWith('left')
    fireEvent.keyDown(list, { key: '-' })
    expect(actions.navigateBack).toHaveBeenCalledWith('left')
    fireEvent.keyDown(list, { key: '-', ctrlKey: true })
    expect(actions.navigateBack).toHaveBeenCalledTimes(1)
  })

  it('FPC-15: Space는 선택 토글, Insert는 선택 + 커서 다음으로', () => {
    const { list } = setup()
    fireEvent.keyDown(list, { key: ' ' })
    expect(left().selected.has('/d/sub')).toBe(true)
    expect(left().cursor).toBe(0)
    fireEvent.keyDown(list, { key: 'Insert' })
    expect(left().selected.has('/d/sub')).toBe(false)
    expect(left().cursor).toBe(1)
  })

  it('FPC-16: 마지막 항목 Insert는 커서 유지', () => {
    const { list } = setup({ panelExtra: { cursor: 3 } })
    fireEvent.keyDown(list, { key: 'Insert' })
    expect(left().selected.has('/d/c.zip')).toBe(true)
    expect(left().cursor).toBe(3)
  })

  it('FPC-17: Ctrl+R refresh, Ctrl+H toggleHidden, Ctrl+A selectAll', () => {
    const { list } = setup()
    fireEvent.keyDown(list, { key: 'r', ctrlKey: true })
    expect(actions.refresh).toHaveBeenCalledWith('left')
    fireEvent.keyDown(list, { key: 'h', ctrlKey: true })
    expect(actions.toggleHidden).toHaveBeenCalledWith('left')
    fireEvent.keyDown(list, { key: 'a', ctrlKey: true })
    expect(actions.selectAll).toHaveBeenCalledWith('left')
  })

  it('FPC-18: a/h → 왼쪽, d/l → 오른쪽 패널 전환', () => {
    const { list, onSwitchToPanel } = setup()
    for (const k of ['a', 'h', 'd', 'l']) fireEvent.keyDown(list, { key: k })
    expect(onSwitchToPanel.mock.calls.map(c => c[0])).toEqual(['left', 'left', 'right', 'right'])
  })

  it('FPC-19: Ctrl+T newTab, Ctrl+W closeTab, Ctrl+Tab/Ctrl+Shift+Tab switchTab', () => {
    const { list } = setup({ panelExtra: { tabs: [{ id: 'x1', path: '/d' }, { id: 'x2', path: '/e' }, { id: 'x3', path: '/f' }], activeTabIdx: 0 } })
    fireEvent.keyDown(list, { key: 't', ctrlKey: true })
    expect(actions.newTab).toHaveBeenCalledWith('left')
    fireEvent.keyDown(list, { key: 'w', ctrlKey: true })
    expect(actions.closeTab).toHaveBeenCalledWith('left', 0)
    fireEvent.keyDown(list, { key: 'Tab', ctrlKey: true })
    expect(actions.switchTab).toHaveBeenLastCalledWith('left', 1)
    fireEvent.keyDown(list, { key: 'Tab', ctrlKey: true, shiftKey: true })
    expect(actions.switchTab).toHaveBeenLastCalledWith('left', 2)
    fireEvent.keyDown(list, { key: 'Tab' })
    expect(actions.switchTab).toHaveBeenCalledTimes(2)
  })

  it('FPC-20: Ctrl+Shift+C → 커서 파일 경로 클립보드 복사 + 상태 표시', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    const { list } = setup({ panelExtra: { cursor: 1 } })
    await act(async () => { fireEvent.keyDown(list, { key: 'C', ctrlKey: true, shiftKey: true }) })
    expect(writeText).toHaveBeenCalledWith('/d/a.txt')
    expect(actions.setStatus).toHaveBeenCalledWith('복사됨: /d/a.txt')
  })

  it('FPC-21: [..]에서 Ctrl+Shift+C → 현재 폴더 경로, 실패 시 오류 상태', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'))
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    const { list } = setup({ panelExtra: { cursorOnParent: true } })
    await act(async () => { fireEvent.keyDown(list, { key: 'c', ctrlKey: true, shiftKey: true }) })
    expect(writeText).toHaveBeenCalledWith('/d')
    expect(actions.setStatus).toHaveBeenCalledWith('클립보드 복사 실패')
  })

  it('FPC-22: F5/F6/F8/Delete는 기본 동작만 막음', () => {
    const { list } = setup()
    for (const key of ['F5', 'F6', 'F8', 'Delete']) {
      const ev = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
      list.dispatchEvent(ev)
      expect(ev.defaultPrevented).toBe(true)
    }
  })

  it('FPC-23: 비활성 패널은 키 입력 무시, input 대상 키 무시', () => {
    const { list } = setup()
    act(() => useFileStore.setState({ activePanel: 'right' }))
    fireEvent.keyDown(list, { key: 'ArrowDown' })
    expect(left().cursor).toBe(0)
  })

  it('FPC-24: 경로 표시 클릭 → 입력 편집 → 제출 시 navigate', () => {
    const { container } = setup()
    fireEvent.click(screen.getByTitle('Click to edit path'))
    const input = container.querySelector('form input')
    expect(input.value).toBe('/d')
    fireEvent.keyDown(input, { key: 'ArrowDown' }) // INPUT 대상은 패널 키 처리 안 함
    expect(left().cursor).toBe(0)
    fireEvent.change(input, { target: { value: '/x/y' } })
    fireEvent.submit(input.closest('form'))
    expect(actions.navigate).toHaveBeenCalledWith('left', '/x/y')
    expect(container.querySelector('form input')).toBeNull()
  })

  it('FPC-25: 경로 입력 blur 시 편집 종료', () => {
    const { container } = setup()
    fireEvent.click(screen.getByTitle('Click to edit path'))
    fireEvent.blur(container.querySelector('form input'))
    expect(container.querySelector('form input')).toBeNull()
  })

  it('FPC-26: Unix 경로 breadcrumb 클릭 → 해당 경로 navigate', () => {
    setup({ path: '/home/user/docs' })
    fireEvent.click(screen.getByText('user'))
    expect(actions.navigate).toHaveBeenCalledWith('left', '/home/user')
    fireEvent.click(screen.getAllByText('/')[0])
    expect(actions.navigate).toHaveBeenCalledWith('left', '/')
  })

  it('FPC-27: Windows 경로 breadcrumb → 드라이브/하위 경로', () => {
    setup({ path: 'C:\\Users\\me' })
    fireEvent.click(screen.getByText('C:'))
    expect(actions.navigate).toHaveBeenCalledWith('left', 'C:\\')
    fireEvent.click(screen.getByText('Users'))
    expect(actions.navigate).toHaveBeenCalledWith('left', 'C:\\Users')
  })

  it('FPC-28: 드라이브 선택 → navigate, 여유 공간 표시', () => {
    const drives = [{ name: 'C:', path: 'C:\\', driveType: 'NTFS', freeSpace: 1024 * 1024 }]
    const { container } = setup({ path: 'C:\\data', drives })
    expect(screen.getByText(/Free:/)).toBeTruthy()
    fireEvent.change(container.querySelector('select'), { target: { value: 'C:\\' } })
    expect(actions.navigate).toHaveBeenCalledWith('left', 'C:\\')
  })

  it('FPC-29: 헤더 버튼 — 상위/새로고침/숨김 토글', () => {
    setup()
    fireEvent.click(screen.getByTitle('Parent directory (Backspace)'))
    expect(actions.navigateUp).toHaveBeenCalledWith('left')
    fireEvent.click(screen.getByTitle('Refresh (Ctrl+R)'))
    expect(actions.refresh).toHaveBeenCalledWith('left')
    fireEvent.click(screen.getByTitle('Show dotfiles (Ctrl+H)'))
    expect(actions.toggleHidden).toHaveBeenCalledWith('left')
  })

  it('FPC-30: 컬럼 헤더 클릭 → setSort, 정렬 화살표 표시', () => {
    setup({ panelExtra: { sortBy: 'size', sortDir: 'desc' } })
    expect(screen.getByText('↓')).toBeTruthy()
    fireEvent.click(screen.getByText('Modified'))
    expect(actions.setSort).toHaveBeenCalledWith('left', 'modified')
    fireEvent.click(screen.getByText('Ext'))
    expect(actions.setSort).toHaveBeenCalledWith('left', 'extension')
  })

  it('FPC-31: 탭 바 — 탭 클릭 switchTab, 닫기 closeTab, + newTab', () => {
    setup({ panelExtra: { tabs: [{ id: 'x1', path: '/d' }, { id: 'x2', path: '/e/f' }], activeTabIdx: 0 } })
    fireEvent.click(screen.getByText('f'))
    expect(actions.switchTab).toHaveBeenCalledWith('left', 1)
    fireEvent.click(screen.getAllByTitle('Close tab')[1])
    expect(actions.closeTab).toHaveBeenCalledWith('left', 1)
    fireEvent.click(screen.getByTitle('New tab (Ctrl+T)'))
    expect(actions.newTab).toHaveBeenCalledWith('left')
  })

  it('FPC-32: 탭 하나뿐이면 닫기 버튼 없음, 빈 경로 탭은 Home', () => {
    setup({ path: '', panelExtra: { tabs: [{ id: 'x1', path: '' }] } })
    expect(screen.queryByTitle('Close tab')).toBeNull()
    expect(screen.getByText('Home')).toBeTruthy()
  })

  it('FPC-33: ref.focus()로 패널에 포커스', () => {
    const ref = React.createRef()
    const { list } = setup({ props: { ref } })
    act(() => ref.current.focus())
    expect(document.activeElement).toBe(list)
  })

  it('FPC-34: 패널 클릭 시 활성 패널 지정', () => {
    const { list } = setup()
    act(() => useFileStore.setState({ activePanel: 'right' }))
    fireEvent.click(list)
    expect(useFileStore.getState().activePanel).toBe('left')
  })

  it('FPC-35: Shift+글자 퀵 점프 — 매칭 없으면 커서 유지', () => {
    const { list } = setup()
    fireEvent.keyDown(list, { key: 'Z', shiftKey: true })
    expect(left().cursor).toBe(0)
    fireEvent.keyDown(list, { key: 'B', shiftKey: true })
    expect(left().cursor).toBe(2)
  })
})
