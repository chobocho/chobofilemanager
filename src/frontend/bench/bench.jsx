// 뷰어/에디터 성능 측정 페이지 (Todo #109). bench/run.mjs가 헤드리스 Edge/Chrome으로 실행.
// 실제 컴포넌트(FileViewer, TextEditor)를 렌더링하고, 프레임이 그려질 때까지의 시간을 잽니다.
import React from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import FileViewer from '../src/components/FileViewer.jsx'
import TextEditor from '../src/components/TextEditor.jsx'
import { useFileStore } from '../src/stores/fileStore'
import '../src/styles/global.css'
import { getSurface, textLength, typeCharAt, scrollToRatio } from './surfaceOps.js'

const nextFrame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)))
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)] }

// 약 80자 줄로 sizeMB 크기 텍스트 생성 (소스 코드와 비슷한 모양)
function makeText(sizeMB) {
  const line = 'const value_' + 'x'.repeat(40) + ' = compute(alpha, beta, gamma) // 주석 텍스트'
  const n = Math.ceil(sizeMB * 1024 * 1024 / (line.length + 1))
  const out = new Array(n)
  for (let i = 0; i < n; i++) out[i] = line
  return out.join('\n')
}

async function waitSurface(len) {
  for (let i = 0; i < 2000; i++) {
    const el = getSurface()
    if (el && textLength(el) === len) return el
    await new Promise(r => setTimeout(r, 1))
  }
  throw new Error('surface timeout')
}

async function measureOpen(Component, text) {
  const host = document.getElementById('root')
  const root = createRoot(host)
  useFileStore.setState({ readFile: async () => text, writeFile: async () => {} })
  const t0 = performance.now()
  flushSync(() => root.render(React.createElement(Component, { path: '/bench/a.txt', onClose: () => {}, onSwitchToViewer: () => {}, onSwitchToEditor: () => {} })))
  const el = await waitSurface(text.length)
  el.getBoundingClientRect()
  await nextFrame()
  const openMs = performance.now() - t0
  return { root, el, openMs }
}

async function measureTyping(el, count = 15) {
  const times = []
  const mid = Math.floor(textLength(el) / 2)
  for (let i = 0; i < count; i++) {
    const t0 = performance.now()
    typeCharAt(el, mid + i, 'a')
    el.getBoundingClientRect()
    await nextFrame()
    times.push(performance.now() - t0)
  }
  return { median: median(times), max: Math.max(...times) }
}

async function measureScroll(el) {
  const times = []
  for (const r of [0.25, 0.5, 0.75, 1, 0]) {
    const t0 = performance.now()
    scrollToRatio(el, r)
    await nextFrame()
    times.push(performance.now() - t0)
  }
  return { median: median(times), max: Math.max(...times) }
}

async function run() {
  const sizes = (new URLSearchParams(location.search).get('sizes') || '1,5,10').split(',').map(Number)
  const results = []
  for (const mb of sizes) {
    const text = makeText(mb)
    const v = await measureOpen(FileViewer, text)
    const vScroll = await measureScroll(v.el)
    v.root.unmount()
    await nextFrame()
    const e = await measureOpen(TextEditor, text)
    const typing = await measureTyping(e.el)
    e.root.unmount()
    await nextFrame()
    results.push({
      sizeMB: mb,
      viewerOpenMs: Math.round(v.openMs),
      viewerScrollMedianMs: Math.round(vScroll.median),
      editorOpenMs: Math.round(e.openMs),
      editorKeystrokeMedianMs: Math.round(typing.median),
      editorKeystrokeMaxMs: Math.round(typing.max),
    })
  }
  window.__benchResult = results
}

run().catch(err => { window.__benchResult = { error: String(err && err.stack || err) } })
