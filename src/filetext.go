package main

// 뷰어·편집기: 텍스트(인코딩)·이미지 읽기와 쓰기, Starlark 실행 (Todo #132-3)

import (
	"encoding/base64"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	"go.starlark.net/starlark"
	"go.starlark.net/syntax"

	"totalcmd/internal/textenc"
)

// detectionWindow: DetectEncoding이 검사하는 파일 앞부분 크기.
// 큰 파일에서 전체 바이트를 휴리스틱에 돌릴 필요는 없음.
const detectionWindow = 64 * 1024

func (fm *FileManager) ReadTextFile(path string) (string, error) {
	return fm.ReadTextFileWithEncoding(path, "auto")
}

// ReadTextFileWithEncoding: 사용자 지정 인코딩으로 파일을 읽는다.
// encName 값:
//   - "auto" 또는 "" — DetectEncoding으로 자동 판별
//   - "utf-8", "utf-16le", "utf-16be", "cp949"(=euc-kr), "johab"(=조합형)
//   - 알 수 없는 값은 "auto"로 폴백
//
// 인코딩 자동 판별이 틀린 케이스(짧은 한글 파일, 혼합 인코딩 등)에서
// 사용자가 F3/F4 뷰어/편집기 UI로 수동 변경할 때 사용.
// 내장 뷰어/에디터로 읽을 수 있는 최대 크기 (Todo #98, #114: 32MB).
// 프론트 MAX_VIEWER_FILE_SIZE(utils/fileTypes.js)와 같은 값 — 프론트 검사를 거치지 않는 호출에도 메모리 폭주 방지
const maxViewerFileSize = 32 * 1024 * 1024

func readLimited(path string) ([]byte, error) {
	// 압축 파일 안의 파일 (Todo #133-5)
	if data, ok, err := readArchiveFile(path); ok {
		return data, err
	}
	info, err := os.Stat(path)
	if err != nil {
		return nil, err
	}
	if info.Size() > maxViewerFileSize {
		return nil, fmt.Errorf("파일이 너무 큽니다 (%d MB 초과): %s", maxViewerFileSize/1024/1024, filepath.Base(path))
	}
	return os.ReadFile(path)
}

func (fm *FileManager) ReadTextFileWithEncoding(path string, encName string) (string, error) {
	data, err := readLimited(path)
	if err != nil {
		return "", err
	}
	enc, isAuto := textenc.ParseName(encName)
	if isAuto {
		window := data
		if len(window) > detectionWindow {
			window = window[:detectionWindow]
		}
		enc = textenc.DetectEncoding(window)
	}
	// 디코더는 잘못된 바이트를 U+FFFD로 바꾸며 실패하지 않음 — 실패하면 원래 바이트 그대로 (Todo #130-1)
	if decoded, decErr := textenc.DecodeToUTF8(data, enc); decErr == nil {
		return decoded, nil
	}
	return string(data), nil
}

func (fm *FileManager) WriteTextFile(path string, content string) error {
	if err := refuseInArchive(path); err != nil {
		return err
	}
	return writeUserFile(path, []byte(content))
}

// WriteTextFileWithEncoding: 지정 인코딩으로 저장합니다 (Todo #74).
// encName이 auto/빈 값이면 기존 파일의 인코딩을 판별해 유지하고, 새/빈 파일은 UTF-8로 저장합니다.
// 인코딩할 수 없는 문자가 있으면 파일을 건드리지 않고 에러를 반환합니다.
func (fm *FileManager) WriteTextFileWithEncoding(path string, content string, encName string) error {
	if err := refuseInArchive(path); err != nil {
		return err
	}
	enc, isAuto := textenc.ParseName(encName)
	if isAuto {
		enc = textenc.EncUTF8
		if f, err := os.Open(path); err == nil {
			buf := make([]byte, detectionWindow)
			n, _ := io.ReadFull(f, buf)
			f.Close()
			if n > 0 {
				enc = textenc.DetectEncoding(buf[:n])
			}
		}
	}
	data, err := textenc.EncodeFromUTF8(content, enc)
	if err != nil {
		return err
	}
	return writeUserFile(path, data)
}

// imageMimeType: 파일 확장자를 보고 표준 MIME 타입을 결정.
// 미지원 확장자는 application/octet-stream (브라우저가 처리 불가능하지만
// 호출자에게 "지원 안 됨"을 명확히 알리는 표식).
func imageMimeType(ext string) string {
	switch strings.ToLower(ext) {
	case ".png":
		return "image/png"
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".gif":
		return "image/gif"
	case ".webp":
		return "image/webp"
	case ".bmp":
		return "image/bmp"
	case ".svg":
		return "image/svg+xml"
	case ".ico":
		return "image/x-icon"
	}
	return "application/octet-stream"
}

// CreateStarlarkScratchFile: Ctrl+Enter로 호출되는 Starlark 스크래치 버퍼를 위한
// 임시 .star 파일을 생성하고 절대 경로를 반환한다.
//
// 사용 흐름: 파일패널 등에서 Ctrl+Enter → 본 API로 임시 파일 생성 → F4 에디터로
// 열어서 Starlark 스니펫 작성 → F5/Ctrl+Enter로 실행.
//
// 위치는 OS 임시 디렉터리(os.TempDir())이며, 패턴은 chobofm-scratch-*.star.
// OS가 주기적으로 정리하므로 별도 cleanup 코드 불필요.
func (fm *FileManager) CreateStarlarkScratchFile() (string, error) {
	f, err := os.CreateTemp("", "chobofm-scratch-*.star")
	if err != nil {
		return "", err
	}
	defer f.Close()
	template := fmt.Sprintf("# Starlark 스크래치 (%s)\n# F5 또는 Ctrl+Enter로 실행\n\nprint(\"Hello, Starlark!\")\n",
		time.Now().Format("2006-01-02 15:04:05"))
	if _, err := f.WriteString(template); err != nil {
		return "", err
	}
	return f.Name(), nil
}

// ReadImageFile: 이미지 파일을 base64 데이터 URL로 읽는다 (Todo #52).
// 프론트엔드는 <img src={dataUrl}>로 그대로 사용. Wails에서 file:// URL을
// 직접 띄우는 것보다 이식성·보안 측면에서 단순.
func (fm *FileManager) ReadImageFile(path string) (string, error) {
	data, err := readLimited(path)
	if err != nil {
		return "", err
	}
	mime := imageMimeType(filepath.Ext(path))
	return "data:" + mime + ";base64," + base64.StdEncoding.EncodeToString(data), nil
}

func (fm *FileManager) RunStarlarkFile(path string) (string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}

	var buf strings.Builder
	thread := &starlark.Thread{
		Name: filepath.Base(path),
		Print: func(_ *starlark.Thread, msg string) {
			buf.WriteString(msg)
			buf.WriteByte('\n')
		},
	}

	// While/Recursion 활성화 — 트리 워킹 인터프리터(Todo #62) 등 반복 루프가 필요한
	// 사용자 스크립트를 위해. 기본 비활성 옵션은 단순 표현 평가에는 충분하지만
	// 조건부 반복문 작성을 막아 1980년대 BASIC을 포팅하기 어렵게 만듦.
	opts := &syntax.FileOptions{While: true, Recursion: true}
	_, execErr := starlark.ExecFileOptions(opts, thread, path, data, nil)
	output := buf.String()
	if execErr != nil {
		if output != "" {
			return output + "\n" + execErr.Error(), nil
		}
		return execErr.Error(), nil
	}
	return output, nil
}
