import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useEditorStore } from './editorStore'

// ─── Todo #123: 뷰어/에디터 열림 상태 (App 지역 상태 → 공용 스토어) ─────────────

describe('editorStore (ES)', () => {
  beforeEach(() => useEditorStore.getState().reset())

  it('ES-01: 뷰어 열기/닫기 — 경로·소스·형제 이미지, 닫을 때 onClose', () => {
    const onClose = vi.fn()
    const src = { remote: true }
    useEditorStore.getState().openViewer('/a.txt', { source: src, siblings: ['/a.png'], onClose })
    expect(useEditorStore.getState().viewer).toEqual({ path: '/a.txt', source: src, siblings: ['/a.png'], onClose })
    expect(useEditorStore.getState().closeViewer()).toBe(onClose)
    expect(useEditorStore.getState().viewer).toBeNull()
  })

  it('ES-02: 뷰어 ↔ 에디터 전환은 소스·onClose를 그대로', () => {
    const onClose = vi.fn()
    useEditorStore.getState().openViewer('/a.txt', { source: 'S', onClose })
    useEditorStore.getState().viewerToEditor()
    expect(useEditorStore.getState().viewer).toBeNull()
    expect(useEditorStore.getState().editor).toEqual({ path: '/a.txt', source: 'S', onClose })
    useEditorStore.getState().editorToViewer()
    expect(useEditorStore.getState().editor).toBeNull()
    expect(useEditorStore.getState().viewer).toMatchObject({ path: '/a.txt', source: 'S', onClose })
  })

  it('ES-03: 다른 이미지로 넘기기 (같은 소스)', () => {
    useEditorStore.getState().openViewer('/a.png', { source: 'S', siblings: ['/a.png', '/b.png'] })
    useEditorStore.getState().changeViewerPath('/b.png')
    expect(useEditorStore.getState().viewer).toMatchObject({ path: '/b.png', source: 'S' })
  })

  it('ES-04: 에디터 열기 — 로컬 파일은 소스 없음', () => {
    useEditorStore.getState().openEditor('/x.go')
    expect(useEditorStore.getState().editor).toEqual({ path: '/x.go', source: undefined, onClose: undefined })
    expect(useEditorStore.getState().closeEditor()).toBeUndefined()
  })
})
