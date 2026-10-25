import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ─── Todo #115: 에디터/뷰어 지연 로딩 — 초기 번들에 무거운 모듈이 들어가지 않음 ───
// main.jsx에서 정적 import(`import ... from '...'`)만 따라가 도달하는 모듈을 모아 검사합니다.
// 동적 import(`import('...')`, React.lazy)는 별도 조각으로 분리되므로 따라가지 않습니다.

const HEAVY_LOCAL = ['components/TextEditor.jsx', 'components/FileViewer.jsx', 'components/CodeSurface.jsx', 'components/codeLanguages.js']
const HEAVY_PACKAGES = [/^@codemirror\//, /^@lezer\//, /^marked$/, /^dompurify$/, /^@xterm\//]

function resolveLocal(fromFile, spec) {
  const base = resolve(dirname(fromFile), spec)
  for (const cand of [base, base + '.jsx', base + '.js', base + '.ts', base + '.tsx', resolve(base, 'index.js')]) {
    if (existsSync(cand) && !cand.endsWith('.css')) return cand
  }
  return null
}

function staticGraph(entry) {
  const seen = new Set()
  const packages = new Set()
  const stack = [entry]
  while (stack.length) {
    const file = stack.pop()
    if (seen.has(file)) continue
    seen.add(file)
    const src = readFileSync(file, 'utf8')
    for (const m of src.matchAll(/^\s*(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]/gm)) {
      const spec = m[1]
      if (spec.endsWith('.css')) continue
      if (spec.startsWith('.')) {
        const target = resolveLocal(file, spec)
        if (target) stack.push(target)
      } else {
        packages.add(spec)
      }
    }
  }
  return { files: [...seen].map(f => f.slice(__dirname.length + 1).replace(/\\/g, '/')), packages: [...packages] }
}

describe('지연 로딩 (Todo #115)', () => {
  const graph = staticGraph(resolve(__dirname, 'main.jsx'))

  it('LZ-01: 초기 모듈 그래프에 뷰어/에디터/CodeMirror 래퍼가 없음', () => {
    expect(graph.files.filter(f => HEAVY_LOCAL.includes(f))).toEqual([])
  })

  it('LZ-02: 초기 모듈 그래프에 CodeMirror/marked/DOMPurify 패키지가 없음', () => {
    expect(graph.packages.filter(p => HEAVY_PACKAGES.some(re => re.test(p)))).toEqual([])
  })

  it('LZ-04: 터미널 코드(src/terminal/)는 초기 그래프에 없음 — 처음 열 때 불러옴 (Todo #119)', () => {
    // 예외: Go 바인딩 창구(termApi, xterm 없음). 창 닫기 확인(CloseGuard)이 터미널을 열지 않아도 답해야 함 (Todo #124)
    expect(graph.files.filter(f => f.startsWith('terminal/') && f !== 'terminal/core/termApi.ts')).toEqual([])
  })

  it('LZ-03: 그래프 검사가 실제로 동작 (App과 FilePanel은 포함)', () => {
    expect(graph.files).toContain('App.jsx')
    expect(graph.files).toContain('components/FilePanel.jsx')
  })
})
