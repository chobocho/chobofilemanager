import { create } from 'zustand'
import { sessionById } from '../core/session'
import { buildRequest, tabLabel, tabTooltip } from '../core/connect'

// 터미널 탭 목록과 활성 탭 (Todo #120). xterm 인스턴스(TermSession)는 React 상태 밖
// (core/session.ts 레지스트리)에 두고, 여기에는 화면에 그릴 메타데이터만 둡니다.

const newTabState = (id) => ({
  id,
  label: '새 탭',
  tooltip: '',
  state: 'idle',     // idle | connecting | on | ftp
  proto: '',
  activity: false,   // 비활성 탭에 출력이 옴
  dialog: true,      // 연결 대화상자 열림
  connecting: false,
  error: '',
  title: '',         // 셸이 정한 제목 (OSC 0/2)
})

const initial = () => ({ tabs: [], activeId: null, nextId: 1 })

export const useTermStore = create((set, get) => ({
  ...initial(),

  newTab: () => {
    const id = get().nextId
    set(s => ({ tabs: [...s.tabs, newTabState(id)], activeId: id, nextId: id + 1 }))
    return id
  },

  setActive: (id) => {
    set(s => ({ activeId: id, tabs: s.tabs.map(t => (t.id === id ? { ...t, activity: false } : t)) }))
  },

  updateTab: (id, patch) => {
    set(s => ({ tabs: s.tabs.map(t => (t.id === id ? { ...t, ...patch } : t)) }))
  },

  markActivity: (id) => {
    if (get().activeId === id) return
    const t = get().tabs.find(x => x.id === id)
    if (t && !t.activity) get().updateTab(id, { activity: true })
  },

  openDialog: (id) => get().updateTab(id, { dialog: true, error: '' }),
  closeDialog: (id) => get().updateTab(id, { dialog: false }),

  // 닫는 탭이 활성이면 오른쪽(없으면 왼쪽) 탭으로
  closeTab: async (id) => {
    const { tabs, activeId } = get()
    const idx = tabs.findIndex(t => t.id === id)
    if (idx < 0) return
    const rest = tabs.filter(t => t.id !== id)
    let next = activeId
    if (activeId === id) next = rest.length ? rest[Math.min(idx, rest.length - 1)].id : null
    set({ tabs: rest, activeId: next })
    await sessionById(id)?.close()
  },

  cycle: (delta) => {
    const { tabs, activeId } = get()
    if (!tabs.length) return
    const i = tabs.findIndex(t => t.id === activeId)
    const next = tabs[(i + delta + tabs.length) % tabs.length]
    get().setActive(next.id)
  },

  // 세션 상태/제목을 탭 메타데이터에 반영
  bindSession: (id, session) => {
    const offs = [
      session.onState(state => get().updateTab(id, { state })),
      session.onTitle(title => get().updateTab(id, { title })),
    ]
    return () => offs.forEach(off => off())
  },

  connect: async (id, fields, sessionName) => {
    const tab = get().tabs.find(t => t.id === id)
    const session = sessionById(id)
    if (!tab || !session || tab.connecting) return
    const req = buildRequest(fields)
    get().updateTab(id, { connecting: true, error: '' })
    try {
      const proto = await session.connect(req)
      get().updateTab(id, {
        connecting: false, dialog: false, state: session.state, proto,
        label: tabLabel(req, proto, sessionName), tooltip: tabTooltip(req, proto),
      })
    } catch (e) {
      get().updateTab(id, { connecting: false, dialog: true, state: 'idle', error: String(e?.message ?? e) })
    }
  },

  resetForTest: () => set(initial()),
}))
