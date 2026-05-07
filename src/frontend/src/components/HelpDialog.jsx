import React, { useEffect } from 'react'
import { X, HelpCircle } from 'lucide-react'
import styles from '../styles/HelpDialog.module.css'

const SECTIONS = [
  {
    title: '파일 조작',
    rows: [
      { keys: ['F2'],              desc: '이름 바꾸기' },
      { keys: ['F3'],              desc: '파일 보기 (내장 뷰어)' },
      { keys: ['F4'],              desc: '내장 에디터로 파일 편집' },
      { keys: ['F5'],              desc: '복사 (반대 패널로)' },
      { keys: ['F6'],              desc: '이동 (반대 패널로)' },
      { keys: ['F7'],              desc: '새 폴더 만들기' },
      { keys: ['F8', 'Delete'],    desc: '선택 항목을 휴지통으로 이동' },
      { keys: ['Shift+Delete'],    desc: '선택 항목을 영구 삭제' },
      { keys: ['Ctrl+N'],          desc: '새 파일 만들기' },
      { keys: ['Ctrl+Shift+C'],    desc: '파일 경로를 클립보드에 복사' },
      { keys: ['Enter'],           desc: '폴더 열기 / 파일 실행' },
    ],
  },
  {
    title: '탐색 및 선택',
    rows: [
      { keys: ['Tab'],             desc: '좌우 패널 전환' },
      { keys: ['↑ / ↓'],          desc: '커서 이동' },
      { keys: ['Space'],           desc: '항목 선택/해제' },
      { keys: ['Insert'],          desc: '항목 선택/해제 후 커서 아래로 이동' },
      { keys: ['Ctrl+A'],          desc: '전체 선택' },
      { keys: ['Backspace'],       desc: '상위 폴더로 이동' },
      { keys: ['[..]'],            desc: '상위 폴더로 이동 (항목 클릭)' },
    ],
  },
  {
    title: '탭',
    rows: [
      { keys: ['Ctrl+T'],          desc: '새 탭 열기' },
      { keys: ['Ctrl+W'],          desc: '현재 탭 닫기' },
      { keys: ['Ctrl+Tab'],        desc: '다음 탭으로 전환' },
      { keys: ['Ctrl+Shift+Tab'],  desc: '이전 탭으로 전환' },
    ],
  },
  {
    title: '압축',
    rows: [
      { keys: ['압축하기'],        desc: '선택한 파일을 ZIP으로 압축' },
      { keys: ['압축 풀기'],       desc: 'ZIP 파일을 동일 폴더 내 서브폴더에 해제' },
    ],
  },
  {
    title: '기타',
    rows: [
      { keys: ['F1'],              desc: '이 도움말 표시' },
      { keys: ['Ctrl+R'],          desc: '현재 패널 새로고침' },
      { keys: ['Ctrl+H'],          desc: '숨김 파일(.으로 시작) 표시 / 숨김 토글' },
      { keys: ['Ctrl+D'],          desc: '바로가기 목록 (추가 / 이동 / 삭제)' },
      { keys: ['Ctrl+F'],          desc: '파일 검색' },
      { keys: ['테마 버튼'],       desc: '라이트 / 다크 테마 전환' },
    ],
  },
]

export default function HelpDialog({ onClose }) {
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape' || e.key === 'F1') { e.preventDefault(); onClose() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <HelpCircle size={14} className={styles.headerIcon} />
          <span>도움말 — Chobocho Commander</span>
          <button className={styles.closeBtn} onClick={onClose} title="닫기">
            <X size={13} />
          </button>
        </div>

        <div className={styles.body}>
          {SECTIONS.map(sec => (
            <section key={sec.title} className={styles.section}>
              <h3 className={styles.sectionTitle}>{sec.title}</h3>
              <table className={styles.table}>
                <tbody>
                  {sec.rows.map(({ keys, desc }) => (
                    <tr key={keys.join()} className={styles.row}>
                      <td className={styles.keys}>
                        {keys.map(k => <kbd key={k} className={styles.kbd}>{k}</kbd>)}
                      </td>
                      <td className={styles.desc}>{desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        </div>

        <div className={styles.footer}>
          <span className={styles.tip}>ESC 또는 F1을 누르면 닫힙니다</span>
          <button className={styles.btnClose} onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  )
}
