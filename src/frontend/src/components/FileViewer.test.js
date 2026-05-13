import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { isViewableFile, clampFontSize, isMarkdownFile, MIN_FONT, MAX_FONT, getWordWrapStyle, ENCODINGS, ENCODING_LABELS, nextEncoding, isImageFile, IMAGE_EXTS, siblingImagePath, isSwitchToEditorShortcut, multiplyImageScale, MIN_IMAGE_SCALE, MAX_IMAGE_SCALE, DEFAULT_IMAGE_SCALE, IMAGE_SCALE_STEP, isImageZoomInShortcut, isImageZoomOutShortcut, isImageZoomResetShortcut, imageScrollDelta, IMAGE_SCROLL_STEP, getImageStyle } from './FileViewer.jsx'

const __dirname = dirname(fileURLToPath(import.meta.url))

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

// ─── siblingImagePath (이미지 뷰어 ←/→ 네비게이션) ───────────────────────────

describe('siblingImagePath', () => {
  const sibs = ['/d/a.png', '/d/b.jpg', '/d/c.gif']

  it('IMN-01: next는 다음 이미지로', () => {
    expect(siblingImagePath(sibs, '/d/a.png', 'next')).toBe('/d/b.jpg')
  })

  it('IMN-02: prev는 이전 이미지로', () => {
    expect(siblingImagePath(sibs, '/d/b.jpg', 'prev')).toBe('/d/a.png')
  })

  it('IMN-03: 마지막에서 next는 첫 번째로 순환', () => {
    expect(siblingImagePath(sibs, '/d/c.gif', 'next')).toBe('/d/a.png')
  })

  it('IMN-04: 첫 번째에서 prev는 마지막으로 순환', () => {
    expect(siblingImagePath(sibs, '/d/a.png', 'prev')).toBe('/d/c.gif')
  })

  it('IMN-05: 현재 경로가 siblings에 없으면 null', () => {
    expect(siblingImagePath(sibs, '/other/x.png', 'next')).toBeNull()
  })

  it('IMN-06: siblings가 비어있으면 null', () => {
    expect(siblingImagePath([], '/d/a.png', 'next')).toBeNull()
  })

  it('IMN-07: siblings가 1개뿐이면 이동 불가 (null)', () => {
    expect(siblingImagePath(['/d/a.png'], '/d/a.png', 'next')).toBeNull()
  })

  it('IMN-08: null/undefined siblings는 안전 처리 (null)', () => {
    expect(siblingImagePath(null, '/d/a.png', 'next')).toBeNull()
    expect(siblingImagePath(undefined, '/d/a.png', 'next')).toBeNull()
  })
})

// ─── Todo #58: 모달 95% 크기 ──────────────────────────────────────────────────

describe('FileViewer 모달 크기 (Todo #58)', () => {
  const css = readFileSync(
    resolve(__dirname, '../styles/FileViewer.module.css'),
    'utf8'
  )
  const viewerBlock = css.match(/\.viewer\s*\{([^}]+)\}/)?.[1] ?? ''

  it('VS-01: .viewer는 너비 95vw로 설정된다', () => {
    expect(viewerBlock).toMatch(/width:\s*95vw/)
  })

  it('VS-02: .viewer는 높이 95vh로 설정된다', () => {
    expect(viewerBlock).toMatch(/height:\s*95vh/)
  })

  it('VS-03: .viewer max-width는 95vw 이내로 제한된다', () => {
    expect(viewerBlock).toMatch(/max-width:\s*95vw/)
  })

  it('VS-04: .viewer max-height는 95vh 이내로 제한된다', () => {
    expect(viewerBlock).toMatch(/max-height:\s*95vh/)
  })
})

// ─── Todo #63: F3 이미지 뷰어 Ctrl +/- / Ctrl+휠 줌 ───────────────────────────

