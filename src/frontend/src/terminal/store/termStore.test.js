import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useTermStore } from './termStore'
import { TermSession } from '../core/session'
import { setTermBackend } from '../core/termApi'
import { FakeTerminal } from '../test/fakeTerminal'

// ─── Todo #120: 터미널 탭 스토어 ──────────────────────────────────────────────

function backend() {
  const api = {
    Connect: vi.fn().mockResolvedValue('ssh'),
    CloseTab: vi.fn().mockResolvedValue(undefined),
    Send: vi.fn().mockResolvedValue(undefined),
    Resize: vi.fn().mockResolvedValue(undefined),
  }
  setTermBackend(api, { EventsOn: () => () => {}, ClipboardSetText: vi.fn(), ClipboardGetText: vi.fn(), BrowserOpenURL: vi.fn() })
  return api
}

function attachSession(id) {
  const s = new TermSession(id, { createTerminal: o => new FakeTerminal(o), addons: false })
  s.open(document.createElement('div'))
  return s
}

describe('termStore (TM)', () => {
  let api
  beforeEach(() => {
    api = backend()
    useTermStore.getState().resetForTest()
  })

  it('TM-01: 새 탭 — 증가하는 id, 활성화, 연결 대화상자 열림', () => {
    const a = useTermStore.getState().newTab()
    const b = useTermStore.getState().newTab()
    const st = useTermStore.getState()
    expect(b).toBe(a + 1)
    expect(st.activeId).toBe(b)
    expect(st.tabs.map(t => t.id)).toEqual([a, b])
    expect(st.tabs[1]).toMatchObject({ label: '새 탭', state: 'idle', dialog: true })
  })

  it('TM-02: 탭 닫기 — Go 쪽 탭도 닫고, 오른쪽(없으면 왼쪽) 탭 활성화', async () => {
    const st = useTermStore.getState()
    const a = st.newTab(), b = st.newTab(), c = st.newTab()
    attachSession(b)
    st.setActive(b)
    await useTermStore.getState().closeTab(b)
    expect(api.CloseTab).toHaveBeenCalledWith(b)
    expect(useTermStore.getState().activeId).toBe(c)
    await useTermStore.getState().closeTab(c)
    expect(useTermStore.getState().activeId).toBe(a)
    await useTermStore.getState().closeTab(a)
    expect(useTermStore.getState().activeId).toBeNull()
  })

  it('TM-03: 비활성 탭을 닫아도 현재 탭 유지', async () => {
    const st = useTermStore.getState()
    const a = st.newTab(), b = st.newTab()
    st.setActive(a)
    await useTermStore.getState().closeTab(b)
    expect(useTermStore.getState().activeId).toBe(a)
  })

  it('TM-04: 탭 순환 (Ctrl+Tab) — 끝에서 처음으로', () => {
    const st = useTermStore.getState()
    const a = st.newTab(), b = st.newTab(), c = st.newTab()
    st.setActive(c)
    useTermStore.getState().cycle(1)
    expect(useTermStore.getState().activeId).toBe(a)
    useTermStore.getState().cycle(-1)
    expect(useTermStore.getState().activeId).toBe(c)
    expect(b).toBeTruthy()
  })

  it('TM-05: 연결 — 요청 생성, 탭 이름/설명/상태 갱신, 대화상자 닫힘, 히스토리 기록은 Go 쪽', async () => {
    const id = useTermStore.getState().newTab()
    attachSession(id)
    await useTermStore.getState().connect(id, { host: 'a.com', port: '2222', login: 'u', pass: 'p', encoding: 'UTF-8', jump: '' })
    expect(api.Connect).toHaveBeenCalledWith(id, expect.objectContaining({ host: 'a.com', port: 2222, login: 'u' }))
    const t = useTermStore.getState().tabs[0]
    expect(t).toMatchObject({ label: 'a.com:2222', tooltip: 'ssh://u@a.com:2222', state: 'on', proto: 'ssh', dialog: false, error: '' })
  })

  it('TM-06: 연결 실패 — 대화상자 유지, 오류 표시, idle', async () => {
    api.Connect.mockRejectedValueOnce(new Error('connection refused'))
    const id = useTermStore.getState().newTab()
    attachSession(id)
    await useTermStore.getState().connect(id, { host: 'h', port: '22', login: '', pass: '', encoding: 'UTF-8', jump: '' })
    const t = useTermStore.getState().tabs[0]
    expect(t).toMatchObject({ dialog: true, state: 'idle', connecting: false })
    expect(t.error).toContain('connection refused')
  })

  it('TM-07: 연결 중 표시 (중복 연결 방지)', async () => {
    let resolve
    api.Connect.mockImplementationOnce(() => new Promise(r => (resolve = r)))
    const id = useTermStore.getState().newTab()
    attachSession(id)
    const p = useTermStore.getState().connect(id, { host: 'h', port: '22', login: '', pass: '', encoding: '', jump: '' })
    expect(useTermStore.getState().tabs[0].connecting).toBe(true)
    await useTermStore.getState().connect(id, { host: 'h', port: '22', login: '', pass: '', encoding: '', jump: '' })
    expect(api.Connect).toHaveBeenCalledTimes(1)
    resolve('ssh')
    await p
    expect(useTermStore.getState().tabs[0].connecting).toBe(false)
  })

  it('TM-08: 비활성 탭에 출력 → 활동 표시, 활성화하면 해제', () => {
    const st = useTermStore.getState()
    const a = st.newTab(), b = st.newTab()
    st.setActive(a)
    useTermStore.getState().markActivity(b)
    useTermStore.getState().markActivity(a)
    expect(useTermStore.getState().tabs.find(t => t.id === b).activity).toBe(true)
    expect(useTermStore.getState().tabs.find(t => t.id === a).activity).toBe(false)
    useTermStore.getState().setActive(b)
    expect(useTermStore.getState().tabs.find(t => t.id === b).activity).toBe(false)
  })

  it('TM-09: 대화상자 열기/닫기', () => {
    const id = useTermStore.getState().newTab()
    useTermStore.getState().closeDialog(id)
    expect(useTermStore.getState().tabs[0].dialog).toBe(false)
    useTermStore.getState().openDialog(id)
    expect(useTermStore.getState().tabs[0].dialog).toBe(true)
  })

  it('TM-10: 연결 끊김 → 상태 idle 반영', async () => {
    const id = useTermStore.getState().newTab()
    const s = attachSession(id)
    useTermStore.getState().bindSession(id, s)
    await useTermStore.getState().connect(id, { host: 'h', port: '22', login: '', pass: '', encoding: '', jump: '' })
    s.handleClosed('끊김', false)
    expect(useTermStore.getState().tabs[0].state).toBe('idle')
  })
})
