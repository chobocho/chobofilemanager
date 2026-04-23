import { describe, it, expect } from 'vitest'
import { isViewableFile, clampFontSize, isMarkdownFile, MIN_FONT, MAX_FONT, getWordWrapStyle } from './FileViewer.jsx'

// ─── isViewableFile ────────────────────────────────────────────────────────────

describe('isViewableFile', () => {
  it('FV-01: .txt 파일은 뷰어로 열 수 있다', () => {
    expect(isViewableFile('.txt')).toBe(true)
  })

  it('FV-02: .go 파일은 뷰어로 열 수 있다', () => {
    expect(isViewableFile('.go')).toBe(true)
  })

  it('FV-03: .md 파일은 뷰어로 열 수 있다', () => {
    expect(isViewableFile('.md')).toBe(true)
  })

  it('FV-04: .exe 파일은 뷰어로 열 수 없다', () => {
    expect(isViewableFile('.exe')).toBe(false)
  })

  it('FV-05: 확장자가 없으면 뷰어로 열 수 없다', () => {
    expect(isViewableFile('')).toBe(false)
  })

  it('FV-06: 대문자 확장자도 뷰어로 열 수 있다 (.JS)', () => {
    expect(isViewableFile('.JS')).toBe(true)
  })

  it('FV-07: .zip 파일은 뷰어로 열 수 없다', () => {
    expect(isViewableFile('.zip')).toBe(false)
  })

  it('FV-08: .log 파일은 뷰어로 열 수 있다', () => {
    expect(isViewableFile('.log')).toBe(true)
  })

  it('FV-09: .star (Starlark) 파일은 뷰어로 열 수 있다', () => {
    expect(isViewableFile('.star')).toBe(true)
  })

  it('FV-10: .bzl (Bazel) 파일은 뷰어로 열 수 있다', () => {
    expect(isViewableFile('.bzl')).toBe(true)
  })

  it('FV-11: .py 파일은 뷰어로 열 수 있다', () => {
    expect(isViewableFile('.py')).toBe(true)
  })

  it('FV-12: .json 파일은 뷰어로 열 수 있다', () => {
    expect(isViewableFile('.json')).toBe(true)
  })

  it('FV-13: .yaml 파일은 뷰어로 열 수 있다', () => {
    expect(isViewableFile('.yaml')).toBe(true)
  })

  it('FV-14: .toml 파일은 뷰어로 열 수 있다', () => {
    expect(isViewableFile('.toml')).toBe(true)
  })

  it('FV-15: .png 파일은 뷰어로 열 수 없다', () => {
    expect(isViewableFile('.png')).toBe(false)
  })

  it('FV-16: .pdf 파일은 뷰어로 열 수 없다', () => {
    expect(isViewableFile('.pdf')).toBe(false)
  })
})

// ─── isMarkdownFile ────────────────────────────────────────────────────────────

describe('isMarkdownFile', () => {
  it('MD-01: .md 파일은 마크다운 파일이다', () => {
    expect(isMarkdownFile('.md')).toBe(true)
  })

  it('MD-02: .MD 대문자도 마크다운 파일이다', () => {
    expect(isMarkdownFile('.MD')).toBe(true)
  })

  it('MD-03: .txt 파일은 마크다운 파일이 아니다', () => {
    expect(isMarkdownFile('.txt')).toBe(false)
  })

  it('MD-04: 빈 확장자는 마크다운 파일이 아니다', () => {
    expect(isMarkdownFile('')).toBe(false)
  })

  it('MD-05: .mdx 파일은 마크다운 파일이 아니다 (.md 정확 일치)', () => {
    expect(isMarkdownFile('.mdx')).toBe(false)
  })
})

// ─── clampFontSize ─────────────────────────────────────────────────────────────

describe('clampFontSize', () => {
  it('CF-01: 글자 크기를 늘릴 수 있다', () => {
    expect(clampFontSize(13, 2)).toBe(15)
  })

  it('CF-02: 글자 크기를 줄일 수 있다', () => {
    expect(clampFontSize(14, -2)).toBe(12)
  })

  it('CF-03: 최대값(MAX_FONT)을 초과하지 않는다', () => {
    expect(clampFontSize(MAX_FONT, 2)).toBe(MAX_FONT)
  })

  it('CF-04: 최소값(MIN_FONT) 미만으로 내려가지 않는다', () => {
    expect(clampFontSize(MIN_FONT, -2)).toBe(MIN_FONT)
  })

  it('CF-05: 중간 크기에서 최대값 근처로 넘어가면 MAX_FONT로 고정된다', () => {
    expect(clampFontSize(MAX_FONT - 1, 4)).toBe(MAX_FONT)
  })

  it('CF-06: 중간 크기에서 최소값 근처로 넘어가면 MIN_FONT로 고정된다', () => {
    expect(clampFontSize(MIN_FONT + 1, -4)).toBe(MIN_FONT)
  })

  it('CF-07: delta=0이면 크기가 변하지 않는다', () => {
    expect(clampFontSize(16, 0)).toBe(16)
  })

  it('CF-08: MIN_FONT와 MAX_FONT 사이 정상 범위에서 정확히 동작한다', () => {
    expect(clampFontSize(10, 5)).toBe(15)
    expect(clampFontSize(20, -5)).toBe(15)
  })
})

// ─── getWordWrapStyle ──────────────────────────────────────────────────────────

describe('getWordWrapStyle', () => {
  it('WW-01: wordWrap=false 시 pre 스타일을 반환한다', () => {
    const style = getWordWrapStyle(false)
    expect(style.whiteSpace).toBe('pre')
    expect(style.overflowX).toBe('auto')
    expect(style.overflowWrap).toBe('normal')
  })

  it('WW-02: wordWrap=true 시 pre-wrap 스타일을 반환한다', () => {
    const style = getWordWrapStyle(true)
    expect(style.whiteSpace).toBe('pre-wrap')
    expect(style.overflowX).toBe('hidden')
    expect(style.overflowWrap).toBe('break-word')
  })

  it('WW-03: wordWrap=false 시 overflowWrap은 normal이다', () => {
    expect(getWordWrapStyle(false).overflowWrap).toBe('normal')
  })

  it('WW-04: wordWrap=true 시 overflowX는 hidden이다 (가로 스크롤 없음)', () => {
    expect(getWordWrapStyle(true).overflowX).toBe('hidden')
  })
})
