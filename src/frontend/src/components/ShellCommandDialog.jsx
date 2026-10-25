import React, { useState, useEffect, useRef } from 'react'
import { X, Terminal } from 'lucide-react'
import api from '../wailsjs/runtime'
import Modal from './DialogModal.jsx'
import styles from '../styles/Dialogs.module.css'

// ─── Shell Command Dialog ─────────────────────────────────────────────────────

export function ShellCommandDialog({ workDir, onClose }) {
  const [command, setCommand]   = useState('')
  const [output, setOutput]     = useState(null)
  const [running, setRunning]   = useState(false)
  const [exitError, setExitError] = useState(false)
  const [history, setHistory]   = useState([])
  const [histIdx, setHistIdx]   = useState(-1)
  const inputRef  = useRef(null)
  const outputRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  useEffect(() => {
    if (output !== null) {
      outputRef.current?.scrollTo(0, outputRef.current.scrollHeight)
    }
  }, [output])

  const handleRun = async (e) => {
    e?.preventDefault()
    if (!command.trim() || running) return
    setRunning(true)
    setOutput(null)
    setExitError(false)
    try {
      const result = await api.RunShellCommand(command.trim(), workDir)
      setOutput(result)
      setExitError(false)
    } catch (err) {
      // Wails wraps non-zero exit codes as errors; output is in the message
      const msg = String(err)
      // Try to extract combined output from error message
      setOutput(msg)
      setExitError(true)
    } finally {
      setHistory(prev => [command.trim(), ...prev.filter(c => c !== command.trim())].slice(0, 50))
      setHistIdx(-1)
      setRunning(false)
      inputRef.current?.select()
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (history.length === 0) return // 히스토리가 없으면 입력 중인 명령 유지 (Todo #100)
      const next = Math.min(histIdx + 1, history.length - 1)
      setHistIdx(next)
      setCommand(history[next] ?? '')
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      const next = histIdx - 1
      if (next < 0) { setHistIdx(-1); setCommand('') }
      else { setHistIdx(next); setCommand(history[next]) }
    }
  }

  return (
    <Modal onClose={onClose} width={620}>
      <div className={styles.header}>
        <Terminal size={15} />
        <span>Shell Command</span>
        <span className={styles.shellWorkDir}>{workDir}</span>
        <button className={styles.closeBtn} onClick={onClose}><X size={13} /></button>
      </div>
      <form onSubmit={handleRun}>
        <div className={styles.body}>
          <div className={styles.searchForm}>
            <input
              ref={inputRef}
              className={styles.input}
              value={command}
              onChange={e => { setCommand(e.target.value); setHistIdx(-1) }}
              onKeyDown={handleKeyDown}
              placeholder="명령어 입력 (↑↓ 히스토리)"
              spellCheck={false}
              disabled={running}
            />
            <button type="submit" className={styles.btnSearch} disabled={running || !command.trim()}>
              {running ? '...' : '실행'}
            </button>
          </div>
          {output !== null && (
            <pre
              ref={outputRef}
              className={`${styles.shellOutput} ${exitError ? styles.shellOutputError : ''}`}
            >{output || '(출력 없음)'}</pre>
          )}
        </div>
        <div className={styles.footer}>
          <button type="button" className={styles.btnCancel} onClick={onClose}>닫기</button>
        </div>
      </form>
    </Modal>
  )
}

export default ShellCommandDialog
