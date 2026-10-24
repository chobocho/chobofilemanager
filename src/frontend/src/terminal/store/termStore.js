import { create } from 'zustand'
import { sessionById } from '../core/session'
import { buildRequest, tabLabel, tabTooltip } from '../core/connect'
import { leaf, splitAt, removeLeaf, leaves, setRatio as layoutSetRatio, nearestPane } from '../core/layout'

// 터미널 탭(칸) 목록과 활성 칸 (Todo #120, #121). xterm 인스턴스(TermSession)는 React 상태 밖
// (core/session.ts 레지스트리)에 두고, 여기에는 화면에 그릴 메타데이터만 둡니다.
// groups: 탭 막대의 한 칸. 분할(Ctrl+Shift+\ / -)하면 한 그룹 안에 여러 칸(tab)이 생깁니다.

const newTabState = (id, temp = false) => ({
  id,
  label: '새 탭',
  tooltip: '',
  state: 'idle',     // idle | connecting | on | ftp
  proto: '',
  activity: false,   // 비활성 칸에 출력이 옴
  dialog: true,      // 연결 대화상자 열림
  connecting: false,
  error: '',
  title: '',         // 셸이 정한 제목 (OSC 0/2)
  temp,              // 분할로 만든 칸: 연결 전에 대화상자를 닫으면 칸도 닫힘
})

const initial = () => ({ tabs: [], groups: [], activeId: null, nextId: 1 })

export const useTermStore = create((set, get) => ({
  ...initial(),

  newTab: () => {
    const id = get().nextId
    set(s => ({
      tabs: [...s.tabs, newTabState(id)],
      groups: [...s.groups, { id, layout: leaf(id) }],
      activeId: id,
      nextId: id + 1,
    }))
    return id
  },

  // 칸 id 옆에 새 칸을 만들어 활성화 (row: 오른쪽, col: 아래)
  splitPane: (id, dir) => {
    const g = get().groupOfPane(id)
    if (!g) return null
    const nid = get().nextId
    set(s => ({
      tabs: [...s.tabs, newTabState(nid, true)],
      groups: s.groups.map(x => (x.id === g.id ? { ...x, layout: splitAt(x.layout, id, nid, dir) } : x)),
      activeId: nid,
      nextId: nid + 1,
    }))
    return nid
  },

  groupOfPane: (id) => get().groups.find(g => leaves(g.layout).includes(id)),

  activeGroupId: () => get().groupOfPane(get().activeId)?.id ?? null,

  // 그룹 순서 → 그룹 안 칸 순서
  orderedPaneIds: () => get().groups.flatMap(g => leaves(g.layout)),

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

  // Esc/취소: 분할로 만든 임시 칸은 칸째 닫고, 아니면 대화상자만 닫음
  cancelDialog: async (id) => {
    const t = get().tabs.find(x => x.id === id)
    if (t?.temp && t.state === 'idle' && !t.proto) await get().closeTab(id)
    else get().closeDialog(id)
  },

  // 같은 그룹의 남은 칸 → (그룹이 사라지면) 오른쪽, 없으면 왼쪽 그룹
  closeTab: async (id) => {
    const { tabs, groups, activeId } = get()
    const gi = groups.findIndex(g => leaves(g.layout).includes(id))
    if (gi < 0) return
    const layout = removeLeaf(groups[gi].layout, id)
    const nextGroups = layout
      ? groups.map((g, i) => (i === gi ? { ...g, layout } : g))
      : groups.filter((_, i) => i !== gi)
    let next = activeId
    if (activeId === id) {
      if (layout) next = leaves(layout)[0]
      else if (nextGroups.length) next = leaves(nextGroups[Math.min(gi, nextGroups.length - 1)].layout)[0]
      else next = null
    }
    set({ tabs: tabs.filter(t => t.id !== id), groups: nextGroups, activeId: next })
    await sessionById(id)?.close()
  },

  cycle: (delta) => {
    const order = get().orderedPaneIds()
    if (!order.length) return
    const i = order.indexOf(get().activeId)
    get().setActive(order[(i + delta + order.length) % order.length])
  },

  // Alt+방향키: 활성 그룹 안에서 그 방향의 가장 가까운 칸으로. 옮겼으면 true
  focusDir: (dx, dy) => {
    const g = get().groupOfPane(get().activeId)
    if (!g) return false
    const to = nearestPane(g.layout, get().activeId, dx, dy)
    if (to === undefined) return false
    get().setActive(to)
    return true
  },

  setRatio: (groupId, path, ratio) => {
    set(s => ({ groups: s.groups.map(g => (g.id === groupId ? { ...g, layout: layoutSetRatio(g.layout, path, ratio) } : g)) }))
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
        connecting: false, dialog: false, state: session.state, proto, temp: false,
        label: tabLabel(req, proto, sessionName), tooltip: tabTooltip(req, proto),
      })
    } catch (e) {
      get().updateTab(id, { connecting: false, dialog: true, state: 'idle', error: String(e?.message ?? e) })
    }
  },

  resetForTest: () => set(initial()),
}))
