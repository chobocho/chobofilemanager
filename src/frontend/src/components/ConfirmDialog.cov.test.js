import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, cleanup, act, waitFor } from '@testing-library/react'

const api = vi.hoisted(() => ({
  RunShellCommand: vi.fn(),
  SearchFiles: vi.fn(),
  OpenFile: vi.fn(),
}))
vi.mock('../wailsjs/runtime', () => ({ default: api }))

import { ConfirmDialog, NewItemDialog, RenameDialog, ShellCommandDialog, SearchDialog } from './ConfirmDialog.jsx'
import * as indexExports from './index.js'
import NewItemDialogShim from './NewItemDialog.jsx'
import { useFileStore } from '../stores/fileStore'

const h = React.createElement
Element.prototype.scrollIntoView = vi.fn()
Element.prototype.scrollTo = vi.fn()

afterEach(() => { cleanup(); vi.clearAllMocks() })

const file = (name, extra = {}) => ({
  name, path: `/d/${name}`, isDir: false, isHidden: false, size: 10, modified: '', extension: '.' + name.split('.').pop(), ...extra,
})

// ─── ConfirmDialog ───────────────────────────────────────────────────────────
describe('ConfirmDialog 렌더/키 커버리지', () => {
  it('CFD-01: 제목/메시지/항목 목록/라벨 렌더, danger 스타일', () => {
    render(h(ConfirmDialog, { title: '삭제', message: '2개 삭제?', items: ['a', 'b'], confirmLabel: '삭제하기', danger: true, onConfirm: vi.fn(), onClose: vi.fn() }))
    expect(screen.getByText('삭제')).toBeTruthy()
    expect(screen.getByText('2개 삭제?')).toBeTruthy()
    expect(screen.getByTitle('a')).toBeTruthy()
    expect(screen.getByTitle('b')).toBeTruthy()
    expect(screen.getByText('삭제하기').className).toMatch(/btnDanger/)
  })

  it('CFD-02: 기본 포커스는 Confirm, ← 로 Cancel, → 로 Confirm', () => {
    render(h(ConfirmDialog, { title: 't', message: 'm', onConfirm: vi.fn(), onClose: vi.fn() }))
    const confirm = screen.getByText('Confirm')
    const cancel = screen.getByText('Cancel')
    expect(document.activeElement).toBe(confirm)
    fireEvent.keyDown(confirm, { key: 'ArrowLeft' })
    expect(document.activeElement).toBe(cancel)
    fireEvent.keyDown(cancel, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(confirm)
    fireEvent.keyDown(confirm, { key: 'Enter' })
    expect(document.activeElement).toBe(confirm)
  })

  it('CFD-03: hideCancel이면 Cancel 버튼 없음, 항목 빈 배열이면 목록 없음', () => {
    const { container } = render(h(ConfirmDialog, { title: 't', message: 'm', items: [], hideCancel: true, onConfirm: vi.fn(), onClose: vi.fn() }))
    expect(screen.queryByText('Cancel')).toBeNull()
    expect(container.querySelector('[class*="deleteList"]')).toBeNull()
  })

  it('CFD-04: Esc/X/Cancel/오버레이 클릭 → onClose, 모달 내부 클릭은 무시', () => {
    const onClose = vi.fn()
    const { container } = render(h(ConfirmDialog, { title: '제목', message: 'm', onConfirm: vi.fn(), onClose }))
    fireEvent.keyDown(window, { key: 'Escape' })
    fireEvent.click(screen.getByText('Cancel'))
    fireEvent.click(container.querySelector('[class*="closeBtn"]'))
    expect(onClose).toHaveBeenCalledTimes(3)
    fireEvent.click(screen.getByText('제목'))
    expect(onClose).toHaveBeenCalledTimes(3)
    fireEvent.click(container.firstChild)
    expect(onClose).toHaveBeenCalledTimes(4)
  })

  it('CFD-05: onConfirm 완료 후 busy 해제 (버튼 다시 활성)', async () => {
    let resolve
    const onConfirm = vi.fn(() => new Promise(r => { resolve = r }))
    render(h(ConfirmDialog, { title: 't', message: 'm', onConfirm, onClose: vi.fn() }))
    const btn = screen.getByText('Confirm')
    await act(async () => { fireEvent.click(btn) })
    expect(btn.disabled).toBe(true)
    await act(async () => { resolve() })
    await waitFor(() => expect(btn.disabled).toBe(false))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })
})

// ─── NewItemDialog ───────────────────────────────────────────────────────────
describe('NewItemDialog 커버리지', () => {
  it('NI-01: directory 타입 — 라벨/placeholder, 공백 이름은 제출 버튼 비활성', () => {
    const onConfirm = vi.fn()
    render(h(NewItemDialog, { type: 'directory', onConfirm, onClose: vi.fn() }))
    expect(screen.getByText('New Directory')).toBeTruthy()
    expect(screen.getByText('Directory name')).toBeTruthy()
    const input = screen.getByPlaceholderText('new_folder')
    expect(document.activeElement).toBe(input)
    expect(screen.getByText('Create').disabled).toBe(true)
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.submit(input.closest('form'))
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('NI-02: file 타입 — 이름 trim 후 onConfirm', async () => {
    const onConfirm = vi.fn().mockResolvedValue()
    render(h(NewItemDialog, { type: 'file', onConfirm, onClose: vi.fn() }))
    expect(screen.getByText('New File')).toBeTruthy()
    const input = screen.getByPlaceholderText('file.txt')
    fireEvent.change(input, { target: { value: '  a.txt  ' } })
    await act(async () => { fireEvent.click(screen.getByText('Create')) })
    expect(onConfirm).toHaveBeenCalledWith('a.txt')
  })

  it('NI-03: onConfirm 실패 시 오류 메시지 표시, 입력 수정 시 오류 해제', async () => {
    const onConfirm = vi.fn().mockRejectedValue('이미 존재함')
    render(h(NewItemDialog, { type: 'file', onConfirm, onClose: vi.fn() }))
    const input = screen.getByPlaceholderText('file.txt')
    fireEvent.change(input, { target: { value: 'dup.txt' } })
    await act(async () => { fireEvent.submit(input.closest('form')) })
    expect(screen.getByText('이미 존재함')).toBeTruthy()
    expect(input.className).toMatch(/inputError/)
    fireEvent.change(input, { target: { value: 'dup2.txt' } })
    expect(screen.queryByText('이미 존재함')).toBeNull()
  })

  it('NI-04: Cancel 버튼 → onClose', () => {
    const onClose = vi.fn()
    render(h(NewItemDialog, { type: 'file', onConfirm: vi.fn(), onClose }))
    fireEvent.click(screen.getByText('Cancel'))
    expect(onClose).toHaveBeenCalled()
  })

  it('NI-05: index.js / NewItemDialog.jsx 재export 동일 컴포넌트', () => {
    expect(indexExports.NewItemDialog).toBe(NewItemDialog)
    expect(indexExports.ConfirmDialog).toBe(ConfirmDialog)
    expect(indexExports.RenameDialog).toBe(RenameDialog)
    expect(indexExports.SearchDialog).toBe(SearchDialog)
    // TextEditor는 지연 로딩 대상이라 묶음 export에서 제외 (Todo #115)
    expect(indexExports.TextEditor).toBeUndefined()
    expect(NewItemDialogShim).toBe(NewItemDialog)
  })
})

// ─── RenameDialog ────────────────────────────────────────────────────────────
describe('RenameDialog 커버리지', () => {
  function setPanel(files, cursor = 0, cursorOnParent = false) {
    useFileStore.setState(s => ({
      activePanel: 'left',
      left: { ...s.left, path: '/d', files, cursor, cursorOnParent, showHidden: true, selected: new Set() },
    }))
  }

  it('RN-01: 커서 파일 없으면 렌더하지 않음', () => {
    setPanel([], 0, true)
    const { container } = render(h(RenameDialog, { onConfirm: vi.fn(), onClose: vi.fn() }))
    expect(container.innerHTML).toBe('')
  })

  it('RN-02: 확장자 제외 부분 선택, 새 이름 제출 시 onConfirm(path, trim)', () => {
    setPanel([file('report.txt')])
    const onConfirm = vi.fn()
    render(h(RenameDialog, { onConfirm, onClose: vi.fn() }))
    const input = screen.getByDisplayValue('report.txt')
    expect(input.selectionStart).toBe(0)
    expect(input.selectionEnd).toBe('report'.length)
    expect(screen.getByText('Original: report.txt')).toBeTruthy()
    fireEvent.change(input, { target: { value: ' new.txt ' } })
    fireEvent.submit(input.closest('form'))
    expect(onConfirm).toHaveBeenCalledWith('/d/report.txt', 'new.txt')
  })

  it('RN-03: 확장자 없는 파일은 전체 선택', () => {
    setPanel([file('Makefile', { extension: '' })])
    render(h(RenameDialog, { onConfirm: vi.fn(), onClose: vi.fn() }))
    const input = screen.getByDisplayValue('Makefile')
    expect(input.selectionEnd).toBe('Makefile'.length)
  })

  it('RN-04: 이름이 같으면 onConfirm 대신 onClose', () => {
    setPanel([file('a.txt')])
    const onConfirm = vi.fn(), onClose = vi.fn()
    render(h(RenameDialog, { onConfirm, onClose }))
    fireEvent.submit(screen.getByDisplayValue('a.txt').closest('form'))
    expect(onConfirm).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByText('Cancel'))
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('RN-06: 창이 열린 뒤 커서가 움직여도(복사 완료 새로 고침 등) 연 파일의 이름을 바꿈 (Todo #130-3)', () => {
    setPanel([file('a.txt'), file('b.txt'), file('x.txt')], 1)
    const onConfirm = vi.fn()
    render(h(RenameDialog, { onConfirm, onClose: vi.fn() }))
    act(() => { useFileStore.setState(s => ({ left: { ...s.left, cursor: 2 } })) })
    expect(screen.getByText('Original: b.txt')).toBeTruthy()
    act(() => { useFileStore.setState(s => ({ left: { ...s.left, cursor: 0, cursorOnParent: true } })) })
    const input = screen.getByDisplayValue('b.txt') // 커서가 [..]로 가도 창이 사라지지 않음
    fireEvent.change(input, { target: { value: 'b2.txt' } })
    fireEvent.submit(input.closest('form'))
    expect(onConfirm).toHaveBeenCalledWith('/d/b.txt', 'b2.txt')
  })

  it('RN-05: 빈 이름이면 Rename 버튼 비활성', () => {
    setPanel([file('a.txt')])
    render(h(RenameDialog, { onConfirm: vi.fn(), onClose: vi.fn() }))
    fireEvent.change(screen.getByDisplayValue('a.txt'), { target: { value: '  ' } })
    expect(screen.getByText('Rename', { selector: 'button' }).disabled).toBe(true)
  })
})

// ─── ShellCommandDialog ──────────────────────────────────────────────────────
describe('ShellCommandDialog 커버리지', () => {
  it('SH-01: 실행 성공 → 출력 표시, workDir 전달', async () => {
    api.RunShellCommand.mockResolvedValue('hello out')
    render(h(ShellCommandDialog, { workDir: 'C:\\work', onClose: vi.fn() }))
    expect(screen.getByText('C:\\work')).toBeTruthy()
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: ' echo hi ' } })
    await act(async () => { fireEvent.click(screen.getByText('실행')) })
    expect(api.RunShellCommand).toHaveBeenCalledWith('echo hi', 'C:\\work')
    const pre = screen.getByText('hello out')
    expect(pre.className).not.toMatch(/shellOutputError/)
  })

  it('SH-02: 실행 실패 → 오류 스타일로 메시지 표시', async () => {
    api.RunShellCommand.mockRejectedValue('exit status 1: boom')
    render(h(ShellCommandDialog, { workDir: '/w', onClose: vi.fn() }))
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'bad' } })
    await act(async () => { fireEvent.submit(input.closest('form')) })
    expect(screen.getByText('exit status 1: boom').className).toMatch(/shellOutputError/)
  })

  it('SH-03: 빈 출력은 "(출력 없음)"', async () => {
    api.RunShellCommand.mockResolvedValue('')
    render(h(ShellCommandDialog, { workDir: '/w', onClose: vi.fn() }))
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'true' } })
    await act(async () => { fireEvent.submit(input.closest('form')) })
    expect(screen.getByText('(출력 없음)')).toBeTruthy()
  })

  it('SH-04: 빈 명령은 실행하지 않음', async () => {
    render(h(ShellCommandDialog, { workDir: '/w', onClose: vi.fn() }))
    await act(async () => { fireEvent.submit(screen.getByRole('textbox').closest('form')) })
    expect(api.RunShellCommand).not.toHaveBeenCalled()
  })

  it('SH-05: ↑/↓ 히스토리 탐색 (최신 우선, 중복 제거, 끝에서 ↓는 비움)', async () => {
    api.RunShellCommand.mockResolvedValue('ok')
    render(h(ShellCommandDialog, { workDir: '/w', onClose: vi.fn() }))
    const input = screen.getByRole('textbox')
    for (const c of ['one', 'two', 'one']) {
      fireEvent.change(input, { target: { value: c } })
      await act(async () => { fireEvent.submit(input.closest('form')) })
    }
    // 히스토리: ['one', 'two']
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    expect(input.value).toBe('one')
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    expect(input.value).toBe('two')
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    expect(input.value).toBe('two')
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(input.value).toBe('one')
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(input.value).toBe('')
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(input.value).toBe('')
  })

  it('SH-06: 닫기 버튼 → onClose', () => {
    const onClose = vi.fn()
    render(h(ShellCommandDialog, { workDir: '/w', onClose }))
    fireEvent.click(screen.getByText('닫기'))
    expect(onClose).toHaveBeenCalled()
  })

  it('SH-07: 실행 중에는 입력/버튼 비활성, "..." 표시', async () => {
    let resolve
    api.RunShellCommand.mockImplementation(() => new Promise(r => { resolve = r }))
    render(h(ShellCommandDialog, { workDir: '/w', onClose: vi.fn() }))
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'sleep' } })
    await act(async () => { fireEvent.submit(input.closest('form')) })
    expect(screen.getByText('...')).toBeTruthy()
    expect(input.disabled).toBe(true)
    await act(async () => { resolve('done') })
    expect(screen.getByText('done')).toBeTruthy()
  })
})

