import { describe, it, expect } from 'vitest'
import { isViewableFile, clampFontSize, isMarkdownFile, MIN_FONT, MAX_FONT, getWordWrapStyle, ENCODINGS, ENCODING_LABELS, nextEncoding, isImageFile, IMAGE_EXTS } from './FileViewer.jsx'

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

  it('FV-15: .png 파일은 이미지로 뷰어에서 열 수 있다 (Todo #52 이후)', () => {
    expect(isViewableFile('.png')).toBe(true)
  })

  it('FV-16: .pdf 파일은 뷰어로 열 수 없다', () => {
    expect(isViewableFile('.pdf')).toBe(false)
  })

  it('FV-17: .jsx 파일은 뷰어로 열 수 있다', () => {
    expect(isViewableFile('.jsx')).toBe(true)
  })

  it('FV-18: .tsx 파일은 뷰어로 열 수 있다', () => {
    expect(isViewableFile('.tsx')).toBe(true)
  })

  it('FV-19: .sh 파일은 뷰어로 열 수 있다', () => {
    expect(isViewableFile('.sh')).toBe(true)
  })

  it('FV-20: .csv 파일은 뷰어로 열 수 있다', () => {
    expect(isViewableFile('.csv')).toBe(true)
  })

  it('FV-21: .sql 파일은 뷰어로 열 수 있다', () => {
    expect(isViewableFile('.sql')).toBe(true)
  })

  it('FV-22: .html 파일은 뷰어로 열 수 있다', () => {
    expect(isViewableFile('.html')).toBe(true)
  })

  it('FV-23: .mp4 파일은 뷰어로 열 수 없다', () => {
    expect(isViewableFile('.mp4')).toBe(false)
  })

  it('FV-24: .docx 파일은 뷰어로 열 수 없다', () => {
    expect(isViewableFile('.docx')).toBe(false)
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

// ─── 인코딩 순환 (Auto/UTF-8/UTF-16/CP949/Johab) ──────────────────────────────

describe('ENCODINGS / nextEncoding', () => {
  it('EN-01: ENCODINGS 첫 항목은 auto', () => {
    expect(ENCODINGS[0]).toBe('auto')
  })

  it('EN-02: ENCODINGS는 6개 항목 (auto + 5개 인코딩)', () => {
    expect(ENCODINGS).toHaveLength(6)
  })

  it('EN-03: ENCODINGS는 johab을 포함한다 (조합형)', () => {
    expect(ENCODINGS).toContain('johab')
  })

  it('EN-04: ENCODING_LABELS는 모든 인코딩에 대한 라벨이 있다', () => {
    for (const e of ENCODINGS) {
      expect(ENCODING_LABELS[e]).toBeTruthy()
    }
  })

  it('EN-05: nextEncoding(auto) → utf-8', () => {
    expect(nextEncoding('auto')).toBe('utf-8')
  })

  it('EN-06: nextEncoding은 마지막에서 처음으로 순환', () => {
    const last = ENCODINGS[ENCODINGS.length - 1]
    expect(nextEncoding(last)).toBe('auto')
  })

  it('EN-07: 알 수 없는 인코딩은 auto로 폴백', () => {
    expect(nextEncoding('klingon')).toBe('auto')
  })

  it('EN-08: johab → 다음 항목으로 진행 (auto로 순환)', () => {
    // ENCODINGS 마지막이 johab이라는 가정 — 순환 동작 확인
    const idx = ENCODINGS.indexOf('johab')
    const expected = ENCODINGS[(idx + 1) % ENCODINGS.length]
    expect(nextEncoding('johab')).toBe(expected)
  })
})

// ─── 이미지 파일 판별 (Todo #52) ──────────────────────────────────────────────

describe('isImageFile / IMAGE_EXTS', () => {
  it('IMG-01: .png는 이미지 파일', () => {
    expect(isImageFile('.png')).toBe(true)
  })

  it('IMG-02: .jpg/.jpeg 둘 다 이미지', () => {
    expect(isImageFile('.jpg')).toBe(true)
    expect(isImageFile('.jpeg')).toBe(true)
  })

  it('IMG-03: 대문자 확장자도 이미지로 인식', () => {
    expect(isImageFile('.PNG')).toBe(true)
  })

  it('IMG-04: .txt는 이미지 아님', () => {
    expect(isImageFile('.txt')).toBe(false)
  })

  it('IMG-05: IMAGE_EXTS는 SVG/WebP/GIF 포함', () => {
    expect(IMAGE_EXTS.has('.svg')).toBe(true)
    expect(IMAGE_EXTS.has('.webp')).toBe(true)
    expect(IMAGE_EXTS.has('.gif')).toBe(true)
  })

  it('IMG-06: 이미지도 isViewableFile=true (F3로 열 수 있어야 함)', () => {
    expect(isViewableFile('.png')).toBe(true)
    expect(isViewableFile('.jpg')).toBe(true)
  })
})