describe('multiplyImageScale (Todo #63)', () => {
  it('IZ-01: 1.0 × STEP → 확대 (1.0보다 큼)', () => {
    expect(multiplyImageScale(DEFAULT_IMAGE_SCALE, IMAGE_SCALE_STEP)).toBeGreaterThan(DEFAULT_IMAGE_SCALE)
  })

  it('IZ-02: 1.0 ÷ STEP → 축소 (1.0보다 작음)', () => {
    expect(multiplyImageScale(DEFAULT_IMAGE_SCALE, 1 / IMAGE_SCALE_STEP)).toBeLessThan(DEFAULT_IMAGE_SCALE)
  })

  it('IZ-03: 최대값(MAX_IMAGE_SCALE)을 초과하지 않는다', () => {
    expect(multiplyImageScale(MAX_IMAGE_SCALE, 2)).toBe(MAX_IMAGE_SCALE)
  })

  it('IZ-04: 최소값(MIN_IMAGE_SCALE) 미만으로 내려가지 않는다', () => {
    expect(multiplyImageScale(MIN_IMAGE_SCALE, 0.5)).toBe(MIN_IMAGE_SCALE)
  })

  it('IZ-05: factor=1이면 scale이 변하지 않는다', () => {
    expect(multiplyImageScale(1.5, 1)).toBe(1.5)
  })

  it('IZ-06: 기본 scale은 1.0', () => {
    expect(DEFAULT_IMAGE_SCALE).toBe(1)
  })

  it('IZ-07: MIN < DEFAULT < MAX (범위 정합성)', () => {
    expect(MIN_IMAGE_SCALE).toBeLessThan(DEFAULT_IMAGE_SCALE)
    expect(DEFAULT_IMAGE_SCALE).toBeLessThan(MAX_IMAGE_SCALE)
  })

  it('IZ-08: IMAGE_SCALE_STEP은 1보다 큰 곱셈 인자', () => {
    expect(IMAGE_SCALE_STEP).toBeGreaterThan(1)
  })
})

describe('isImageZoomInShortcut (Todo #63)', () => {
  it('IZI-01: Ctrl + "+" 는 확대 단축키', () => {
    expect(isImageZoomInShortcut({ key: '+', ctrlKey: true })).toBe(true)
  })

  it('IZI-02: Ctrl + "=" 도 확대 단축키 (Shift 없이 + 입력)', () => {
    expect(isImageZoomInShortcut({ key: '=', ctrlKey: true })).toBe(true)
  })

  it('IZI-03: Cmd + "+" (macOS) 도 확대 단축키', () => {
    expect(isImageZoomInShortcut({ key: '+', metaKey: true })).toBe(true)
  })

  it('IZI-04: 모디파이어 없는 "+" 는 확대 아님', () => {
    expect(isImageZoomInShortcut({ key: '+' })).toBe(false)
  })

  it('IZI-05: Ctrl + "-" 는 확대 아님', () => {
    expect(isImageZoomInShortcut({ key: '-', ctrlKey: true })).toBe(false)
  })
})

describe('isImageZoomOutShortcut (Todo #63)', () => {
  it('IZO-01: Ctrl + "-" 는 축소 단축키', () => {
    expect(isImageZoomOutShortcut({ key: '-', ctrlKey: true })).toBe(true)
  })

  it('IZO-02: Cmd + "-" (macOS) 도 축소 단축키', () => {
    expect(isImageZoomOutShortcut({ key: '-', metaKey: true })).toBe(true)
  })

  it('IZO-03: 모디파이어 없는 "-" 는 축소 아님', () => {
    expect(isImageZoomOutShortcut({ key: '-' })).toBe(false)
  })

  it('IZO-04: Ctrl + "+" 는 축소 아님', () => {
    expect(isImageZoomOutShortcut({ key: '+', ctrlKey: true })).toBe(false)
  })
})

describe('isImageZoomResetShortcut (Todo #63)', () => {
  it('IZR-01: Ctrl + "0" 는 리셋 단축키', () => {
    expect(isImageZoomResetShortcut({ key: '0', ctrlKey: true })).toBe(true)
  })

  it('IZR-02: Cmd + "0" (macOS) 도 리셋 단축키', () => {
    expect(isImageZoomResetShortcut({ key: '0', metaKey: true })).toBe(true)
  })

  it('IZR-03: 모디파이어 없는 "0" 는 리셋 아님', () => {
    expect(isImageZoomResetShortcut({ key: '0' })).toBe(false)
  })
})

// ─── Todo #64: 이미지 뷰어 vi 스타일 스크롤 (h/j/k/l) ─────────────────────────

