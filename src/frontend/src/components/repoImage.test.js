import { describe, it, expect, vi, afterEach } from 'vitest'
import React from 'react'
import { render, cleanup, waitFor, act } from '@testing-library/react'

vi.mock('../wailsjs/runtime', () => ({ default: {} }))

import FileViewer, { githubBlobImage, renderMarkdown } from './FileViewer.jsx'
import { useFileStore } from '../stores/fileStore'

const h = React.createElement
const BLOB = 'https://github.com/chobocho/freecell/blob/master/doc/screen_shot.png'
const RAW = 'https://raw.githubusercontent.com/chobocho/freecell/master/doc/screen_shot.png'

// ─── Todo #116: GitHub blob 이미지 → 로컬 사본 우선, 없으면 raw 주소 ──────────────

describe('githubBlobImage (GH)', () => {
  it('GH-01: blob 주소 분해 + raw 주소', () => {
    expect(githubBlobImage(BLOB)).toEqual({ owner: 'chobocho', repo: 'freecell', ref: 'master', path: 'doc/screen_shot.png', raw: RAW })
  })

  it('GH-02: 쿼리/해시 제거, 하위 폴더 경로', () => {
    const r = githubBlobImage('https://github.com/o/r/blob/main/a/b/c.jpg?raw=true#x')
    expect(r.path).toBe('a/b/c.jpg')
    expect(r.raw).toBe('https://raw.githubusercontent.com/o/r/main/a/b/c.jpg')
  })

  it('GH-03: blob이 아닌 주소는 null', () => {
    for (const u of [RAW, 'https://example.com/a.png', 'https://github.com/o/r/tree/main/doc', 'doc/a.png', '', null]) {
      expect(githubBlobImage(u)).toBeNull()
    }
  })
})

describe('renderMarkdown 이미지 변환 (GH)', () => {
  it('GH-10: 마크다운 이미지의 blob 주소를 raw로 바꾸고 저장소 정보를 남김', () => {
    const html = renderMarkdown(`![shot](${BLOB})`)
    const img = new DOMParser().parseFromString(html, 'text/html').querySelector('img')
    expect(img.getAttribute('src')).toBe(RAW)
    expect(img.dataset.ghOwner).toBe('chobocho')
    expect(img.dataset.ghRepo).toBe('freecell')
    expect(img.dataset.ghPath).toBe('doc/screen_shot.png')
  })

  it('GH-11: HTML <img>도 동일하게 변환', () => {
    const html = renderMarkdown(`<img src="${BLOB}" width="300">`)
    expect(html).toContain(`src="${RAW}"`)
  })

  it('GH-12: blob 링크(<a href>)와 다른 이미지는 그대로', () => {
    const html = renderMarkdown(`[code](${BLOB})\n\n![x](https://example.com/a.png)`)
    expect(html).toContain(`href="${BLOB}"`)
    expect(html).toContain('src="https://example.com/a.png"')
  })

  it('GH-13: 변환 후에도 XSS 정리는 유지', () => {
    const html = renderMarkdown(`<img src="${BLOB}" onerror="alert(1)">`)
    expect(html).not.toMatch(/onerror/i)
  })
})

describe('뷰어 — 로컬 사본 우선 (GH)', () => {
  afterEach(() => cleanup())

  async function openMd(resolveRepoImage) {
    useFileStore.setState({ readFile: vi.fn().mockResolvedValue(`# T\n\n![shot](${BLOB})`), readImage: vi.fn(), resolveRepoImage })
    const r = render(h(FileViewer, { path: 'C:\\github2\\freecell\\README.md', onClose: vi.fn() }))
    await waitFor(() => expect(r.container.querySelector('img')).toBeTruthy())
    return r
  }

  it('GH-20: 로컬 사본이 있으면 data URL로 교체', async () => {
    const resolveRepoImage = vi.fn().mockResolvedValue('data:image/png;base64,AAAA')
    const { container } = await openMd(resolveRepoImage)
    await waitFor(() => expect(container.querySelector('img').getAttribute('src')).toBe('data:image/png;base64,AAAA'))
    expect(resolveRepoImage).toHaveBeenCalledWith('C:\\github2\\freecell\\README.md', 'chobocho', 'freecell', 'doc/screen_shot.png')
  })

  it('GH-21: 로컬 사본이 없으면 raw 주소 유지', async () => {
    const { container } = await openMd(vi.fn().mockResolvedValue(''))
    await act(async () => {})
    expect(container.querySelector('img').getAttribute('src')).toBe(RAW)
  })

  it('GH-22: 조회 실패해도 raw 주소 유지', async () => {
    const { container } = await openMd(vi.fn().mockRejectedValue(new Error('x')))
    await act(async () => {})
    expect(container.querySelector('img').getAttribute('src')).toBe(RAW)
  })
})
