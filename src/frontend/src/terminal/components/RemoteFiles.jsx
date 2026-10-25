import React, { useEffect, useRef, useState } from 'react'
import { X, ArrowUp, RefreshCw, Upload, Download, FolderPlus, FilePlus, Pencil, Trash2, ChevronDown } from 'lucide-react'
import { useFilesStore } from '../store/filesStore'
import { useFileStore } from '../../stores/fileStore'
import { formatSize, folderKey, isUp, pickedEntries, deleteMessage, transferText, transferPercent } from '../core/remoteFiles'
import styles from '../styles/Terminal.module.css'

// 원격 파일 창 (Ctrl+Shift+F, Todo #123, choboTerm files.ts): SSH 연결은 SFTP(없으면 SCP), FTP 연결은 FTP.
// "⬇ 패널로"·"⬆ 패널에서"로 파일 관리자의 활성 패널 폴더와 주고받습니다.

// 확인/이름 입력 창
function Ask({ ask, onDone }) {
  const [text, setText] = useState(ask.value ?? '')
  const ref = useRef(null)
  useEffect(() => { ref.current?.focus(); ref.current?.select?.() }, [])
  const ok = () => onDone(ask.input ? text.trim() || null : true)
  return (
    <div className={styles.modalOverlay}>
      <div className={styles.dialog} role="alertdialog" aria-label={ask.title}
        onKeyDown={e => {
          e.stopPropagation()
          if (e.key === 'Escape') { e.preventDefault(); onDone(null) }
          else if (e.key === 'Enter' && e.target.tagName !== 'BUTTON') { e.preventDefault(); ok() }
        }}>
        <div className={styles.dialogHeader}><span>{ask.title}</span></div>
        <div className={styles.message}>{ask.message}</div>
        {ask.input && <input ref={ref} value={text} onChange={e => setText(e.target.value)} spellCheck={false} autoComplete="off" />}
        <div className={styles.dialogActions}>
          <button type="button" onClick={() => onDone(null)}>취소</button>
          <button type="button" ref={ask.input ? undefined : ref} className={styles.primary} onClick={ok}>{ask.okLabel ?? '확인'}</button>
        </div>
      </div>
    </div>
  )
}

