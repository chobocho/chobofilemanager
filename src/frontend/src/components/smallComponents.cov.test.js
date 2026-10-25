import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

const quitMock = vi.fn()
vi.mock('../../wailsjs/runtime/runtime', () => ({ Quit: (...a) => quitMock(...a) }))
vi.mock('../wailsjs/runtime', () => ({ default: {} }))

import FKeyBar from './FKeyBar.jsx'
import StatusBar from './StatusBar.jsx'
import HelpDialog from './HelpDialog.jsx'
import Toolbar from './Toolbar.jsx'
import CopyConflictDialog from './CopyConflictDialog.jsx'
import MoveConflictDialog from './MoveConflictDialog.jsx'
import { useFileStore } from '../stores/fileStore'
import { useThemeStore } from '../stores/themeStore'
import pkg from '../../package.json'

const h = React.createElement

afterEach(() => { cleanup(); quitMock.mockReset() })

// ─── FKeyBar ─────────────────────────────────────────────────────────────────
describe('FKeyBar 커버리지', () => {
  function all() {
    return {
      onHelp: vi.fn(), onRename: vi.fn(), onView: vi.fn(), onEdit: vi.fn(), onCopy: vi.fn(),
      onMove: vi.fn(), onNewDir: vi.fn(), onTrash: vi.fn(), onDelete: vi.fn(), onShell: vi.fn(), onCmd: vi.fn(),
    }
  }

  it('FK-01: 각 버튼 클릭 시 대응 핸들러 호출', () => {
    const hs = all()
    render(h(FKeyBar, hs))
    const map = [['Help', 'onHelp'], ['Rename', 'onRename'], ['View', 'onView'], ['Edit', 'onEdit'],
      ['Copy', 'onCopy'], ['Move', 'onMove'], ['NewDir', 'onNewDir'], ['Trash', 'onTrash'],
      ['Term', 'onCmd'], ['Shell', 'onShell']]
    for (const [label, fn] of map) {
      fireEvent.click(screen.getByText(label).closest('button'))
      expect(hs[fn], label).toHaveBeenCalledTimes(1)
    }
    expect(hs.onDelete).not.toHaveBeenCalled()
  })

  it('FK-03: 파일 보기가 아니면(FTP·Terminal) 파일 패널 버튼은 꺼짐 — Help·Quit만 (Todo #126)', () => {
    const hs = all()
    render(h(FKeyBar, { ...hs, fileView: false }))
    for (const label of ['Rename', 'View', 'Edit', 'Copy', 'Move', 'NewDir', 'Trash', 'Term', 'Shell']) {
      expect(screen.getByText(label).closest('button').disabled, label).toBe(true)
    }
    fireEvent.click(screen.getByText('Copy').closest('button'))
    expect(hs.onCopy).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('Help').closest('button'))
    expect(hs.onHelp).toHaveBeenCalled()
    expect(screen.getByText('Quit').closest('button').disabled).toBe(false)
  })

  it('FK-02: onTrash가 없으면 F8은 onDelete로 폴백', () => {
    const onDelete = vi.fn()
    render(h(FKeyBar, { onDelete }))
    fireEvent.click(screen.getByText('Trash').closest('button'))
    expect(onDelete).toHaveBeenCalledTimes(1)
  })

  it('FK-03: 핸들러 없는 버튼은 disabled + "not implemented" 툴팁', () => {
    render(h(FKeyBar, {}))
    const btn = screen.getByText('Copy').closest('button')
    expect(btn.disabled).toBe(true)
    expect(btn.title).toMatch(/not implemented/)
    const help = screen.getByText('Help').closest('button')
    expect(help.disabled).toBe(true)
  })

  it('FK-04: Quit 버튼은 항상 활성, 클릭 시 런타임 Quit 호출', () => {
    render(h(FKeyBar, {}))
    const btn = screen.getByText('Quit').closest('button')
    expect(btn.disabled).toBe(false)
    expect(btn.title).toBe('Quit (Alt+F4)')
    fireEvent.click(btn)
    expect(quitMock).toHaveBeenCalledTimes(1)
  })

  it('FK-05: Quit 실패(브라우저 환경)는 예외를 삼킴', () => {
    quitMock.mockImplementation(() => { throw new Error('no runtime') })
    render(h(FKeyBar, {}))
    expect(() => fireEvent.click(screen.getByText('Quit').closest('button'))).not.toThrow()
  })
})

