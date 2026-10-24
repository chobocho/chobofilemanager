import { describe, it, expect, vi, afterEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, cleanup, act, waitFor } from '@testing-library/react'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

vi.mock('../wailsjs/runtime', () => ({ default: { RunStarlarkFile: vi.fn() } }))

import TextEditor from './TextEditor.jsx'
import FileViewer from './FileViewer.jsx'
import { useFileStore } from '../stores/fileStore'
import {
  findSurfaceWithText, textOf, typeText, keyIn, isReadOnly, select, selectionOf,
} from '../test/textSurface.js'

const h = React.createElement
const __dirname = dirname(fileURLToPath(import.meta.url))
Element.prototype.scrollIntoView = vi.fn()

// ─── Todo #108: 텍스트 영역 구현(textarea → CodeMirror 등)과 무관한 뷰어/에디터 동작 계약 ───
// 모든 조작은 ../test/textSurface.js 드라이버로만 수행 — 구현 교체 시 드라이버만 바꿈

// shown: 텍스트 영역에 보여야 하는 내용 (기본은 text, CRLF 파일은 LF로 표시)
async function openEditor(text, extra = {}, shown = text) {
  const writeFile = vi.fn().mockResolvedValue(undefined)
  const readFile = vi.fn().mockResolvedValue(text)
  useFileStore.setState({ readFile, writeFile })
  const props = { path: '/x/a.txt', onClose: vi.fn(), onSwitchToViewer: vi.fn(), ...extra }
  render(h(TextEditor, props))
  const el = await findSurfaceWithText(shown)
  return { el, writeFile, readFile, props }
}

async function openViewer(text, extra = {}) {
  const readFile = vi.fn().mockResolvedValue(text)
  useFileStore.setState({ readFile, readImage: vi.fn() })
  const props = { path: '/x/a.txt', onClose: vi.fn(), onSwitchToEditor: vi.fn(), ...extra }
  render(h(FileViewer, props))
  const el = await findSurfaceWithText(text)
  return { el, readFile, props }
}

function ctrlS() {
  fireEvent.keyDown(window, { key: 's', ctrlKey: true })
}

