import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, cleanup, act, waitFor, within } from '@testing-library/react'
import TerminalWorkspace from './TerminalWorkspace.jsx'
import { useTermStore } from '../store/termStore'
import { setTermBackend } from '../core/termApi'
import { stopEventRouter, sessionById } from '../core/session'
import { FakeTerminal } from '../test/fakeTerminal'
import { resetSettingsForTest, settings } from '../core/settings'

// ─── Todo #120: 로그인 질문, 창 닫기 확인, 여러 줄 붙여넣기 확인, 재접속 연결, 검색 ───

let handlers, api, terms
const emit = (name, ...args) => act(() => handlers.get(name)?.(...args))

function setup() {
  handlers = new Map()
  terms = []
  api = {
    GetSettings: vi.fn().mockResolvedValue({}), SaveSettings: vi.fn().mockResolvedValue(undefined),
    GetHistory: vi.fn().mockResolvedValue([]), GetSessions: vi.fn().mockResolvedValue([]),
    GetSSHConfigHosts: vi.fn().mockResolvedValue([]), GetLocalShells: vi.fn().mockResolvedValue([]), GetSerialPorts: vi.fn().mockResolvedValue([]),
    Connect: vi.fn().mockResolvedValue('ssh'), Send: vi.fn().mockResolvedValue(undefined), Resize: vi.fn().mockResolvedValue(undefined),
    CloseTab: vi.fn().mockResolvedValue(undefined), AnswerPrompt: vi.fn().mockResolvedValue(undefined), Quit: vi.fn().mockResolvedValue(undefined),
  }
  setTermBackend(api, {
    EventsOn: (name, cb) => { handlers.set(name, cb); return () => handlers.delete(name) },
    ClipboardSetText: vi.fn(), ClipboardGetText: vi.fn(), BrowserOpenURL: vi.fn(),
  })
  useTermStore.getState().resetForTest()
  resetSettingsForTest()
}

const createTerminal = (o) => { const t = new FakeTerminal(o); t.paste = vi.fn(); terms.push(t); return t }

async function renderWs() {
  const r = render(React.createElement(TerminalWorkspace, { createTerminal, addons: false }))
  await screen.findByLabelText('Host')
  await act(async () => {})
  return r
}

async function connect(host = 'srv') {
  fireEvent.change(screen.getByLabelText('Host'), { target: { value: host } })
  await act(async () => { fireEvent.submit(screen.getByLabelText('Host').closest('form')) })
  await waitFor(() => expect(screen.queryByLabelText('Host')).toBeNull())
}

