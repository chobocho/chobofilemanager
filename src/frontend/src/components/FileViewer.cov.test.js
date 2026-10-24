import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import FileViewer from './FileViewer.jsx'
import { useFileStore } from '../stores/fileStore'
import { getSurface, isReadOnly, selectionOf, setSelectionQuiet, textOf } from '../test/textSurface.js'

vi.mock('../wailsjs/runtime', () => ({ default: {} }))

const h = React.createElement
Element.prototype.scrollIntoView = vi.fn()

let readFile, readImage
async function open(path = '/x/a.txt', props = {}, text = 'hello\nworld\nHello again') {
  readFile = vi.fn().mockResolvedValue(text)
  readImage = vi.fn().mockResolvedValue('data:image/png;base64,AA')
  useFileStore.setState({ readFile, readImage })
  const onClose = vi.fn(), onSwitchToEditor = vi.fn(), onChangePath = vi.fn()
  const r = render(h(FileViewer, { path, onClose, onSwitchToEditor, onChangePath, ...props }))
  await act(async () => {})
  const ta = getSurface(r.container)
  return { ...r, ta, onClose, onSwitchToEditor, onChangePath }
}

describe('FileViewer 커버리지 (FVC)', () => {
  afterEach(() => cleanup())

  it('FVC-01: 텍스트 로드 — 읽기 전용, 상태 표시줄 정보', async () => {
    const { ta } = await open()
    expect(readFile).toHaveBeenCalledWith('/x/a.txt', 'auto')
    expect(isReadOnly(ta)).toBe(true)
    expect(screen.getByText('READ ONLY')).toBeTruthy()
    expect(screen.getByText('3 lines')).toBeTruthy()
    expect(screen.getByText('23 chars')).toBeTruthy()
    expect(screen.getByText(/View Mode/)).toBeTruthy()
  })

  it('FVC-02: 읽기 오류 표시', async () => {
    readFile = vi.fn().mockRejectedValue('nope')
    useFileStore.setState({ readFile, readImage: vi.fn() })
    render(h(FileViewer, { path: '/x/a.txt', onClose: vi.fn() }))
    await act(async () => {})
    expect(screen.getByText(/nope/)).toBeTruthy()
  })

  it('FVC-03: 글자 크기 +/- 버튼, 범위 제한(10~28)', async () => {
    await open()
    expect(screen.getAllByText('13px').length).toBe(2)
    fireEvent.click(screen.getByTitle('글자 크게 (A+)'))
    expect(screen.getAllByText('14px').length).toBe(2)
    for (let i = 0; i < 20; i++) fireEvent.click(screen.getByTitle('글자 작게 (A-)'))
    expect(screen.getAllByText('10px').length).toBe(2)
  })

  it('FVC-04: Word Wrap 토글 → WRAP 표시, 줄번호 숨김', async () => {
    const { ta, container } = await open()
    expect(container.querySelector('[aria-hidden]')).toBeTruthy()
    fireEvent.click(screen.getByTitle('자동 줄 바꿈 (Word Wrap)'))
    expect(screen.getByText('WRAP')).toBeTruthy()
    expect(ta.style.whiteSpace).toBe('pre-wrap')
    expect(container.querySelector('[aria-hidden]')).toBeNull()
  })

  it('FVC-05: 인코딩 버튼 클릭 → 다음 인코딩으로 재로딩', async () => {
    await open()
    await act(async () => { fireEvent.click(screen.getByTitle(/인코딩: Auto/)) })
    expect(readFile).toHaveBeenLastCalledWith('/x/a.txt', 'utf-8')
    expect(screen.getByTitle(/인코딩: UTF-8/)).toBeTruthy()
  })

  it('FVC-06: Ctrl+F 검색 — Enter 다음/순환, Shift+Enter 이전, 버튼', async () => {
    const { ta } = await open()
    fireEvent.keyDown(window, { key: 'f', ctrlKey: true })
    const input = screen.getByPlaceholderText(/검색/)
    fireEvent.change(input, { target: { value: 'HELLO' } })
    setSelectionQuiet(ta, 0, 0)
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(selectionOf(ta)).toEqual([0, 5])
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(selectionOf(ta)[0]).toBe(12)
    fireEvent.click(screen.getByTitle('다음 (Enter)'))
    expect(selectionOf(ta)[0]).toBe(0)
    setSelectionQuiet(ta, 23, 23)
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })
    expect(selectionOf(ta)[0]).toBe(12)
    fireEvent.click(screen.getByTitle('이전 (Shift+Enter)'))
    expect(selectionOf(ta)[0]).toBe(0)
  })

  it('FVC-06b: 첫 번째 일치 위치에서 Shift+Enter 시 마지막 일치로 순환 (Todo #107)', async () => {
    const { ta } = await open()
    fireEvent.keyDown(window, { key: 'f', ctrlKey: true })
    const input = screen.getByPlaceholderText(/검색/)
    fireEvent.change(input, { target: { value: 'hello' } })
    setSelectionQuiet(ta, 0, 5)
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })
    expect(selectionOf(ta)[0]).toBe(12)
  })

  it('FVC-07: 검색 결과 없음 → noMatch 후 해제', async () => {
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

  it('FVC-08: 검색창 Esc/닫기 버튼/window Esc 순서로 닫힘, 다음 Esc는 뷰어 닫기', async () => {
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

  it('FVC-09: F3 닫기, F4 에디터 전환, 편집 버튼, Close 버튼', async () => {
    const { onClose, onSwitchToEditor } = await open()
    fireEvent.keyDown(window, { key: 'F3' })
    expect(onClose).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(window, { key: 'F4' })
    expect(onSwitchToEditor).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByTitle('편집기로 열기 (F4)'))
    expect(onSwitchToEditor).toHaveBeenCalledTimes(2)
    fireEvent.click(screen.getByTitle('Close (Esc / F3)'))
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('FVC-10: IME 조합 중 Esc 무시', async () => {
    const { onClose } = await open()
    fireEvent.keyDown(window, { key: 'Escape', isComposing: true })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('FVC-11: 마크다운 기본 렌더링 — 검색 불가, 토글로 원본 보기', async () => {
    const { container } = await open('/m/r.md', {}, '# Title\n\n[ext](https://e.com) [rel](./x.md)')
    expect(container.querySelector('h1').textContent).toBe('Title')
    expect(screen.getByText(/Markdown 렌더링/)).toBeTruthy()
    fireEvent.keyDown(window, { key: 'f', ctrlKey: true })
    expect(screen.queryByPlaceholderText(/검색/)).toBeNull()
    expect(screen.queryByTitle('검색 (Ctrl+F)')).toBeNull()
    fireEvent.click(screen.getByTitle('원본 텍스트 보기'))
    expect(textOf(getSurface(container))).toMatch(/^# Title/)
    fireEvent.click(screen.getByTitle('마크다운 렌더링 보기'))
    expect(container.querySelector('h1')).toBeTruthy()
  })

  it('FVC-12: 마크다운 링크 클릭 — http(s)는 BrowserOpenURL, 상대 링크는 무시', async () => {
    const BrowserOpenURL = vi.fn()
    window.runtime = { BrowserOpenURL }
    try {
      const { container } = await open('/m/r.md', {}, '[ext](https://e.com) [rel](./x.md) plain')
      const links = container.querySelectorAll('a')
      fireEvent.click(links[0])
      expect(BrowserOpenURL).toHaveBeenCalledWith('https://e.com')
      fireEvent.click(links[1])
      expect(BrowserOpenURL).toHaveBeenCalledTimes(1)
      fireEvent.click(container.querySelector('p'))
      expect(BrowserOpenURL).toHaveBeenCalledTimes(1)
    } finally {
      delete window.runtime
    }
  })

  it('FVC-13: 이미지 — readImage 사용, 편집 버튼 없음, Ctrl+F 무시', async () => {
    const { container } = await open('/i/a.png')
    expect(readImage).toHaveBeenCalledWith('/i/a.png')
    expect(readFile).not.toHaveBeenCalled()
    expect(container.querySelector('img').getAttribute('src')).toBe('data:image/png;base64,AA')
    expect(screen.queryByTitle('편집기로 열기 (F4)')).toBeNull()
    fireEvent.keyDown(window, { key: 'f', ctrlKey: true })
    expect(screen.queryByPlaceholderText(/검색/)).toBeNull()
    expect(screen.getByText(/이미지 — PNG/)).toBeTruthy()
  })

  it('FVC-14: 이미지 줌 Ctrl+= / Ctrl+- / Ctrl+0', async () => {
    await open('/i/a.png')
    expect(screen.getByText(/100%/)).toBeTruthy()
    fireEvent.keyDown(window, { key: '=', ctrlKey: true })
    expect(screen.getByText(/125%/)).toBeTruthy()
    fireEvent.keyDown(window, { key: '-', ctrlKey: true })
    fireEvent.keyDown(window, { key: '-', ctrlKey: true })
    expect(screen.getByText(/80%/)).toBeTruthy()
    fireEvent.keyDown(window, { key: '0', ctrlKey: true })
    expect(screen.getByText(/100%/)).toBeTruthy()
  })

  it('FVC-15: 이미지 Ctrl+휠 줌 (위로 확대/아래로 축소), Ctrl 없으면 무시', async () => {
    const { container } = await open('/i/a.png')
    const el = container.querySelector('img').parentElement
    fireEvent.wheel(el, { deltaY: -100, ctrlKey: true })
    expect(screen.getByText(/125%/)).toBeTruthy()
    fireEvent.wheel(el, { deltaY: 100, ctrlKey: true })
    expect(screen.getByText(/100%/)).toBeTruthy()
    fireEvent.wheel(el, { deltaY: 100 })
    expect(screen.getByText(/100%/)).toBeTruthy()
  })

  it('FVC-16: 이미지 h/j/k/l 스크롤', async () => {
    const { container } = await open('/i/a.png')
    const el = container.querySelector('img').parentElement
    el.scrollBy = vi.fn()
    for (const key of ['h', 'l', 'j', 'k']) fireEvent.keyDown(window, { key })
    expect(el.scrollBy.mock.calls).toEqual([[-40, 0], [40, 0], [0, 40], [0, -40]])
  })

  it('FVC-17: 이미지 ←/→ 형제 이미지로 이동 + 위치 표시', async () => {
    const siblings = ['/i/a.png', '/i/b.png', '/i/c.png']
    const { onChangePath } = await open('/i/a.png', { siblingImages: siblings })
    expect(screen.getByText(/1 \/ 3/)).toBeTruthy()
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(onChangePath).toHaveBeenLastCalledWith('/i/b.png')
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(onChangePath).toHaveBeenLastCalledWith('/i/c.png')
  })

  it('FVC-18: 형제 이미지가 1개뿐이면 ←/→ 무시', async () => {
    const { onChangePath } = await open('/i/a.png', { siblingImages: ['/i/a.png'] })
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(onChangePath).not.toHaveBeenCalled()
  })

  it('FVC-19: [textarea 구현 전용 — 텍스트 영역 교체 시 삭제] 스크롤 시 줄번호 동기화', async () => {
    const { ta, container } = await open()
    ta.scrollTop = 50
    fireEvent.scroll(ta)
    expect(container.querySelector('[aria-hidden]').scrollTop).toBe(50)
  })

  it('FVC-20: 텍스트 모드에서 Ctrl+= 줌 단축키는 무시 (이미지 전용)', async () => {
    await open()
    fireEvent.keyDown(window, { key: '=', ctrlKey: true })
    expect(screen.getAllByText('13px').length).toBe(2)
  })
})
