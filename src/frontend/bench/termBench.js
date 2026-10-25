// 터미널 성능 측정 페이지 (Todo #125). bench/run-term.mjs가 헤드리스 Edge/Chrome으로 실행.
// 실제 xterm + TermSession(앱과 같은 코드)에 가짜 Go 쪽을 붙여
//  - 출력 처리량: term:data(base64 64KB 조각)로 N MB를 받아 화면에 다 그릴 때까지 (MB/s)
//  - 키 입력 지연: 글쇠 하나 → Send 호출까지 (ms, 중앙값·최대)
// 을 잽니다.
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { TermSession } from '../src/terminal/core/session'
import { setTermBackend } from '../src/terminal/core/termApi'
import { lookOptions } from '../src/terminal/core/look'
import { settings } from '../src/terminal/core/settings'

const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)] }
const nextFrame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)))
const CHUNK = 64 * 1024

// ls -l · 컴파일 로그처럼: 색(SGR)·한글이 섞인 80자 안팎 줄
function makeOutput(mb, color) {
  const plain = 'drwxr-xr-x  2 user staff   4096 Oct 25 12:00 src_directory_name 한글 파일 이름.txt'
  const colored = '\x1b[01;34mdrwxr-xr-x\x1b[0m  2 user staff  4096 Oct 25 \x1b[32mbuild.log\x1b[0m \x1b[31merror\x1b[0m 한글'
  const line = (color ? colored : plain) + '\r\n'
  const bytes = new TextEncoder().encode(line)
  const n = Math.ceil(mb * 1024 * 1024 / bytes.length)
  const out = new Uint8Array(n * bytes.length)
  for (let i = 0; i < n; i++) out.set(bytes, i * bytes.length)
  return out
}

function b64(bytes) {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

async function measureOutput(session, mb, color) {
  const data = makeOutput(mb, color)
  const chunks = []
  for (let i = 0; i < data.length; i += CHUNK) chunks.push(b64(data.subarray(i, i + CHUNK)))
  session.term.reset()
  await nextFrame()
  const t0 = performance.now()
  for (const c of chunks) session.receive(c)
  // 앞의 write가 모두 처리된 뒤 불리는 콜백을 기다림
  await new Promise(r => session.term.write('', r))
  await nextFrame()
  const ms = performance.now() - t0
  return { ms, mbps: mb / (ms / 1000) }
}

async function measureKeys(session, sent, count = 200) {
  const ta = document.querySelector('.xterm-helper-textarea')
  const times = []
  for (let i = 0; i < count; i++) {
    const before = sent.length
    const t0 = performance.now()
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', code: 'KeyA', keyCode: 65, bubbles: true }))
    ta.dispatchEvent(new KeyboardEvent('keypress', { key: 'a', code: 'KeyA', charCode: 97, keyCode: 97, bubbles: true }))
    while (sent.length === before) await new Promise(r => setTimeout(r, 0))
    times.push(performance.now() - t0)
  }
  return { median: median(times), max: Math.max(...times) }
}

async function run() {
  const sent = []
  setTermBackend({
    Connect: async () => 'ssh', Send: async (_id, d) => { sent.push(d) }, Resize: async () => {}, CloseTab: async () => {},
  }, { EventsOn: () => () => {} })
  const session = new TermSession(1, { createTerminal: (o) => new Terminal(o), addons: false, options: { ...lookOptions(settings), scrollback: 5000 } })
  session.open(document.getElementById('term'))
  await session.connect({ host: 'bench', port: 22, login: '', pass: '', encoding: 'UTF-8', jump: '' })
  session.term.focus()
  await nextFrame()

  const sizes = (new URLSearchParams(location.search).get('sizes') || '1,5,10').split(',').map(Number)
  const results = []
  for (const mb of sizes) {
    const plain = await measureOutput(session, mb, false)
    const color = await measureOutput(session, mb, true)
    results.push({ test: `출력 ${mb}MB`, plainMs: Math.round(plain.ms), plainMBps: +plain.mbps.toFixed(1), colorMs: Math.round(color.ms), colorMBps: +color.mbps.toFixed(1) })
  }
  const keys = await measureKeys(session, sent)
  results.push({ test: '키 입력 → Send (200회)', keyMedianMs: +keys.median.toFixed(2), keyMaxMs: +keys.max.toFixed(2) })
  window.__benchResult = results
}

run().catch(err => { window.__benchResult = { error: String(err && err.stack || err) } })
