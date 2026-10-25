import { create } from 'zustand'
import { termApi, onTermEvent, browserOpenURL } from '../core/termApi'
import { sessionById } from '../core/session'
import { addLines, CONSOLE_HINT } from '../core/luaScript'

// 탭에서 실행 중인 Lua 스크립트와 Lua 콘솔 (Todo #124, choboTerm luaconsole.ts).
// tabs[id] = { script: {name, started, console} | null, box: { state, name, started, ms, busy, lines, log, history, hpos } | null }
// 스크립트 메시지는 터미널이 아니라 칸 구석의 상자에 — 프로그램 화면과 섞이지 않게.

const AUTO_CLOSE_MS = 5000
const HISTORY_MAX = 100
const errText = (e) => String(e?.message ?? e)
const timers = new Map() // 끝난 상자를 닫는 타이머
let evalSeq = 0

const emptyBox = (name, started, isConsole) => ({
  state: isConsole ? 'console' : 'run', name, started, ms: 0, busy: undefined,
  lines: [], log: [], history: [], hpos: 0,
})

export const useScriptStore = create((set, get) => {
  const entry = (id) => get().tabs[id]
  const put = (id, patch) => set(s => ({ tabs: { ...s.tabs, [id]: { script: null, box: null, ...s.tabs[id], ...patch } } }))
  const putBox = (id, fn) => { const b = entry(id)?.box; if (b) put(id, { box: fn(b) }) }
  const line = (id, text, cls) => putBox(id, b => addLines(b, text, cls))
  const clearTimer = (id) => { clearTimeout(timers.get(id)); timers.delete(id) }

  // 연결된 탭에서만; 시작 실패(이미 실행 중 등)는 터미널에 안내
  async function start(id, call) {
    const s = sessionById(id)
    if (!s) return
    if (s.state !== 'on') return s.notice('연결되어 있지 않습니다')
    try {
      await call()
    } catch (e) {
      s.notice(errText(e))
    }
  }

  return {
    tabs: {},

    // ── Go 이벤트 ──
    started: (id, sc) => {
      clearTimer(id)
      const box = emptyBox(sc.name, sc.started, sc.console)
      put(id, { script: { name: sc.name, started: sc.started, console: sc.console }, box: sc.console ? addLines(box, CONSOLE_HINT, 'hint') : box })
    },
    printed: (id, text) => { if (entry(id)?.box) line(id, text) },
    result: (id, req, value, err) => {
      const b = entry(id)?.box
      if (!b || b.busy?.id !== req) return
      putBox(id, x => ({ ...x, busy: undefined }))
      if (err) line(id, err, 'err')
      else if (value) line(id, value, 'val')
    },
    ended: (id, ms, msg, stopped) => {
      if (!entry(id)) return
      const name = entry(id).script?.name ?? '스크립트'
      put(id, { script: null })
      if (!entry(id).box) put(id, { box: emptyBox(name, 0, false) })
      // 콘솔이 끝나면 입력은 더 못 받음 (저장은 남음). 오류는 줄 번호를 봐야 하니 닫을 때까지 남김
      putBox(id, b => ({ ...b, name, ms, busy: undefined, state: stopped ? 'stopped' : msg ? 'failed' : 'done' }))
      if (msg) line(id, msg, stopped ? '' : 'err')
      if (stopped || !msg) timers.set(id, setTimeout(() => get().closeBox(id), AUTO_CLOSE_MS))
    },
    // screen(): 탭에 지금 보이는 글자
    screen: (id, req) => {
      const s = sessionById(id)
      if (s) termApi.ScriptScreen(id, req, s.screenText()).catch(() => undefined)
    },

    closeBox: (id) => {
      clearTimer(id)
      if (entry(id)) put(id, { box: null })
    },

    // ── 탭 메뉴 · 단축키 ──
    runFile: (id) => start(id, () => termApi.RunScriptFile(id)),
    runText: (id, name, text) => start(id, () => termApi.RunScript(id, name, text)),
    stop: (id) => termApi.StopScript(id).catch(() => undefined),
    showScripts: (id) => termApi.ShowScripts().catch(e => sessionById(id)?.notice(errText(e))),

    // Ctrl+Shift+K: 콘솔을 열거나, 열려 있으면 닫음 (닫으면 실행 중인 코드도 멈춤)
    toggleConsole: (id) => {
      if (entry(id)?.script?.console) return get().closeConsole(id)
      return start(id, () => termApi.StartConsole(id))
    },
    closeConsole: (id) => {
      if (entry(id)?.script?.console) get().stop(id)
      get().closeBox(id)
      sessionById(id)?.focus()
    },

    // ── 콘솔 입력 ──
    eval: async (id, code) => {
      const b = entry(id)?.box
      if (!b || !code.trim()) return false
      if (b.busy) { line(id, '앞의 입력이 실행 중입니다 (Ctrl+C: 중지)', 'hint'); return false }
      const history = (b.history[b.history.length - 1] === code ? b.history : [...b.history, code]).slice(-HISTORY_MAX)
      const req = ++evalSeq
      putBox(id, x => ({ ...x, history, hpos: history.length, busy: { id: req, started: Date.now() } }))
      code.split('\n').forEach((l, i) => line(id, (i ? '  ' : '> ') + l, 'in'))
      try {
        await termApi.ConsoleEval(id, req, code)
      } catch (e) {
        putBox(id, x => ({ ...x, busy: undefined }))
        line(id, errText(e), 'err')
      }
      return true
    },
    interrupt: (id) => termApi.ConsoleInterrupt(id).catch(() => undefined),
    setHpos: (id, hpos) => putBox(id, b => ({ ...b, hpos })),

    // Ctrl+O: Lua 파일을 입력란으로 (실행 전에 보고 고치도록). 불러온 글자, 없으면 null
    openFile: async (id) => {
      try {
        const f = await termApi.ConsoleOpen()
        if (!f?.name) return null
        const text = (f.text ?? '').replace(/\n+$/, '')
        if (!text) line(id, `빈 파일입니다: ${f.name}`, 'hint')
        putBox(id, b => ({ ...b, hpos: b.history.length }))
        return text
      } catch (e) {
        line(id, `불러오지 못했습니다: ${errText(e)}`, 'err')
        return null
      }
    },
    // Ctrl+S: 입력과 출력을 파일로
    save: async (id) => {
      const b = entry(id)?.box
      if (!b?.log.length) return line(id, '저장할 내용이 없습니다', 'hint')
      try {
        const path = await termApi.ConsoleSave(b.log.join('\n') + '\n')
        if (path) line(id, `저장했습니다: ${path}`, 'hint')
      } catch (e) {
        line(id, `저장하지 못했습니다: ${errText(e)}`, 'err')
      }
    },

    forget: (id) => set(s => {
      clearTimer(id)
      if (!s.tabs[id]) return {}
      const tabs = { ...s.tabs }
      delete tabs[id]
      return { tabs }
    }),

    resetForTest: () => { timers.forEach(t => clearTimeout(t)); timers.clear(); evalSeq = 0; set({ tabs: {} }) },
  }
})

let off = []
/** Subscribes to the Go script events (once per mounted workspace). */
export function startScriptEvents() {
  if (off.length) return
  const st = () => useScriptStore.getState()
  off = [
    onTermEvent('script:start', (id, s) => st().started(id, s)),
    onTermEvent('script:print', (id, text) => st().printed(id, text)),
    onTermEvent('script:result', (id, req, value, err) => st().result(id, req, value, err)),
    onTermEvent('script:end', (id, ms, msg, stopped) => st().ended(id, ms, msg, stopped)),
    onTermEvent('script:screen', (id, req) => st().screen(id, req)),
    // 다른 PC의 브라우저 화면이면 Go가 열 수 없으니 화면이 엶
    onTermEvent('script:open', (_id, url) => browserOpenURL(url)),
  ]
}
export function stopScriptEvents() {
  off.forEach(f => f())
  off = []
}