// ─── StatusBar ───────────────────────────────────────────────────────────────
describe('StatusBar 커버리지', () => {
  it('SB-01: 경로/상태/항목 수/선택 수/활성 패널 표시', () => {
    useFileStore.setState(s => ({
      status: '복사 완료',
      activePanel: 'right',
      right: { ...s.right, path: '/r/dir', files: [{ name: 'a' }, { name: 'b' }, { name: 'c' }], selected: new Set(['/r/dir/a']) },
    }))
    render(h(StatusBar))
    expect(screen.getByText('/r/dir')).toBeTruthy()
    expect(screen.getByText('복사 완료')).toBeTruthy()
    expect(screen.getByText('3 items')).toBeTruthy()
    expect(screen.getByText('1 selected')).toBeTruthy()
    expect(screen.getByText('RIGHT')).toBeTruthy()
  })

  it('SB-02: 상태 없음/선택 없음이면 해당 항목 숨김', () => {
    useFileStore.setState(s => ({
      status: '',
      activePanel: 'left',
      left: { ...s.left, path: '/l', files: [], selected: new Set() },
    }))
    const { container } = render(h(StatusBar))
    expect(screen.getByText('0 items')).toBeTruthy()
    expect(screen.queryByText(/selected/)).toBeNull()
    expect(screen.getByText('LEFT')).toBeTruthy()
    expect(container.textContent).not.toMatch(/복사 완료/)
  })
})