// ─── SearchDialog ────────────────────────────────────────────────────────────
describe('SearchDialog 커버리지', () => {
  let navigate, navigateAndFocus
  beforeEach(() => {
    navigate = vi.fn()
    navigateAndFocus = vi.fn()
    useFileStore.setState(s => ({
      activePanel: 'left',
      navigate, navigateAndFocus,
      searchState: { query: '', recursive: true, results: [] },
      left: { ...s.left, path: 'C:\\root', files: [], cursor: 0 },
    }))
  })

  const results = [
    { name: 'sub', path: 'C:\\root\\sub', isDir: true, size: 0, extension: '' },
    { name: 'note.txt', path: 'C:\\root\\sub\\note.txt', isDir: false, size: 2048, extension: '.txt' },
    { name: 'app.exe', path: '/u/app.exe', isDir: false, size: 0, extension: '.exe' },
  ]

  async function doSearch(q = 'note', found = results) {
    api.SearchFiles.mockResolvedValue(found)
    render(h(SearchDialog, { onClose: vi.fn(), onView: vi.fn(), onEdit: vi.fn() }))
    const input = screen.getByPlaceholderText(/Search pattern/)
    fireEvent.change(input, { target: { value: q } })
    await act(async () => { fireEvent.submit(input.closest('form')) })
    return input
  }

  it('SD-01: 검색 → SearchFiles(path, trim(query), recursive) 호출, 결과/크기 표시, store 저장', async () => {
    await doSearch(' note ')
    expect(api.SearchFiles).toHaveBeenCalledWith('C:\\root', 'note', true)
    expect(screen.getByText('3 results')).toBeTruthy()
    expect(screen.getByText('<DIR>')).toBeTruthy()
    expect(screen.getByText('2.0 KB')).toBeTruthy()
    expect(screen.getByText('0 B')).toBeTruthy()
    expect(useFileStore.getState().searchState.results).toHaveLength(3)
    expect(useFileStore.getState().searchState.query).toBe('note')
    expect(screen.getByText('In: C:\\root')).toBeTruthy()
  })

  it('SD-02: 하위 폴더 체크 해제 시 recursive=false로 검색, store 반영', async () => {
    api.SearchFiles.mockResolvedValue([])
    render(h(SearchDialog, { onClose: vi.fn() }))
    fireEvent.click(screen.getByRole('checkbox'))
    expect(useFileStore.getState().searchState.recursive).toBe(false)
    const input = screen.getByPlaceholderText(/Search pattern/)
    fireEvent.change(input, { target: { value: 'zzz' } })
    await act(async () => { fireEvent.submit(input.closest('form')) })
    expect(api.SearchFiles).toHaveBeenCalledWith('C:\\root', 'zzz', false)
    expect(screen.getByText('No files found matching "zzz"')).toBeTruthy()
  })

  it('SD-03: 단일 결과는 "1 result", null 결과는 빈 목록 처리', async () => {
    await doSearch('a', [results[2]])
    expect(screen.getByText('1 result')).toBeTruthy()
    cleanup()
    await doSearch('b', null)
    expect(screen.getByText('No files found matching "b"')).toBeTruthy()
  })

  it('SD-04: 폴더 결과 클릭 → navigate 후 닫기', async () => {
    api.SearchFiles.mockResolvedValue(results)
    const onClose = vi.fn()
    render(h(SearchDialog, { onClose }))
    const input = screen.getByPlaceholderText(/Search pattern/)
    fireEvent.change(input, { target: { value: 'x' } })
    await act(async () => { fireEvent.submit(input.closest('form')) })
    fireEvent.click(screen.getByTitle('C:\\root\\sub'))
    expect(navigate).toHaveBeenCalledWith('left', 'C:\\root\\sub')
    expect(onClose).toHaveBeenCalled()
  })

  it('SD-05: 파일 결과 클릭 → 부모 폴더로 이동 + 파일 포커스 (Windows/Unix 구분자)', async () => {
    api.SearchFiles.mockResolvedValue(results)
    render(h(SearchDialog, { onClose: vi.fn() }))
    const input = screen.getByPlaceholderText(/Search pattern/)
    fireEvent.change(input, { target: { value: 'x' } })
    await act(async () => { fireEvent.submit(input.closest('form')) })
    fireEvent.click(screen.getByTitle('C:\\root\\sub\\note.txt'))
    expect(navigateAndFocus).toHaveBeenLastCalledWith('left', 'C:\\root\\sub', 'note.txt')
    fireEvent.click(screen.getByTitle('/u/app.exe'))
    expect(navigateAndFocus).toHaveBeenLastCalledWith('left', '/u', 'app.exe')
  })

  it('SD-06: 텍스트 파일에만 보기/편집 버튼, 실행 버튼은 모든 파일 — 클릭은 행 이동을 막음', async () => {
    api.SearchFiles.mockResolvedValue(results)
    const onView = vi.fn(), onEdit = vi.fn(), onClose = vi.fn()
    render(h(SearchDialog, { onClose, onView, onEdit }))
    const input = screen.getByPlaceholderText(/Search pattern/)
    fireEvent.change(input, { target: { value: 'x' } })
    await act(async () => { fireEvent.submit(input.closest('form')) })
    expect(screen.getAllByTitle('내장 뷰어로 보기')).toHaveLength(1)
    expect(screen.getAllByTitle('내장 에디터로 편집')).toHaveLength(1)
    const runs = screen.getAllByTitle('파일 실행')
    expect(runs).toHaveLength(2)
    fireEvent.click(screen.getByTitle('내장 뷰어로 보기'))
    expect(onView).toHaveBeenCalledWith(results[1])
    fireEvent.click(screen.getByTitle('내장 에디터로 편집'))
    expect(onEdit).toHaveBeenCalledWith(results[1])
    fireEvent.click(runs[1])
    expect(api.OpenFile).toHaveBeenCalledWith('/u/app.exe')
    expect(onClose).not.toHaveBeenCalled()
    expect(navigateAndFocus).not.toHaveBeenCalled()
  })

  it('SD-07: 저장된 검색 상태 복원 (query/결과), 입력 변경 시 store 갱신', () => {
    useFileStore.setState({ searchState: { query: 'keep', recursive: false, results: [results[1]] } })
    render(h(SearchDialog, { onClose: vi.fn() }))
    const input = screen.getByDisplayValue('keep')
    expect(screen.getByRole('checkbox').checked).toBe(false)
    expect(screen.getByText('1 result')).toBeTruthy()
    fireEvent.change(input, { target: { value: 'keep2' } })
    expect(useFileStore.getState().searchState.query).toBe('keep2')
  })

  it('SD-08: SearchFiles 실패 시 콘솔 에러, 검색 상태 해제', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    api.SearchFiles.mockRejectedValue(new Error('fail'))
    render(h(SearchDialog, { onClose: vi.fn() }))
    const input = screen.getByPlaceholderText(/Search pattern/)
    fireEvent.change(input, { target: { value: 'q' } })
    await act(async () => { fireEvent.submit(input.closest('form')) })
    expect(err).toHaveBeenCalled()
    expect(screen.getByText('No files found matching "q"')).toBeTruthy()
    err.mockRestore()
  })

  it('SD-09: 빈 query 제출은 무시', async () => {
    render(h(SearchDialog, { onClose: vi.fn() }))
    await act(async () => { fireEvent.submit(screen.getByPlaceholderText(/Search pattern/).closest('form')) })
    expect(api.SearchFiles).not.toHaveBeenCalled()
  })
})
