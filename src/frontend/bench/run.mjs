// 뷰어/에디터 성능 측정 실행기 (Todo #109)
// 사용: npm run bench            (기본 1,5,10MB, .txt)
//       npm run bench -- 1,5 js  (.js — 구문 강조 포함)
//       npm run bench -- 1,20    (크기 지정)
// Vite 개발 서버로 bench/index.html을 띄우고 설치된 Edge(없으면 Chrome)를 헤드리스로 실행해 결과를 표로 출력합니다.
import { createServer } from 'vite'
import puppeteer from 'puppeteer-core'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sizes = process.argv[2] || '1,5,10'
const ext = process.argv[3] || 'txt'  // 예: npm run bench -- 1,5 js

const candidates = [
  process.env.BENCH_BROWSER,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean)
const executablePath = candidates.find(p => existsSync(p))
if (!executablePath) {
  console.error('Edge/Chrome을 찾을 수 없습니다. BENCH_BROWSER 환경 변수로 경로를 지정하세요.')
  process.exit(1)
}

const server = await createServer({ root, configFile: resolve(root, 'vite.config.js'), server: { port: 0 }, logLevel: 'error' })
await server.listen()
const url = `${server.resolvedUrls.local[0]}bench/index.html?sizes=${sizes}&ext=${ext}`

const browser = await puppeteer.launch({ executablePath, headless: true, args: ['--window-size=1280,800'] })
try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 800 })
  await page.goto(url, { waitUntil: 'load' })
  await page.waitForFunction('window.__benchResult', { timeout: 10 * 60 * 1000, polling: 500 })
  const result = await page.evaluate(() => window.__benchResult)
  if (result.error) throw new Error(result.error)
  console.log(`browser: ${executablePath}`)
  console.table(result)
} finally {
  await browser.close()
  await server.close()
}
