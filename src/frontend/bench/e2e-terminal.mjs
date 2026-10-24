// 실제 Go 백엔드로 Terminal 보기를 확인하는 종단 점검 (Todo #120).
// 사용: (src에서) wails dev 실행 중일 때 → node bench/e2e-terminal.mjs [url]
// wails dev가 브라우저용으로 제공하는 http://localhost:34115 (Go 바인딩 포함)을 헤드리스 Edge로 열어
// Terminal 보기 → cmd 연결 → 명령 입력 → 출력 확인 → 탭 닫기까지 진행합니다.
import puppeteer from 'puppeteer-core'
import { existsSync } from 'node:fs'

const url = process.argv[2] || 'http://localhost:34115'
const exe = [
  process.env.BENCH_BROWSER,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].filter(Boolean).find(p => existsSync(p))

const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: ['--window-size=1280,800'] })
const page = await browser.newPage()
await page.setViewport({ width: 1280, height: 800 })
const step = (m) => console.log('✓', m)
try {
  await page.goto(url, { waitUntil: 'networkidle2' })
  await page.waitForFunction(() => window.go?.termapp?.App, { timeout: 20000 })
  step('Go 바인딩 window.go.termapp.App 사용 가능')

  await page.click('button[title="Terminal"]')
  await page.waitForSelector('#term-host', { timeout: 20000 })
  step('Terminal 보기 + 연결 대화상자')

  await page.$eval('#term-host', el => { el.value = '' })
  await page.type('#term-host', 'cmd')
  await page.keyboard.press('Enter')
  await page.waitForFunction(() => !document.querySelector('#term-host'), { timeout: 20000 })
  step('cmd 연결 (대화상자 닫힘)')

  await page.waitForFunction(() => /Microsoft|>/.test(document.querySelector('[data-term-pane]:not([hidden]) .xterm-rows')?.textContent ?? ''), { timeout: 20000 })
  step('셸 프롬프트 출력 수신')

  await page.focus('[data-term-pane]:not([hidden]) .xterm-helper-textarea')
  await page.keyboard.type('echo choboterm-e2e-%USERNAME%')
  await page.keyboard.press('Enter')
  await page.waitForFunction(() => /choboterm-e2e-\w+/.test(document.querySelector('[data-term-pane]:not([hidden]) .xterm-rows')?.textContent ?? ''), { timeout: 20000 })
  step('명령 입력 → 셸 실행 결과 표시')

  const label = await page.$eval('[data-tab-label]', el => el.textContent)
  if (label !== 'cmd') throw new Error(`tab label ${label}`)
  step(`탭 이름 "${label}"`)

  await page.click('button[title="탭 닫기 (Ctrl+Shift+W)"]')
  await page.waitForFunction(() => !document.querySelector('[data-term-pane]'), { timeout: 10000 })
  step('탭 닫기')
  console.log('E2E OK')
} catch (e) {
  console.error('E2E FAILED:', e.message)
  const rows = await page.$eval('[data-term-pane]:not([hidden]) .xterm-rows', el => el.textContent).catch(() => '')
  if (rows) console.error('screen:', rows.slice(0, 500))
  process.exitCode = 1
} finally {
  await browser.close()
}