describe('imageScrollDelta (Todo #64)', () => {
  it('ISC-01: h → 왼쪽 (dx < 0, dy = 0)', () => {
    expect(imageScrollDelta('h')).toEqual({ dx: -IMAGE_SCROLL_STEP, dy: 0 })
  })

  it('ISC-02: l → 오른쪽 (dx > 0, dy = 0)', () => {
    expect(imageScrollDelta('l')).toEqual({ dx: IMAGE_SCROLL_STEP, dy: 0 })
  })

  it('ISC-03: j → 아래 (dx = 0, dy > 0)', () => {
    expect(imageScrollDelta('j')).toEqual({ dx: 0, dy: IMAGE_SCROLL_STEP })
  })

  it('ISC-04: k → 위 (dx = 0, dy < 0)', () => {
    expect(imageScrollDelta('k')).toEqual({ dx: 0, dy: -IMAGE_SCROLL_STEP })
  })

  it('ISC-05: 다른 키는 null', () => {
    expect(imageScrollDelta('a')).toBeNull()
    expect(imageScrollDelta('Enter')).toBeNull()
    expect(imageScrollDelta('ArrowLeft')).toBeNull()
  })

  it('ISC-06: 대문자 H/J/K/L 은 null (소문자만 매칭)', () => {
    expect(imageScrollDelta('H')).toBeNull()
    expect(imageScrollDelta('J')).toBeNull()
    expect(imageScrollDelta('K')).toBeNull()
    expect(imageScrollDelta('L')).toBeNull()
  })

  it('ISC-07: IMAGE_SCROLL_STEP 은 양수', () => {
    expect(IMAGE_SCROLL_STEP).toBeGreaterThan(0)
  })

  it('ISC-08: 빈 문자열/undefined 키는 null', () => {
    expect(imageScrollDelta('')).toBeNull()
    expect(imageScrollDelta(undefined)).toBeNull()
  })
})

// ─── Todo #65: 이미지 확대 시 좌측 짤림 수정 (transform:scale → zoom) ─────────

describe('getImageStyle (Todo #65)', () => {
  it('IST-01: zoom 값이 imageScale과 같다 (레이아웃과 시각 일치)', () => {
    expect(getImageStyle(2).zoom).toBe(2)
    expect(getImageStyle(0.5).zoom).toBe(0.5)
  })

  it('IST-02: transform: scale()은 사용하지 않는다 (스크롤 영역과 시각 불일치 원인)', () => {
    const style = getImageStyle(2)
    expect(style.transform).toBeUndefined()
  })

  it('IST-03: transformOrigin은 사용하지 않는다 (transform 미사용)', () => {
    const style = getImageStyle(2)
    expect(style.transformOrigin).toBeUndefined()
  })

  it('IST-04: objectFit은 contain (이미지 비율 유지)', () => {
    expect(getImageStyle(1).objectFit).toBe('contain')
  })

  it('IST-05: maxWidth/maxHeight는 100% (zoom=1일 때 컨테이너 fit)', () => {
    const style = getImageStyle(1)
    expect(style.maxWidth).toBe('100%')
    expect(style.maxHeight).toBe('100%')
  })

  it('IST-06: scale > 1 일 때 zoom-out 커서', () => {
    expect(getImageStyle(2).cursor).toBe('zoom-out')
  })

  it('IST-07: scale <= 1 일 때 zoom-in 커서', () => {
    expect(getImageStyle(1).cursor).toBe('zoom-in')
    expect(getImageStyle(0.5).cursor).toBe('zoom-in')
  })

  it('IST-08: 기본 scale(1.0)일 때 zoom 값이 1', () => {
    expect(getImageStyle(DEFAULT_IMAGE_SCALE).zoom).toBe(1)
  })
})

// ─── Todo #59: F4 = 뷰어 → 에디터 전환 ────────────────────────────────────────

describe('isSwitchToEditorShortcut (Todo #59)', () => {
  it('SE-01: F4는 에디터 전환 단축키', () => {
    expect(isSwitchToEditorShortcut({ key: 'F4' })).toBe(true)
  })

  it('SE-02: F3는 에디터 전환 단축키 아님', () => {
    expect(isSwitchToEditorShortcut({ key: 'F3' })).toBe(false)
  })

  it('SE-03: Ctrl+F4는 에디터 전환 아님 (모디파이어 제외)', () => {
    expect(isSwitchToEditorShortcut({ key: 'F4', ctrlKey: true })).toBe(false)
  })

  it('SE-04: Alt+F4는 에디터 전환 아님 (창 닫기와 충돌 방지)', () => {
    expect(isSwitchToEditorShortcut({ key: 'F4', altKey: true })).toBe(false)
  })

  it('SE-05: Cmd+F4 (macOS)도 에디터 전환 아님', () => {
    expect(isSwitchToEditorShortcut({ key: 'F4', metaKey: true })).toBe(false)
  })

  it('SE-06: F5는 에디터 전환 아님', () => {
    expect(isSwitchToEditorShortcut({ key: 'F5' })).toBe(false)
  })
})
