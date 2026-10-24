import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import TextEditor from './TextEditor.jsx'
import { useFileStore } from '../stores/fileStore'
import api from '../wailsjs/runtime'

vi.mock('../wailsjs/runtime', () => ({ default: { RunStarlarkFile: vi.fn() } }))

const h = React.createElement

let readFile, writeFile
async function open(path = '/x/a.txt', props = {}, text = 'hello\nworld\nHello again') {
  readFile = vi.fn().mockResolvedValue(text)
  writeFile = vi.fn().mockResolvedValue(undefined)
  useFileStore.setState({ readFile, writeFile })
  const onClose = vi.fn(), onSwitchToViewer = vi.fn()
  const r = render(h(TextEditor, { path, onClose, onSwitchToViewer, ...props }))
  await act(async () => {})
  const ta = r.container.querySelector('textarea')
  return { ...r, ta, onClose, onSwitchToViewer }
}

describe('TextEditor 커버리지 (TEC)', () => {
  beforeEach(() => { vi.clearAllMocks() })
  afterEach(() => { cleanup(); vi.restoreAllMocks?.() })

  it('TEC-01: 로드 후 줄 수/문자 수/인코딩 표시', async () => {
    await open()
    expect(readFile).toHaveBeenCalledWith('/x/a.txt', 'auto')
    expect(screen.getByText('3 lines')).toBeTruthy()
    expect(screen.getByText('23 chars')).toBeTruthy()
    expect(screen.getAllByText('Auto').length).toBeGreaterThan(0)
  })

  it('TEC-02: 읽기 오류 표시, 오류 상태에서 Ctrl+S는 저장하지 않음', async () => {
    readFile = vi.fn().mockRejectedValue('read fail')
    writeFile = vi.fn()
    useFileStore.setState({ readFile, writeFile })
    render(h(TextEditor, { path: '/x/a.txt', onClose: vi.fn() }))
    await act(async () => {})
    expect(screen.getByText(/read fail/)).toBeTruthy()
    fireEvent.keyDown(window, { key: 's', ctrlKey: true })
    expect(writeFile).not.toHaveBeenCalled()
  })

  it('TEC-03: 편집 → dirty 표시, Ctrl+S 저장 후 dirty 해제', async () => {
    const { ta } = await open()
    fireEvent.change(ta, { target: { value: 'changed' } })
    expect(screen.getByText('Unsaved changes')).toBeTruthy()
    await act(async () => { fireEvent.keyDown(window, { key: 's', ctrlKey: true }) })
    expect(writeFile).toHaveBeenCalledWith('/x/a.txt', 'changed', 'auto')
    expect(screen.queryByText('Unsaved changes')).toBeNull()
  })

  it('TEC-04: 저장 실패 시 상태 표시줄에 오류 표시', async () => {
    const { ta } = await open()
    writeFile.mockRejectedValue(new Error('disk full'))
    fireEvent.change(ta, { target: { value: 'x' } })
    await act(async () => { fireEvent.click(screen.getByText('Save')) })
    expect(screen.getByText('저장 실패: disk full')).toBeTruthy()
  })

  it('TEC-05: Tab 키는 공백 2칸 삽입', async () => {
    vi.useFakeTimers()
    try {
      readFile = vi.fn().mockResolvedValue('ab')
      useFileStore.setState({ readFile, writeFile: vi.fn() })
      const { container } = render(h(TextEditor, { path: '/x/a.txt', onClose: vi.fn() }))
      await act(async () => { await vi.runAllTimersAsync() })
      const ta = container.querySelector('textarea')
      ta.setSelectionRange(1, 1)
      fireEvent.keyDown(ta, { key: 'Tab' })
      expect(ta.value).toBe('a  b')
      act(() => { vi.runAllTimers() })
      expect(ta.selectionStart).toBe(3)
    } finally {
      vi.useRealTimers()
    }
  })

  it('TEC-06: 커서 이동 시 Ln/Col 갱신', async () => {
    const { ta } = await open()
    ta.setSelectionRange(8, 8)
    fireEvent.keyUp(ta, { key: 'ArrowRight' })
    expect(screen.getByText('Ln 2, Col 3')).toBeTruthy()
    ta.setSelectionRange(0, 0)
    fireEvent.click(ta)
    expect(screen.getByText('Ln 1, Col 1')).toBeTruthy()
  })

  it('TEC-07: Ctrl+F 검색 — Enter 다음 / 줄바꿈 순환 / Shift+Enter 이전', async () => {
    const { ta } = await open()
    fireEvent.keyDown(window, { key: 'f', ctrlKey: true })
    const input = screen.getByPlaceholderText(/검색/)
    fireEvent.change(input, { target: { value: 'hello' } })
    ta.setSelectionRange(0, 0)
    fireEvent.keyDown(input, { key: 'Enter' })
    expect([ta.selectionStart, ta.selectionEnd]).toEqual([0, 5])
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(ta.selectionStart).toBe(12)
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(ta.selectionStart).toBe(0) // wrap
    fireEvent.click(screen.getByTitle('다음 (Enter)'))
    expect(ta.selectionStart).toBe(12)
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })
    expect(ta.selectionStart).toBe(0)
    ta.setSelectionRange(23, 23)
    fireEvent.click(screen.getByTitle('이전 (Shift+Enter)'))
    expect(ta.selectionStart).toBe(12)
  })

  // findPrev: startIndex = selectionStart-1 이 0으로 clamp되어 lastIndexOf(q, 0)이 다시 0 위치를 찾음
  it('TEC-07b: 첫 번째 일치 위치에서 Shift+Enter 시 마지막 일치로 순환 (Todo #107)', async () => {
    const { ta } = await open()
    fireEvent.keyDown(window, { key: 'f', ctrlKey: true })
    const input = screen.getByPlaceholderText(/검색/)
    fireEvent.change(input, { target: { value: 'hello' } })
    ta.setSelectionRange(0, 5)
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })
    expect(ta.selectionStart).toBe(12)
  })

  it('TEC-08: 검색 결과 없음 → noMatch 클래스 후 600ms 뒤 해제', async () => {
    await open()
    fireEvent.click(screen.getByTitle('검색 (Ctrl+F)'))
    const input = screen.getByPlaceholderText(/검색/)
    vi.useFakeTimers()
    try {
      fireEvent.change(input, { target: { value: 'zzz' } })
      const before = input.className
      fireEvent.keyDown(input, { key: 'Enter' })
      expect(input.className).not.toBe(before)
      fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })
      act(() => { vi.advanceTimersByTime(700) })
      expect(input.className).toBe(before)
    } finally {
      vi.useRealTimers()
    }
  })

  it('TEC-09: 검색창 Esc / 닫기 버튼 / window Esc로 닫힘 (에디터는 유지)', async () => {
    const { onClose } = await open()
    fireEvent.keyDown(window, { key: 'f', ctrlKey: true })
    fireEvent.keyDown(screen.getByPlaceholderText(/검색/), { key: 'Escape' })
    expect(screen.queryByPlaceholderText(/검색/)).toBeNull()
    fireEvent.keyDown(window, { key: 'f', ctrlKey: true })
    fireEvent.click(screen.getByTitle('닫기 (Esc)'))
    expect(screen.queryByPlaceholderText(/검색/)).toBeNull()
    fireEvent.keyDown(window, { key: 'f', ctrlKey: true })
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByPlaceholderText(/검색/)).toBeNull()
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('TEC-10: 빈 검색어로 Enter는 아무 동작 없음', async () => {
    const { ta } = await open()
    fireEvent.keyDown(window, { key: 'f', ctrlKey: true })
    ta.setSelectionRange(2, 2)
    fireEvent.keyDown(screen.getByPlaceholderText(/검색/), { key: 'Enter' })
    expect(ta.selectionStart).toBe(2)
  })

  it('TEC-11: 인코딩 순환 — 깨끗하면 바로 변경 후 재로딩', async () => {
    await open()
    await act(async () => { fireEvent.click(screen.getByTitle(/인코딩: Auto/)) })
    expect(readFile).toHaveBeenLastCalledWith('/x/a.txt', 'utf-8')
    expect(screen.getByTitle(/인코딩: UTF-8/)).toBeTruthy()
  })

  it('TEC-12: 인코딩 순환 — dirty면 confirm, 취소 시 유지 / 확인 시 변경', async () => {
    const { ta } = await open()
    fireEvent.change(ta, { target: { value: 'edited' } })
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    fireEvent.click(screen.getByTitle(/인코딩: Auto/))
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(screen.getByTitle(/인코딩: Auto/)).toBeTruthy()
    confirm.mockReturnValue(true)
    await act(async () => { fireEvent.click(screen.getByTitle(/인코딩: Auto/)) })
    expect(screen.getByTitle(/인코딩: UTF-8/)).toBeTruthy()
    confirm.mockRestore()
  })

  it('TEC-13: dirty 상태 닫기 → 확인창, 취소/저장 안 함/저장', async () => {
    const { ta, onClose } = await open()
    fireEvent.change(ta, { target: { value: 'edited' } })
    fireEvent.click(screen.getByTitle('Close (Esc)'))
    expect(screen.getByText('저장하지 않은 변경사항')).toBeTruthy()
    fireEvent.click(screen.getByText('취소'))
    expect(screen.queryByText('저장하지 않은 변경사항')).toBeNull()
    fireEvent.click(screen.getByTitle('Close (Esc)'))
    fireEvent.keyDown(window, { key: 'Escape' }) // Esc는 확인창만 닫음
    expect(screen.queryByText('저장하지 않은 변경사항')).toBeNull()
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(screen.getByTitle('Close (Esc)'))
    await act(async () => { fireEvent.click(screen.getByText('저장')) })
    expect(writeFile).toHaveBeenCalledWith('/x/a.txt', 'edited', 'auto')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('TEC-14: dirty 상태 F3 → 확인창 → 저장 안 함 → 뷰어 전환', async () => {
    const { ta, onSwitchToViewer, onClose } = await open()
    fireEvent.change(ta, { target: { value: 'edited' } })
    fireEvent.keyDown(window, { key: 'F3' })
    fireEvent.click(screen.getByText('저장 안 함'))
    expect(onSwitchToViewer).toHaveBeenCalledTimes(1)
    expect(writeFile).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('TEC-15: 저장 후 나가기에서 저장 실패 시 확인창만 닫고 머무름', async () => {
    const { ta, onClose } = await open()
    writeFile.mockRejectedValue('nope')
    fireEvent.change(ta, { target: { value: 'edited' } })
    fireEvent.click(screen.getByTitle('Close (Esc)'))
    await act(async () => { fireEvent.click(screen.getByText('저장')) })
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.queryByText('저장하지 않은 변경사항')).toBeNull()
    expect(screen.getByText('저장 실패: nope')).toBeTruthy()
  })

  it('TEC-16: 깨끗한 상태 뷰어 버튼 → 바로 전환', async () => {
    const { onSwitchToViewer } = await open()
    fireEvent.click(screen.getByTitle('뷰어로 열기 (F3)'))
    expect(onSwitchToViewer).toHaveBeenCalledTimes(1)
  })

  it('TEC-17: .star 파일 Run 버튼 → RunStarlarkFile 결과 출력, 닫기', async () => {
    api.RunStarlarkFile.mockResolvedValue('hi\n')
    await open('/s/x.star')
    expect(screen.getByText('Starlark')).toBeTruthy()
    await act(async () => { fireEvent.click(screen.getByTitle(/Starlark 스크립트 실행/)) })
    expect(api.RunStarlarkFile).toHaveBeenCalledWith('/s/x.star')
    expect(screen.getByText('출력')).toBeTruthy()
    expect(document.querySelector('pre').textContent).toBe('hi\n')
    fireEvent.click(screen.getByTitle('닫기'))
    expect(screen.queryByText('출력')).toBeNull()
  })

  it('TEC-18: Starlark F5 / Ctrl+Enter 실행, 빈 결과는 (출력 없음), 오류는 오류: 표시', async () => {
    api.RunStarlarkFile.mockResolvedValue('')
    const { ta } = await open('/s/x.bzl')
    await act(async () => { fireEvent.keyDown(window, { key: 'F5' }) })
    expect(screen.getByText('(출력 없음)')).toBeTruthy()
    api.RunStarlarkFile.mockRejectedValue('bad')
    await act(async () => { fireEvent.keyDown(ta, { key: 'Enter', ctrlKey: true }) })
    expect(screen.getByText('오류: bad')).toBeTruthy()
  })

  it('TEC-19: 텍스트 파일에서는 F5가 실행하지 않음, Run 버튼 없음', async () => {
    await open()
    fireEvent.keyDown(window, { key: 'F5' })
    expect(api.RunStarlarkFile).not.toHaveBeenCalled()
    expect(screen.queryByText('Run')).toBeNull()
  })

  it('TEC-20: IME 조합 중 키는 무시', async () => {
    const { onClose } = await open()
    fireEvent.keyDown(window, { key: 'Escape', isComposing: true })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('TEC-21: textarea 스크롤 시 줄번호 스크롤 동기화', async () => {
    const { ta, container } = await open()
    ta.scrollTop = 40
    fireEvent.scroll(ta)
    const ln = container.querySelector('[aria-hidden]')
    expect(ln.scrollTop).toBe(40)
  })
})
