import { create } from 'zustand'

// 하단 터미널 도크의 상태 (Todo #122). xterm 없이 가볍게 — App과 F키 막대가 바로 씀.
// 높이·패널 따라가기·셸은 브라우저 저장소에 기억합니다.
export const DOCK_PREFS_KEY = 'chobocho.dock'

function loadPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem(DOCK_PREFS_KEY) || '{}')
    return {
      height: Number.isFinite(p.height) ? p.height : 260,
      follow: !!p.follow,
      shell: typeof p.shell === 'string' && p.shell ? p.shell : 'cmd',
    }
  } catch {
    return { height: 260, follow: false, shell: 'cmd' }
  }
}

function savePrefs({ height, follow, shell }) {
  try { localStorage.setItem(DOCK_PREFS_KEY, JSON.stringify({ height, follow, shell })) } catch { /* 저장 못 해도 동작 */ }
}

const initial = () => ({
  open: false,
  mounted: false,    // 한 번 열면 닫아도 셸을 유지 (숨김)
  focusSeq: 0,       // 늘어나면 도크가 터미널에 포커스
  sink: null,        // 도크가 등록하는 입력 함수 (text) => void
  pending: null,     // 셸이 뜨기 전에 붙여넣은 경로 · 실행 요청 { text, runIn } (뜨면 입력)
  ...loadPrefs(),
})

export const useDockStore = create((set, get) => ({
  ...initial(),

  show: () => set(s => ({ open: true, mounted: true, focusSeq: s.focusSeq + 1 })),
  hide: () => set({ open: false }),
  toggle: () => (get().open ? get().hide() : get().show()),

  setHeight: (height) => { set({ height }); savePrefs(get()) },
  setFollow: (follow) => { set({ follow }); savePrefs(get()) },
  setShell: (shell) => { set({ shell }); savePrefs(get()) },

  setSink: (sink) => set({ sink }),
  // 패널에서 경로 붙여넣기: 도크를 열고 셸에 입력 (따옴표는 도크가 셸에 맞게)
  paste: (path) => {
    get().show()
    const sink = get().sink
    if (sink) sink(path)
    else set({ pending: { text: path } })
  },
  // 실행 권한 파일 실행 (Todo #136-2): 도크를 열고 dir로 cd 후 path 실행
  run: (dir, path) => {
    get().show()
    const sink = get().sink
    if (sink) sink(path, dir)
    else set({ pending: { text: path, runIn: dir } })
  },
  takePending: () => {
    const p = get().pending
    if (p != null) set({ pending: null })
    return p
  },

  resetForTest: () => set(initial()),
}))
