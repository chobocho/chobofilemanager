import { describe, it, expect, vi, afterEach } from 'vitest'
import React from 'react'
import { render, screen, cleanup, waitFor, act, fireEvent } from '@testing-library/react'

vi.mock('../wailsjs/runtime', () => ({ default: { RunStarlarkFile: vi.fn() } }))

import TextEditor from './TextEditor.jsx'
import FileViewer from './FileViewer.jsx'
import { useFileStore } from '../stores/fileStore'
import { languageKeyForPath, loadLanguage, SUPPORTED_LANGUAGES, MAX_HIGHLIGHT_LENGTH } from './codeLanguages.js'
import { findSurfaceWithText, textOf, typeText } from '../test/textSurface.js'

const h = React.createElement

// ─── Todo #113: 구문 강조 ─────────────────────────────────────────────────────

describe('languageKeyForPath (SH)', () => {
  it.each([
    ['/a/app.js', 'javascript'], ['C:\\x\\View.JSX', 'jsx'], ['/a/t.ts', 'typescript'], ['/a/c.tsx', 'tsx'],
    ['/a/m.py', 'python'], ['/a/build.star', 'python'], ['/a/rules.bzl', 'python'],
    ['/a/main.go', 'go'], ['/a/lib.rs', 'rust'], ['/a/x.c', 'cpp'], ['/a/x.h', 'cpp'], ['/a/x.cpp', 'cpp'],
    ['/a/i.html', 'html'], ['/a/s.css', 'css'], ['/a/p.json', 'json'], ['/a/d.xml', 'xml'],
    ['/a/c.yaml', 'yaml'], ['/a/c.yml', 'yaml'], ['/a/r.md', 'markdown'], ['/a/q.sql', 'sql'],
    ['/a/run.sh', 'shell'], ['/a/p.toml', 'toml'], ['/a/s.ini', 'properties'], ['/a/.env', 'properties'],
    ['/a/Dockerfile', 'dockerfile'], ['/a/x.dockerfile', 'dockerfile'],
  ])('SH-01: %s → %s', (path, key) => {
    expect(languageKeyForPath(path)).toBe(key)
  })

  it.each([['/a/notes.txt'], ['/a/data.csv'], ['/a/app.log'], ['/a/Makefile'], ['/a/noext'], [''], [null]])(
    'SH-02: %s → 강조 없음', (path) => {
      expect(languageKeyForPath(path)).toBeNull()
    })

  it('SH-03: 지원하는 모든 언어 로더가 확장을 반환', async () => {
    for (const key of SUPPORTED_LANGUAGES) {
      const ext = await loadLanguage(key)
      expect(ext, key).toBeTruthy()
    }
    expect(await loadLanguage(null)).toBeNull()
    expect(await loadLanguage('nope')).toBeNull()
  })
})

async function openEditor(path, text) {
  const writeFile = vi.fn().mockResolvedValue(undefined)
  useFileStore.setState({ readFile: vi.fn().mockResolvedValue(text), writeFile })
  const r = render(h(TextEditor, { path, onClose: vi.fn() }))
  const el = await findSurfaceWithText(text)
  return { ...r, el, writeFile }
}

describe('에디터/뷰어 구문 강조 (SH)', () => {
  afterEach(() => cleanup())

  it('SH-10: .js 파일은 키워드가 강조됨', async () => {
    const { container } = await openEditor('/a/app.js', 'const x = 1 // note')
    await waitFor(() => {
      const kw = container.querySelector('.tok-keyword')
      expect(kw && kw.textContent).toBe('const')
    })
    expect(container.querySelector('.tok-comment').textContent).toBe('// note')
  })

  it('SH-11: .py/.star 파일 강조', async () => {
    const { container } = await openEditor('/a/build.star', 'def f():\n    return "s"')
    await waitFor(() => expect(container.querySelector('.tok-keyword')).toBeTruthy())
    expect(container.querySelector('.tok-string').textContent).toBe('"s"')
  })

  it('SH-12: .txt 파일은 강조하지 않음', async () => {
    const { container } = await openEditor('/a/notes.txt', 'const x = 1')
    await act(async () => { await new Promise(r => setTimeout(r, 30)) })
    expect(container.querySelector('[class*="tok-"]')).toBeNull()
  })

  it('SH-13: 강조는 내용/저장 결과를 바꾸지 않음', async () => {
    const { el, writeFile, container } = await openEditor('/a/app.js', 'let a = 1')
    await waitFor(() => expect(container.querySelector('.tok-keyword')).toBeTruthy())
    typeText(el, 'let a = 2')
    await act(async () => { fireEvent.keyDown(window, { key: 's', ctrlKey: true }) })
    expect(writeFile).toHaveBeenCalledWith('/a/app.js', 'let a = 2', 'auto')
    expect(textOf(el)).toBe('let a = 2')
  })

  it('SH-14: 뷰어도 강조 (읽기 전용 유지)', async () => {
    useFileStore.setState({ readFile: vi.fn().mockResolvedValue('{"k": true}'), readImage: vi.fn() })
    const { container } = render(h(FileViewer, { path: '/a/p.json', onClose: vi.fn() }))
    await findSurfaceWithText('{"k": true}')
    await waitFor(() => expect(container.querySelector('.tok-string, .tok-propertyName')).toBeTruthy())
  })

  it('SH-15: 너무 큰 문서는 강조를 건너뜀', async () => {
    const big = 'const a = 1\n'.repeat(Math.ceil((MAX_HIGHLIGHT_LENGTH + 10) / 12))
    const { container } = await openEditor('/a/big.js', big)
    await act(async () => { await new Promise(r => setTimeout(r, 50)) })
    expect(container.querySelector('[class*="tok-"]')).toBeNull()
  })

  it('SH-16: 상태 표시줄에 언어 표시', async () => {
    await openEditor('/a/main.go', 'package main')
    await waitFor(() => expect(screen.getByText('go')).toBeTruthy())
  })
})
