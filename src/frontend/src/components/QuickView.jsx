import React, { useEffect, useState } from 'react'
import { Eye } from 'lucide-react'
import api from '../wailsjs/runtime'
import { isTextFile, isImageFile, exceedsViewerLimit, formatSize, formatDate } from '../utils/fileTypes.js'
import { renderMarkdown, isMarkdownFile } from './FileViewer.jsx'
import styles from '../styles/QuickView.module.css'

// ─── 빠른 보기 (Ctrl+Q, Todo #133-9) — Total Commander처럼 반대 패널 자리에 커서 파일 미리 보기 ──
// 커서가 멈추면(150ms) 읽고, 그 사이 다른 파일로 옮기면 앞의 요청은 버림. 텍스트는 앞 256KB만

export const QUICK_TEXT_LIMIT = 256 * 1024
const DEBOUNCE_MS = 150

export default function QuickView({ file, dirSize }) {
  const [state, setState] = useState({ kind: 'none' })

  useEffect(() => {
    if (!file) { setState({ kind: 'none' }); return }
    const ext = file.extension || ''
    if (file.isDir) { setState({ kind: 'dir' }); return }
    if (!isTextFile(ext) && !isImageFile(ext)) { setState({ kind: 'other' }); return }
    if (exceedsViewerLimit(file.size)) { setState({ kind: 'big' }); return }
    setState({ kind: 'loading' })
    let cancelled = false
    const t = setTimeout(async () => {
      try {
        if (isImageFile(ext)) {
          const src = await api.ReadImageFile(file.path)
          if (!cancelled) setState({ kind: 'image', src })
          return
        }
        const text = await api.ReadTextFile(file.path)
        if (cancelled) return
        if (isMarkdownFile(ext)) setState({ kind: 'markdown', html: renderMarkdown(text) })
        else setState({ kind: 'text', text: text.slice(0, QUICK_TEXT_LIMIT), cut: text.length > QUICK_TEXT_LIMIT })
      } catch (err) {
        if (!cancelled) setState({ kind: 'error', message: String(err?.message ?? err) })
      }
    }, DEBOUNCE_MS)
    return () => { cancelled = true; clearTimeout(t) }
  }, [file?.path, file?.size, file?.modified])

  return (
    <section className={styles.quick} role="region" aria-label="빠른 보기">
      <div className={styles.header}>
        <Eye size={13} />
        <span className={styles.name} title={file?.path}>{file ? file.name : '빠른 보기'}</span>
        {file && !file.isDir && <span className={styles.meta}>{formatSize(file.size, false)} · {formatDate(file.modified)}</span>}
        <span className={styles.hint}>Ctrl+Q 닫기</span>
      </div>
      <div className={styles.body}>
        {state.kind === 'none' && <p className={styles.dim}>파일을 고르면 여기에 미리 보입니다</p>}
        {state.kind === 'dir' && <p className={styles.dim}>폴더 — {dirSize !== undefined ? `크기 ${formatSize(dirSize, false)}` : 'Space로 크기 계산'}</p>}
        {state.kind === 'other' && <p className={styles.dim}>미리 볼 수 없는 파일입니다 (Enter로 열기)</p>}
        {state.kind === 'big' && <p className={styles.dim}>너무 커서 미리 보지 않습니다</p>}
        {state.kind === 'loading' && <p className={styles.dim}>읽는 중...</p>}
        {state.kind === 'error' && <p className={styles.error}>{state.message}</p>}
        {state.kind === 'image' && <img className={styles.image} src={state.src} alt={file?.name} />}
        {state.kind === 'markdown' && <div className={styles.markdown} dangerouslySetInnerHTML={{ __html: state.html }} />}
        {state.kind === 'text' && <>
          <pre className={styles.text}>{state.text}</pre>
          {state.cut && <p className={styles.dim}>앞부분만 보입니다 — F3으로 전체 보기</p>}
        </>}
      </div>
    </section>
  )
}