// ─── HelpDialog ──────────────────────────────────────────────────────────────
describe('HelpDialog 커버리지', () => {
  it('HD-01: 버전과 섹션 렌더', () => {
    render(h(HelpDialog, { onClose: vi.fn() }))
    expect(screen.getByText(`도움말 — Chobocho Commander V${pkg.version}`)).toBeTruthy()
    for (const t of ['파일 조작', '탐색 및 선택', '탭', '압축', '기타']) {
      expect(screen.getByRole('heading', { name: t })).toBeTruthy()
    }
    expect(screen.getByText('Shift+Delete')).toBeTruthy()
  })

  it('HD-02: Esc / F1 키로 닫기', () => {
    const onClose = vi.fn()
    render(h(HelpDialog, { onClose }))
    fireEvent.keyDown(window, { key: 'Escape' })
    fireEvent.keyDown(window, { key: 'F1' })
    fireEvent.keyDown(window, { key: 'a' })
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('HD-03: 닫기 버튼/X/오버레이 클릭으로 닫기, 모달 내부 클릭은 무시', () => {
    const onClose = vi.fn()
    const { container } = render(h(HelpDialog, { onClose }))
    fireEvent.click(screen.getByText('닫기'))
    fireEvent.click(screen.getByTitle('닫기'))
    expect(onClose).toHaveBeenCalledTimes(2)
    fireEvent.click(screen.getByText('파일 조작'))
    expect(onClose).toHaveBeenCalledTimes(2)
    fireEvent.click(container.firstChild)
    expect(onClose).toHaveBeenCalledTimes(3)
  })

  it('HD-04: 언마운트 후 키 리스너 제거', () => {
    const onClose = vi.fn()
    const { unmount } = render(h(HelpDialog, { onClose }))
    unmount()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })
})

// ─── Toolbar ─────────────────────────────────────────────────────────────────
describe('Toolbar 커버리지', () => {
  function hs() {
    return {
      onHelp: vi.fn(), onRename: vi.fn(), onView: vi.fn(), onEdit: vi.fn(), onCopy: vi.fn(), onMove: vi.fn(),
      onNewDir: vi.fn(), onDelete: vi.fn(), onTrash: vi.fn(), onSwitchPanel: vi.fn(), onSearch: vi.fn(),
      onNewFile: vi.fn(), onBookmarks: vi.fn(), onCompress: vi.fn(), onExtract: vi.fn(), onViewChange: vi.fn(),
    }
  }
  beforeEach(() => useThemeStore.setState({ theme: 'dark' }))

  it('TB-01: 버튼 클릭 → 뷰 전환/새 파일/검색/압축/압축 풀기 핸들러', () => {
    const p = hs()
    render(h(Toolbar, { view: 'files', ...p }))
    fireEvent.click(screen.getByTitle('FTP Manager'))
    expect(p.onViewChange).toHaveBeenLastCalledWith('ftp')
    fireEvent.click(screen.getByTitle('File Manager'))
    expect(p.onViewChange).toHaveBeenLastCalledWith('files')
    fireEvent.click(screen.getByTitle('New File'))
    fireEvent.click(screen.getByTitle('Search'))
    fireEvent.click(screen.getByTitle('압축하기'))
    fireEvent.click(screen.getByTitle('압축 풀기'))
    expect(p.onNewFile).toHaveBeenCalledTimes(1)
    expect(p.onSearch).toHaveBeenCalledTimes(1)
    expect(p.onCompress).toHaveBeenCalledTimes(1)
    expect(p.onExtract).toHaveBeenCalledTimes(1)
  })

  it('TB-02: 테마 버튼으로 dark ↔ light 전환, 툴팁 갱신', () => {
    render(h(Toolbar, { view: 'files', ...hs() }))
    const btn = screen.getByLabelText('Toggle theme')
    expect(btn.title).toBe('Switch to Light Theme')
    fireEvent.click(btn)
    expect(useThemeStore.getState().theme).toBe('light')
    expect(screen.getByLabelText('Toggle theme').title).toBe('Switch to Dark Theme')
  })

  it('TB-03: F1~F7 단축키가 각 핸들러 호출', () => {
    const p = hs()
    render(h(Toolbar, { view: 'files', ...p }))
    const map = { F1: 'onHelp', F2: 'onRename', F3: 'onView', F4: 'onEdit', F5: 'onCopy', F6: 'onMove', F7: 'onNewDir' }
    for (const [key, fn] of Object.entries(map)) {
      fireEvent.keyDown(window, { key })
      expect(p[fn], key).toHaveBeenCalledTimes(1)
    }
  })

  it('TB-04: Ctrl+F/N/D (대소문자) → 검색/새 파일/바로가기, Ctrl 없으면 무시', () => {
    const p = hs()
    render(h(Toolbar, { view: 'files', ...p }))
    fireEvent.keyDown(window, { key: 'f', ctrlKey: true })
    fireEvent.keyDown(window, { key: 'F', ctrlKey: true })
    fireEvent.keyDown(window, { key: 'n', ctrlKey: true })
    fireEvent.keyDown(window, { key: 'N', ctrlKey: true })
    fireEvent.keyDown(window, { key: 'd', ctrlKey: true })
    fireEvent.keyDown(window, { key: 'D', ctrlKey: true })
    fireEvent.keyDown(window, { key: 'f' })
    fireEvent.keyDown(window, { key: 'n' })
    fireEvent.keyDown(window, { key: 'd' })
    fireEvent.keyDown(window, { key: 'x', ctrlKey: true })
    expect(p.onSearch).toHaveBeenCalledTimes(2)
    expect(p.onNewFile).toHaveBeenCalledTimes(2)
    expect(p.onBookmarks).toHaveBeenCalledTimes(2)
  })

  it('TB-05: Shift+Delete → onDelete, Delete → onTrash, Ctrl+Tab은 패널 전환 안 함', () => {
    const p = hs()
    render(h(Toolbar, { view: 'files', ...p }))
    fireEvent.keyDown(window, { key: 'Delete', shiftKey: true })
    fireEvent.keyDown(window, { key: 'Delete' })
    fireEvent.keyDown(window, { key: 'Tab', ctrlKey: true })
    expect(p.onDelete).toHaveBeenCalledTimes(1)
    expect(p.onTrash).toHaveBeenCalledTimes(1)
    expect(p.onSwitchPanel).not.toHaveBeenCalled()
  })

  it('TB-06: onTrash 미지정이면 F8은 onDelete로 폴백', () => {
    const p = hs()
    delete p.onTrash
    render(h(Toolbar, { view: 'files', ...p }))
    fireEvent.keyDown(window, { key: 'F8' })
    expect(p.onDelete).toHaveBeenCalledTimes(1)
  })

  it('TB-07: INPUT/TEXTAREA에서 발생한 키는 무시', () => {
    const p = hs()
    render(h('div', null, h(Toolbar, { view: 'files', ...p }), h('input', { 'data-testid': 'in' }), h('textarea', { 'data-testid': 'ta' })))
    fireEvent.keyDown(screen.getByTestId('in'), { key: 'F5' })
    fireEvent.keyDown(screen.getByTestId('ta'), { key: 'F8' })
    expect(p.onCopy).not.toHaveBeenCalled()
    expect(p.onTrash).not.toHaveBeenCalled()
  })

  it('TB-08: FTP 뷰에서 F1 외 키는 무시, ftp 버튼에 active 클래스', () => {
    const p = hs()
    render(h(Toolbar, { view: 'ftp', ...p }))
    fireEvent.keyDown(window, { key: 'F2' })
    fireEvent.keyDown(window, { key: 'F1' })
    expect(p.onRename).not.toHaveBeenCalled()
    expect(p.onHelp).toHaveBeenCalledTimes(1)
    expect(screen.getByTitle('FTP Manager').className).toMatch(/viewBtnActive/)
    expect(screen.getByTitle('File Manager').className).not.toMatch(/viewBtnActive/)
  })
})

// ─── Copy / Move 충돌 다이얼로그 ─────────────────────────────────────────────
describe('충돌 다이얼로그 커버리지', () => {
  const conflicts = [{ name: 'a.txt', destPath: '/d/a.txt' }, { name: 'b.txt', destPath: '/d/b.txt' }]

  it('CC-01: 복사 충돌 — 개수/목록 표시, 각 버튼이 모드 전달', () => {
    const onConfirm = vi.fn(), onClose = vi.fn()
    render(h(CopyConflictDialog, { conflicts, sources: [], dest: '/d', onConfirm, onClose }))
    expect(screen.getByText('파일 복사 충돌')).toBeTruthy()
    expect(screen.getByText('2개')).toBeTruthy()
    expect(screen.getByTitle('/d/a.txt').textContent).toBe('a.txt')
    fireEvent.click(screen.getByText('덮어쓰기'))
    fireEvent.click(screen.getByText('이름 바꾸어 복사'))
    fireEvent.click(screen.getByText('건너뛰기'))
    expect(onConfirm.mock.calls.map(c => c[0])).toEqual(['overwrite', 'rename', 'skip'])
    fireEvent.click(screen.getByText('취소'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('CC-02: 복사 충돌 — 오버레이 클릭은 닫기, 모달 내부 클릭은 무시', () => {
    const onClose = vi.fn()
    const { container } = render(h(CopyConflictDialog, { conflicts, sources: [], dest: '/d', onConfirm: vi.fn(), onClose }))
    fireEvent.click(screen.getByText('파일 복사 충돌'))
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(container.firstChild)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('MC-01: 이동 충돌 — 덮어쓰기/이름 바꾸기 모드 전달, 건너뛰기 없음', () => {
    const onConfirm = vi.fn(), onClose = vi.fn()
    const { container } = render(h(MoveConflictDialog, { conflicts, sources: [], dest: '/d', onConfirm, onClose }))
    expect(screen.getByText('파일 이동 충돌')).toBeTruthy()
    expect(screen.queryByText('건너뛰기')).toBeNull()
    fireEvent.click(screen.getByText('덮어쓰기'))
    fireEvent.click(screen.getByText('이름 바꾸어 이동'))
    expect(onConfirm.mock.calls.map(c => c[0])).toEqual(['overwrite', 'rename'])
    fireEvent.click(screen.getByText('파일 이동 충돌'))
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(container.firstChild)
    fireEvent.click(screen.getByText('취소'))
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
