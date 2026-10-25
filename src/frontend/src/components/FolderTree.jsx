import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { ChevronRight, ChevronDown, Folder } from 'lucide-react'
import api from '../wailsjs/runtime'
import { isFtpPath, ftpId, ftpRoot } from '../utils/ftpPath.js'
import styles from '../styles/FolderTree.module.css'

// ─── 폴더 트리 (Ctrl+F8, Todo #133-10) — 패널 왼쪽, 지금 폴더까지 펼쳐 보여 줌 ────────────
// 하위 폴더는 펼칠 때 읽음(ListDirectory, 폴더만). 압축 파일 · FTP 경로도 같은 API라 그대로

// 루트부터 path까지의 폴더들 ("C:\a\b" → C:\, C:\a, C:\a\b)
export function ancestorsOf(path) {
  if (isFtpPath(path)) {
    const root = ftpRoot(ftpId(path))
    const segs = path.slice(root.length).split('/').filter(Boolean)
    return [root, ...segs.map((_, i) => root + segs.slice(0, i + 1).join('/'))]
  }
  const win = /^[A-Za-z]:/.test(path)
  const sep = win || path.includes('\\') ? '\\' : '/'
  const segs = path.split(/[/\\]/).filter(Boolean)
  if (win) {
    const root = segs[0] + '\\'
    return [root, ...segs.slice(1).map((_, i) => segs.slice(0, i + 2).join('\\'))]
  }
  return ['/', ...segs.map((_, i) => '/' + segs.slice(0, i + 1).join(sep))]
}

const nameOf = (p, isRoot) => isRoot ? p : p.split(/[/\\]/).filter(Boolean).pop()

export default function FolderTree({ path, showHidden, onNavigate }) {
  const [children, setChildren] = useState({}) // 폴더 → [{ name, path }] | 'loading' | { error }
  const [expanded, setExpanded] = useState(() => new Set())
  const [cursor, setCursor] = useState(path)
  const treeRef = useRef(null)
  const root = ancestorsOf(path || '/')[0]

  const load = useCallback(async (dir) => {
    setChildren(c => (c[dir] && c[dir] !== 'error' ? c : { ...c, [dir]: 'loading' }))
    try {
      const res = await api.ListDirectory(dir)
      const dirs = (res.files || []).filter(f => f.isDir).sort((a, b) => a.name.localeCompare(b.name))
      setChildren(c => ({ ...c, [dir]: dirs.map(f => ({ name: f.name, path: f.path, hidden: !!f.isHidden })) }))
    } catch (err) {
      setChildren(c => ({ ...c, [dir]: { error: String(err?.message ?? err) } }))
    }
  }, [])

  // 패널 폴더가 바뀌면 그 폴더까지 펼치고 읽기
  useEffect(() => {
    if (!path) return
    const chain = ancestorsOf(path)
    setExpanded(prev => new Set([...prev, ...chain]))
    setCursor(path)
    chain.forEach(dir => { if (!children[dir]) load(dir) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path])

  // 보이는 줄들 (깊이 우선). 지금 폴더로 가는 길은 목록에 없어도(압축 파일 등) 끼워 넣음
  const rows = useMemo(() => {
    const chain = new Set(ancestorsOf(path || '/'))
    const out = []
    const walk = (dir, depth) => {
      out.push({ path: dir, depth, name: nameOf(dir, depth === 0) })
      if (!expanded.has(dir)) return
      const kids = Array.isArray(children[dir]) ? children[dir].filter(k => showHidden || !k.hidden) : []
      const list = [...kids]
      for (const a of chain) {
        if (ancestorsOf(a).length === ancestorsOf(dir).length + 1 && a.toLowerCase().startsWith(dir.toLowerCase())
          && !list.some(k => k.path.toLowerCase() === a.toLowerCase())) list.push({ name: nameOf(a), path: a })
      }
      for (const k of list) walk(k.path, depth + 1)
    }
    walk(root, 0)
    return out
  }, [root, children, expanded, showHidden, path])

  const toggle = (p) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(p)) next.delete(p)
      else { next.add(p); if (!children[p]) load(p) }
      return next
    })
  }

  const parentOf = (p) => { const a = ancestorsOf(p); return a.length > 1 ? a[a.length - 2] : null }

  const onKeyDown = (e) => {
    const i = Math.max(0, rows.findIndex(r => r.path === cursor))
    const cur = rows[i]
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); if (rows[i + 1]) setCursor(rows[i + 1].path); break
      case 'ArrowUp': e.preventDefault(); if (i > 0) setCursor(rows[i - 1].path); break
      case 'ArrowRight':
        e.preventDefault()
        if (!expanded.has(cur.path)) toggle(cur.path)
        else if (rows[i + 1]?.depth > cur.depth) setCursor(rows[i + 1].path)
        break
      case 'ArrowLeft':
        e.preventDefault()
        if (expanded.has(cur.path) && cur.depth > 0) toggle(cur.path)
        else { const p = parentOf(cur.path); if (p) setCursor(p) }
        break
      case 'Enter': e.preventDefault(); e.stopPropagation(); onNavigate(cur.path); break
      default: return
    }
    e.stopPropagation() // 화살표가 파일 목록으로 가지 않게
  }

  useEffect(() => {
    treeRef.current?.querySelector('[data-cursor="true"]')?.scrollIntoView?.({ block: 'nearest' })
  }, [cursor])

  return (
    <div className={styles.tree} role="tree" aria-label="폴더 트리" tabIndex={0} ref={treeRef}
      onKeyDown={onKeyDown} onClick={e => e.stopPropagation()}>
      {rows.map(r => {
        const open = expanded.has(r.path)
        const state = children[r.path]
        const leaf = Array.isArray(state) && state.filter(k => showHidden || !k.hidden).length === 0 && !rows.some(x => x.depth > r.depth && parentOf(x.path) === r.path)
        return (
          <div key={r.path} role="treeitem" aria-expanded={open} data-path={r.path}
            aria-current={r.path === path ? 'true' : undefined} data-cursor={r.path === cursor ? 'true' : undefined}
            className={`${styles.row} ${r.path === path ? styles.current : ''} ${r.path === cursor ? styles.cursor : ''}`}
            style={{ paddingLeft: 4 + r.depth * 12 }}
            title={state?.error || r.path}>
            <span data-toggle className={styles.toggle} onClick={() => toggle(r.path)}>
              {leaf ? null : open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
            </span>
            <Folder size={12} className={styles.icon} />
            <span className={styles.name} onClick={() => { setCursor(r.path); onNavigate(r.path) }}>{r.name}</span>
          </div>
        )
      })}
    </div>
  )
}