describe('텍스트 영역 계약 — 에디터 (CT)', () => {
  afterEach(() => cleanup())

  it('CT-01: 편집 내용이 그대로(현재 인코딩과 함께) 저장됨', async () => {
    const { el, writeFile } = await openEditor('line1\nline2')
    typeText(el, 'line1\nchanged\nline3')
    await act(async () => { ctrlS() })
    expect(writeFile).toHaveBeenCalledWith('/x/a.txt', 'line1\nchanged\nline3', 'auto')
  })

  it('CT-02: 편집하면 줄 수/문자 수/미저장 표시가 갱신되고, 저장 후 미저장 표시가 사라짐', async () => {
    const { el } = await openEditor('a')
    expect(screen.getByText('1 lines')).toBeTruthy()
    typeText(el, 'a\nbb\nccc')
    expect(screen.getByText('3 lines')).toBeTruthy()
    expect(screen.getByText('8 chars')).toBeTruthy()
    expect(screen.getByText('Unsaved changes')).toBeTruthy()
    await act(async () => { ctrlS() })
    expect(screen.queryByText('Unsaved changes')).toBeNull()
  })

  it('CT-03: 원래 내용으로 되돌리면 미저장 상태가 아님 (X로 바로 닫힘)', async () => {
    const { el, props } = await openEditor('abc')
    typeText(el, 'abcd')
    typeText(el, 'abc')
    fireEvent.click(screen.getByTitle('Close (Esc)'))
    expect(props.onClose).toHaveBeenCalledTimes(1)
  })

  it('CT-04: 한글/이모지 내용이 손실 없이 저장되고 문자 수는 UTF-16 길이', async () => {
    const text = '한글 텍스트\n😀 이모지'
    const { el, writeFile } = await openEditor(text)
    expect(screen.getByText(`${text.length} chars`)).toBeTruthy()
    typeText(el, text + '!')
    await act(async () => { ctrlS() })
    expect(writeFile).toHaveBeenCalledWith('/x/a.txt', text + '!', 'auto')
  })

  it('CT-05: 큰 파일(2만 줄) 로드 후 마지막 줄 검색 시 커서가 마지막 줄로 이동', async () => {
    const lines = Array.from({ length: 20000 }, (_, i) => `line ${i + 1}`)
    lines[19999] = 'needle-at-the-end'
    const text = lines.join('\n')
    await openEditor(text)
    expect(screen.getByText('20000 lines')).toBeTruthy()
    fireEvent.keyDown(window, { key: 'f', ctrlKey: true })
    const input = screen.getByPlaceholderText(/검색/)
    fireEvent.change(input, { target: { value: 'needle-at' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(screen.getByText('Ln 20000, Col 1')).toBeTruthy()
  })

  it('CT-06: 선택 영역에서 Tab은 선택을 공백 2칸으로 교체', async () => {
    vi.useFakeTimers()
    try {
      useFileStore.setState({ readFile: vi.fn().mockResolvedValue('abcdef'), writeFile: vi.fn() })
      render(h(TextEditor, { path: '/x/a.txt', onClose: vi.fn() }))
      await act(async () => { await vi.runAllTimersAsync() })
      const el = document.querySelector('[data-text-surface]')
      select(el, 1, 4)
      keyIn(el, { key: 'Tab' })
      expect(textOf(el)).toBe('a  ef')
      act(() => { vi.runAllTimers() })
      expect(selectionOf(el)).toEqual([3, 3])
    } finally {
      vi.useRealTimers()
    }
  })

  it('CT-07: 로드 후 텍스트 영역에 포커스, 검색창 Esc 후 다시 텍스트 영역으로', async () => {
    const { el } = await openEditor('focus me')
    await waitFor(() => expect(document.activeElement).toBe(el))
    fireEvent.keyDown(window, { key: 'f', ctrlKey: true })
    const input = screen.getByPlaceholderText(/검색/)
    await waitFor(() => expect(document.activeElement).toBe(input))
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(document.activeElement).toBe(el)
  })

  it('CT-08: 인코딩 변경 시 새 인코딩으로 다시 읽은 내용으로 교체', async () => {
    const { readFile } = await openEditor('first')
    readFile.mockResolvedValueOnce('second')
    await act(async () => { fireEvent.click(screen.getByTitle(/인코딩: Auto/)) })
    await findSurfaceWithText('second')
    expect(readFile).toHaveBeenLastCalledWith('/x/a.txt', 'utf-8')
  })

  it('CT-09: 커서 위치(Ln/Col)는 선택 시작 기준', async () => {
    const { el } = await openEditor('ab\ncdef\ng')
    select(el, 5, 5)
    expect(screen.getByText('Ln 2, Col 3')).toBeTruthy()
    select(el, 8, 8)
    expect(screen.getByText('Ln 3, Col 1')).toBeTruthy()
  })
})

describe('텍스트 영역 계약 — 줄바꿈 (CT, Todo #112)', () => {
  afterEach(() => cleanup())

  // 브라우저 textarea/CodeMirror 모두 편집 결과를 LF로 돌려주므로, 원래 CRLF였던 파일은 저장 시 CRLF로 되돌려야 함
  it('CT-10: CRLF 파일을 편집해 저장해도 CRLF 유지', async () => {
    const { el, writeFile } = await openEditor('a\r\nb', {}, 'a\nb')
    typeText(el, 'a\nb2')
    await act(async () => { ctrlS() })
    expect(writeFile).toHaveBeenCalledWith('/x/a.txt', 'a\r\nb2', 'auto')
  })

  it('CT-11: LF 파일은 LF 그대로 저장', async () => {
    const { el, writeFile } = await openEditor('a\nb')
    typeText(el, 'a\nb2')
    await act(async () => { ctrlS() })
    expect(writeFile).toHaveBeenCalledWith('/x/a.txt', 'a\nb2', 'auto')
  })

  it('CT-12: CRLF 파일을 열기만 하면 미저장 상태가 아님 (X로 바로 닫힘)', async () => {
    const { props } = await openEditor('a\r\nb', {}, 'a\nb')
    fireEvent.click(screen.getByTitle('Close (Esc)'))
    expect(props.onClose).toHaveBeenCalledTimes(1)
  })

  it('CT-13: CRLF 파일 줄 수/문자 수는 줄바꿈을 1문자로 계산', async () => {
    await openEditor('ab\r\ncd\r\n', {}, 'ab\ncd\n')
    expect(screen.getByText('3 lines')).toBeTruthy()
    expect(screen.getByText('6 chars')).toBeTruthy()
  })

  it('CT-14: 뷰어도 CRLF를 LF로 표시', async () => {
    useFileStore.setState({ readFile: vi.fn().mockResolvedValue('x\r\ny'), readImage: vi.fn() })
    render(h(FileViewer, { path: '/x/a.txt', onClose: vi.fn() }))
    await findSurfaceWithText('x\ny')
  })
})

describe('텍스트 영역 계약 — 뷰어 (CT)', () => {
  afterEach(() => cleanup())

  it('CT-20: 뷰어는 읽기 전용 — 편집 시도해도 내용 유지', async () => {
    const { el } = await openViewer('read only text')
    expect(isReadOnly(el)).toBe(true)
    typeText(el, 'hacked')
    await act(async () => {})
    expect(textOf(document.querySelector('[data-text-surface]'))).toBe('read only text')
  })

  it('CT-21: 글자 크기/줄 바꿈 변경은 내용을 바꾸지 않음', async () => {
    await openViewer('x\ny')
    fireEvent.click(screen.getByTitle(/Word Wrap/i))
    fireEvent.click(screen.getAllByTitle(/크게|확대|Larger|Increase/i)[0])
    expect(textOf(document.querySelector('[data-text-surface]'))).toBe('x\ny')
  })

  it('CT-22: 큰 파일(2만 줄) 로드 시 줄 수 표시', async () => {
    const text = Array.from({ length: 20000 }, (_, i) => `row ${i}`).join('\n')
    await openViewer(text)
    expect(screen.getByText('20000 lines')).toBeTruthy()
  })

  it('CT-23: 검색은 대소문자 무시, 일치 항목 선택', async () => {
    const { el } = await openViewer('alpha BETA gamma')
    fireEvent.keyDown(window, { key: 'f', ctrlKey: true })
    const input = screen.getByPlaceholderText(/검색/)
    fireEvent.change(input, { target: { value: 'beta' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(selectionOf(el)).toEqual([6, 10])
  })

  it('CT-24: 로드 후 텍스트 영역에 포커스', async () => {
    const { el } = await openViewer('focus')
    await waitFor(() => expect(document.activeElement).toBe(el))
  })
})

describe('드라이버 사용 강제 (CT)', () => {
  it('CT-90: 뷰어/에디터 테스트는 textarea를 직접 다루지 않음 (드라이버 경유)', () => {
    const allowed = new Set(['textSurface.contract.test.js'])
    const offenders = []
    for (const f of readdirSync(__dirname)) {
      if (!/^(TextEditor|FileViewer).*\.test\.js$/.test(f) || allowed.has(f)) continue
      const src = readFileSync(join(__dirname, f), 'utf8')
      if (/querySelector\('textarea'\)|ByDisplayValue|\.selectionStart|\.setSelectionRange\(/.test(src)) offenders.push(f)
    }
    expect(offenders).toEqual([])
  })
})