export default function RemoteFiles({ id }) {
  const v = useFilesStore(s => s.views[id])
  const xfer = useFilesStore(s => s.xfer)
  const panelPath = useFileStore(s => s[s.activePanel]?.path)
  const [pathText, setPathText] = useState(v?.cwd ?? '')
  const [ask, setAsk] = useState(null) // { title, message, input?, value?, okLabel, then }
  const [marksOpen, setMarksOpen] = useState(false)
  const [menu, setMenu] = useState(null) // {x, y}
  const gridRef = useRef(null)
  const st = useFilesStore.getState()

  useEffect(() => { gridRef.current?.focus() }, [])
  useEffect(() => { if (v) setPathText(v.cwd) }, [v?.cwd])
  // 선택한 줄이 보이게
  useEffect(() => { gridRef.current?.querySelector('[data-cur]')?.scrollIntoView?.({ block: 'nearest' }) }, [v?.selected])
  useEffect(() => {
    const hide = () => { setMarksOpen(false); setMenu(null) }
    window.addEventListener('mousedown', hide)
    // Explorer에서 끌어 놓은 파일·폴더 올리기 (Wails, 목록만 받음)
    const rt = typeof window !== 'undefined' ? window.runtime : null
    rt?.OnFileDrop?.((_x, _y, paths) => useFilesStore.getState().uploadPaths(id, paths ?? []), true)
    return () => { window.removeEventListener('mousedown', hide); rt?.OnFileDropOff?.() }
  }, [id])

  if (!v) return null
  const list = pickedEntries(v)
  const one = list.length === 1 ? list[0] : undefined
  const focusGrid = () => requestAnimationFrame(() => gridRef.current?.focus())
  const marked = v.marks.includes(folderKey(v.cwd))

  function confirm(a) { setAsk(a) }
  function answer(r) {
    const a = ask
    setAsk(null)
    focusGrid()
    if (r != null && r !== false) a.then(r)
  }

  const askDelete = () => list.length && !v.busy && confirm({ title: '삭제', message: deleteMessage(list), okLabel: '삭제', then: () => st.remove(id, list) })
  const askRename = () => one && !v.busy && confirm({ title: '이름 바꾸기', message: `"${one.name}"의 새 이름:`, input: true, value: one.name, then: (n) => n !== one.name && st.rename(id, one.name, n) })
  const askMkdir = () => !v.busy && confirm({ title: '새 폴더', message: `${v.cwd} 안에 만들 폴더 이름:`, input: true, then: (n) => st.mkdir(id, n) })
  const askNewFile = () => !v.busy && confirm({ title: '새 파일', message: `${v.cwd} 안에 만들 빈 파일 이름:`, input: true, then: (n) => st.newFile(id, n) })

  function onKeyDown(e) {
    e.stopPropagation()
    if (e.ctrlKey && !e.shiftKey && !e.altKey && /^[1-9]$/.test(e.key)) { e.preventDefault(); st.goToMark(id, Number(e.key)); return }
    const mode = e.shiftKey ? 'range' : 'one'
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key
    switch (k) {
      case 'Escape':
        if (menu || marksOpen) { setMenu(null); setMarksOpen(false) } else st.close(id)
        break
      case 'ArrowDown': st.select(id, v.selected + 1, mode); break
      case 'ArrowUp':
        if (e.altKey) st.goUp(id)
        else st.select(id, Math.max(0, v.selected - 1), mode)
        break
      case 'Home': st.select(id, 0, mode); break
      case 'End': st.select(id, v.entries.length - 1, mode); break
      case 'Enter':
        if (v.picked.size > 1) st.download(id)
        else st.enter(id, v.selected)
        break
      case 'Backspace': st.goUp(id); break
      case 'ArrowLeft': if (!e.altKey) return; st.goUp(id); break
      case 'F5': if (!v.busy) st.refresh(id); break
      case 'Delete': askDelete(); break
      case 'F2': askRename(); break
      case 'F4': if (!e.shiftKey) return; askNewFile(); break
      case 'F7': askMkdir(); break
      case 'a': if (!e.ctrlKey) return; st.selectAll(id); break
      case 'd': if (!e.ctrlKey || e.shiftKey) return; st.toggleMark(id); break
      case 'b': if (!e.ctrlKey || e.shiftKey) return; st.reloadMarks(id).then(() => setMarksOpen(true)); break
      default: return
    }
    e.preventDefault()
  }

  const recent = v.recent.filter(d => !v.marks.includes(d))
  const markItem = (label, dir, hint, removable) => (
    <li key={`${label}:${dir}`} role="menuitem" title={dir}
      className={`${styles.menuItem} ${folderKey(dir) === folderKey(v.cwd) ? styles.menuChecked : ''}`}
      onClick={() => { setMarksOpen(false); st.goTo(id, dir); focusGrid() }}>
      <span>{label}</span>
      {hint && <span className={styles.dim}>{hint}</span>}
      {removable && <span className={styles.markRemove} title="즐겨찾기에서 빼기" onClick={e => { e.stopPropagation(); st.removeMark(id, dir) }}>✕</span>}
    </li>
  )

  const menuItem = (label, act, enabled = true) => (
    <li role="menuitem" aria-disabled={!enabled || v.busy || undefined}
      className={`${styles.menuItem} ${!enabled || v.busy ? styles.menuDisabled : ''}`}
      onClick={() => { if (!enabled || v.busy) return; setMenu(null); act() }}>{label}</li>
  )

  const showXfer = xfer && xfer.tabId === id
  return (
    <div className={styles.filesOverlay}>
      <div className={`${styles.dialog} ${styles.filesWin}`} role="dialog" aria-label={v.heading} onKeyDown={onKeyDown}>
        <div className={styles.dialogHeader}>
          <span>{v.heading}</span>
          <button type="button" className={styles.iconBtn} title="닫기 (Esc)" onClick={() => st.close(id)}><X size={13} /></button>
        </div>
        <div className={styles.filesBar}>
          <button type="button" title="상위 폴더 (Backspace)" disabled={v.busy} onClick={() => st.goUp(id)}><ArrowUp size={13} /></button>
          <input aria-label="원격 경로" value={pathText} spellCheck={false} autoComplete="off"
            onChange={e => setPathText(e.target.value)}
            onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); st.load(id, pathText.trim() || '/'); focusGrid() } }} />
          <button type="button" className={marked ? styles.starOn : ''} title={marked ? '즐겨찾기에서 빼기 (Ctrl+D)' : '즐겨찾기에 추가 (Ctrl+D)'}
            onClick={() => st.toggleMark(id)}>{marked ? '★' : '☆'}</button>
          <span className={styles.smMoreBox}>
            <button type="button" title="즐겨찾기 (Ctrl+B)" onMouseDown={e => { e.stopPropagation(); e.preventDefault() }}
              onClick={() => (marksOpen ? setMarksOpen(false) : st.reloadMarks(id).then(() => setMarksOpen(true)))}><ChevronDown size={13} /></button>
            {marksOpen && (
              <ul role="menu" aria-label="즐겨찾기" className={`${styles.menu} ${styles.marksMenu}`} onMouseDown={e => { e.stopPropagation(); e.preventDefault() }}>
                <li className={styles.menuLabel}>즐겨찾기</li>
                {v.marks.length === 0 && <li className={styles.menuLabel}>없음: ☆ 또는 Ctrl+D로 지금 폴더를 추가합니다</li>}
                {v.marks.map((d, i) => markItem(d, d, i < 9 ? `Ctrl+${i + 1}` : '', true))}
                <li className={styles.menuSep} role="separator" />
                <li className={styles.menuLabel}>바로가기</li>
                {markItem(`홈 폴더 (${v.home})`, v.home)}
                {folderKey(v.home) !== '/' && markItem('/ (최상위 폴더)', '/')}
                {recent.length > 0 && <li className={styles.menuSep} role="separator" />}
                {recent.length > 0 && <li className={styles.menuLabel}>최근 폴더</li>}
                {recent.map(d => markItem(d, d))}
              </ul>
            )}
          </span>
          <button type="button" title="새로 고침 (F5)" disabled={v.busy} onClick={() => st.refresh(id)}><RefreshCw size={13} /></button>
        </div>
        <div className={styles.filesList} style={{ '--wails-drop-target': 'drop' }}
          onContextMenu={e => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY }) }}>
          <table role="grid" tabIndex={0} ref={gridRef} aria-label="원격 파일 목록">
            <thead><tr><th>이름</th><th className={styles.num}>크기</th><th>수정한 때</th></tr></thead>
            <tbody>
              {v.entries.map((e, i) => (
                <tr key={isUp(e) ? '..up' : e.name} role="row" aria-selected={v.picked.has(i)} data-cur={i === v.selected ? '' : undefined}
                  className={`${e.isDir ? styles.fDir : ''} ${v.picked.has(i) ? styles.fSel : ''} ${i === v.selected ? styles.fCur : ''}`}
                  onMouseDown={ev => {
                    if (ev.button === 2 && v.picked.has(i)) return // 우클릭은 여러 선택 유지
                    st.select(id, i, ev.shiftKey ? 'range' : ev.ctrlKey ? 'toggle' : 'one')
                  }}
                  onDoubleClick={ev => { if (!ev.ctrlKey && !ev.shiftKey) st.enter(id, i) }}>
                  <td>{isUp(e) ? '.. (상위 폴더)' : e.name}</td>
                  <td className={styles.num}>{e.isDir ? '' : formatSize(e.size)}</td>
                  <td>{e.modTime}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {showXfer && (
          <div className={styles.xfer}>
            <span>{`${xfer.upload ? '⬆' : '⬇'} ${xfer.name}`}</span>
            <div className={styles.xferTrack} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={transferPercent(xfer)}>
              <div className={styles.xferBar} style={{ width: `${transferPercent(xfer)}%` }} />
            </div>
            <span className={styles.dim}>{transferText(xfer, xfer.secs)}</span>
            <button type="button" onClick={() => st.cancelTransfer()}>전송 취소</button>
          </div>
        )}
        {v.status && <div className={v.statusOk ? styles.okMsg : styles.error} role={v.statusOk ? 'status' : 'alert'}>{v.status}</div>}
        <div className={styles.dialogActions}>
          <button type="button" title="파일 올리기" disabled={v.busy} onClick={() => st.upload(id)}><Upload size={12} /> 업로드</button>
          <button type="button" title="받기 (Enter)" disabled={v.busy || !list.length} onClick={() => st.download(id)}><Download size={12} /> 다운로드</button>
          <button type="button" title={`파일 패널 폴더(${panelPath ?? ''})로 받기`} disabled={v.busy || !list.length || !panelPath}
            onClick={() => st.downloadToPanel(id)}>⬇ 패널로</button>
          <button type="button" title="파일 패널에서 고른 항목을 지금 폴더로 올리기" disabled={v.busy} onClick={() => st.uploadFromPanel(id)}>⬆ 패널에서</button>
          <button type="button" title="새 폴더 (F7)" disabled={v.busy} onClick={askMkdir}><FolderPlus size={12} /> 새 폴더</button>
          <button type="button" title="새 파일 (Shift+F4)" disabled={v.busy} onClick={askNewFile}><FilePlus size={12} /> 새 파일</button>
          <button type="button" title="이름 바꾸기 (F2)" disabled={v.busy || !one} onClick={askRename}><Pencil size={12} /> 이름 바꾸기</button>
          <button type="button" title="삭제 (Delete)" disabled={v.busy || !list.length} onClick={askDelete}><Trash2 size={12} /> 삭제</button>
        </div>
      </div>
      {menu && (
        <ul role="menu" aria-label="파일 메뉴" className={styles.menu} style={{ left: menu.x, top: menu.y }} onMouseDown={e => e.stopPropagation()}>
          {menuItem(one?.isDir ? '열기' : '다운로드', () => (one?.isDir ? st.enter(id, v.entries.indexOf(one)) : st.download(id)), list.length > 0)}
          {menuItem('파일 패널 폴더로 받기', () => st.downloadToPanel(id), list.length > 0 && !!panelPath)}
          {menuItem('이름 바꾸기 (F2)', askRename, !!one)}
          {menuItem('삭제 (Delete)', askDelete, list.length > 0)}
          <li className={styles.menuSep} role="separator" />
          {menuItem('새 폴더 (F7)', askMkdir)}
          {menuItem('새 파일 (Shift+F4)', askNewFile)}
          {menuItem('업로드...', () => st.upload(id))}
          {menuItem('새로 고침 (F5)', () => st.refresh(id))}
        </ul>
      )}
      {ask && <Ask ask={ask} onDone={answer} />}
    </div>
  )
}