describe('로그인 질문 (AP)', () => {
  beforeEach(setup)
  afterEach(() => { cleanup(); stopEventRouter(); setTermBackend(null) })

  it('AP-01: auth:prompt → 질문 창, 입력 후 확인 → AnswerPrompt(id, 값, true), 비밀번호 칸은 password', async () => {
    await renderWs()
    emit('auth:prompt', { id: 7, tab: 1, title: '키 암호', message: 'id_ed25519의 암호를 입력하세요', fields: [{ label: '암호', secret: true }] })
    const input = screen.getByLabelText('암호')
    expect(input.type).toBe('password')
    expect(screen.getByText('id_ed25519의 암호를 입력하세요')).toBeTruthy()
    fireEvent.change(input, { target: { value: 's3cret' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(api.AnswerPrompt).toHaveBeenCalledWith(7, ['s3cret'], true)
    expect(screen.queryByLabelText('암호')).toBeNull()
  })

  it('AP-02: 여러 칸 — Enter는 다음 칸으로, 마지막 칸에서 응답 / Esc는 취소', async () => {
    await renderWs()
    emit('auth:prompt', { id: 8, tab: 1, title: '로그인', message: '', fields: [{ label: '사용자', secret: false }, { label: 'OTP', secret: false }] })
    fireEvent.change(screen.getByLabelText('사용자'), { target: { value: 'me' } })
    fireEvent.keyDown(screen.getByLabelText('사용자'), { key: 'Enter' })
    expect(api.AnswerPrompt).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(screen.getByLabelText('OTP'))
    fireEvent.keyDown(screen.getByLabelText('OTP'), { key: 'Escape' })
    expect(api.AnswerPrompt).toHaveBeenCalledWith(8, [], false)
  })

  it('AP-03: 질문이 겹치면 차례로, auth:promptDone(시간 초과)이면 해당 질문 제거', async () => {
    await renderWs()
    emit('auth:prompt', { id: 1, tab: 1, title: 'A', message: '', fields: [{ label: 'a', secret: false }] })
    emit('auth:prompt', { id: 2, tab: 1, title: 'B', message: '', fields: [{ label: 'b', secret: false }] })
    expect(screen.getByLabelText('a')).toBeTruthy()
    emit('auth:promptDone', 1)
    expect(screen.queryByLabelText('a')).toBeNull()
    expect(screen.getByLabelText('b')).toBeTruthy()
  })

  it('AP-04: 버튼 이름 지정 (이어받기 / 처음부터)', async () => {
    await renderWs()
    emit('auth:prompt', { id: 3, tab: 1, title: '전송', message: '이어받을까요?', fields: [], ok: '이어받기', cancel: '처음부터' })
    fireEvent.click(screen.getByText('처음부터'))
    expect(api.AnswerPrompt).toHaveBeenCalledWith(3, [], false)
  })
})

describe('창 닫기 확인 (CC)', () => {
  beforeEach(setup)
  afterEach(() => { cleanup(); stopEventRouter(); setTermBackend(null) })

  it('CC-01: app:close → 확인 창, 종료 → Quit / 취소 → 그대로', async () => {
    await renderWs()
    emit('app:close')
    expect(screen.getByText(/연결된 터미널/)).toBeTruthy()
    fireEvent.click(within(screen.getByRole('dialog', { name: '종료' })).getByText('취소'))
    expect(api.Quit).not.toHaveBeenCalled()
    emit('app:close')
    await act(async () => { fireEvent.click(screen.getByText('모두 끊고 종료')) })
    expect(api.Quit).toHaveBeenCalled()
  })
})

describe('붙여넣기 확인 (PC)', () => {
  beforeEach(setup)
  afterEach(() => { cleanup(); stopEventRouter(); setTermBackend(null) })

  function paste(text) {
    const pane = document.querySelector('[data-term-pane]:not([hidden])')
    const ev = new Event('paste', { bubbles: true, cancelable: true })
    ev.clipboardData = { getData: () => text }
    act(() => { pane.dispatchEvent(ev) })
    return ev
  }

  it('PC-01: 한 줄은 그대로(xterm이 처리), 여러 줄은 확인 후 붙여넣기', async () => {
    await renderWs()
    await connect()
    expect(paste('ls -la').defaultPrevented).toBe(false)
    const ev = paste('rm -rf a\nrm -rf b\n')
    expect(ev.defaultPrevented).toBe(true)
    expect(screen.getByText(/2줄을 붙여넣습니다/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '붙여넣기' }))
    expect(terms[0].paste).toHaveBeenCalledWith('rm -rf a\nrm -rf b\n')
  })

  it('PC-02: 취소하면 붙여넣지 않음, "다시 묻지 않기"는 설정에 저장', async () => {
    await renderWs()
    await connect()
    paste('a\nb')
    fireEvent.click(screen.getByText('취소'))
    expect(terms[0].paste).not.toHaveBeenCalled()
    paste('a\nb')
    fireEvent.click(screen.getByLabelText('다시 묻지 않기'))
    fireEvent.click(screen.getByRole('button', { name: '붙여넣기' }))
    expect(settings.pasteNoConfirm).toBe(true)
    expect(paste('c\nd').defaultPrevented).toBe(false)
  })
})

describe('재접속 연결 (RW)', () => {
  beforeEach(setup)
  afterEach(() => { cleanup(); stopEventRouter(); setTermBackend(null) })

  it('RW-01: 연결이 끊기면 자동 재접속 안내, Esc로 취소 후 Enter → 이전 정보가 채워진 대화상자', async () => {
    await renderWs()
    await connect('db.example')
    emit('term:closed', 1, '연결이 끊어졌습니다', true)
    expect(terms[0].text()).toContain('초 후 다시 연결합니다')
    act(() => terms[0].type('\x1b'))
    expect(terms[0].text()).toContain('자동 재접속을 취소했습니다')
    act(() => terms[0].type('\r'))
    expect((await screen.findByLabelText('Host')).value).toBe('db.example')
  })

  it('RW-02: 탭을 닫으면 예약된 재접속 취소', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      await renderWs()
      await connect()
      emit('term:closed', 1, '끊김', true)
      await act(async () => { await useTermStore.getState().closeTab(1) })
      await act(async () => { await vi.advanceTimersByTimeAsync(60_000) })
      expect(api.Connect).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })
})
