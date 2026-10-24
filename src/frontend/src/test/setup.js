// vitest 전역 설정 (Todo #110)
// jsdom은 레이아웃을 계산하지 않아 CodeMirror가 쓰는 Range 측정 API가 없음 → 빈 값으로 대체
if (typeof Range !== 'undefined') {
  if (!Range.prototype.getClientRects) {
    Range.prototype.getClientRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: function* () {} })
  }
  if (!Range.prototype.getBoundingClientRect) {
    Range.prototype.getBoundingClientRect = () => ({ x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0 })
  }
}
if (typeof document !== 'undefined' && !document.elementFromPoint) {
  document.elementFromPoint = () => null
}

// jsdom에는 FontFace / document.fonts가 없음 — 터미널 cjkwidth.ts가 모듈 로드 시 사용 (Todo #119)
if (typeof globalThis.FontFace === 'undefined') {
  globalThis.FontFace = class FontFace {
    constructor(family, source, desc) { this.family = family; this.source = source; this.desc = desc }
    load() { return Promise.reject(new Error('no fonts in jsdom')) }
  }
}
if (typeof document !== 'undefined' && !document.fonts) {
  Object.defineProperty(document, 'fonts', { value: new Set(), configurable: true })
}

// jsdom에는 matchMedia가 없음 — 실제 xterm을 화면에 붙일 때(devicePixelRatio 감시) 사용 (Todo #120)
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false, media: query, onchange: null,
    addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false },
  })
}
