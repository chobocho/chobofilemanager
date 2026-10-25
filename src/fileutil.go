package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"unicode/utf8"

	"golang.org/x/text/encoding/korean"

	"totalcmd/internal/atomicfile"
)

// writeUserFile: 사용자 파일 저장 (에디터). 기존 권한을 유지하며 원자적으로 교체합니다.
// 다른 프로그램이 파일을 열고 있어 교체(rename)가 거부되면 기존 방식(제자리 덮어쓰기)으로 저장합니다.
func writeUserFile(path string, data []byte) error {
	perm := os.FileMode(0644)
	if info, err := os.Stat(path); err == nil {
		perm = info.Mode().Perm()
	}
	// 원자적 교체(atomicfile, Todo #86·#87 — 저장 중 중단돼도 반쪽 파일이 남지 않음)
	if err := atomicfile.Write(path, data, perm); err == nil {
		return nil
	}
	return os.WriteFile(path, data, perm)
}

// uniqueName: dir 안에서 name과 겹치지 않는 경로를 찾습니다 ("a (1).txt", ".bashrc (1)").
// 존재 여부를 확인할 수 없는 에러(경로 길이 초과 등)는 즉시 반환해 무한 루프를 막습니다 (Todo #99).
func uniqueName(dir, name string) (string, error) {
	candidate := filepath.Join(dir, name)
	if _, err := os.Lstat(candidate); os.IsNotExist(err) {
		return candidate, nil
	} else if err != nil {
		return "", err
	}
	ext := filepath.Ext(name)
	base := strings.TrimSuffix(name, ext)
	if base == "" { // ".bashrc" 같은 점 파일은 전체를 이름으로 취급
		base, ext = name, ""
	}
	for n := 1; n <= 10000; n++ {
		candidate = filepath.Join(dir, fmt.Sprintf("%s (%d)%s", base, n, ext))
		_, err := os.Lstat(candidate)
		if os.IsNotExist(err) {
			return candidate, nil
		}
		if err != nil {
			return "", err
		}
	}
	return "", fmt.Errorf("사용 가능한 이름을 찾지 못했습니다: %s", name)
}

// guardDeletable: 빈 경로, 드라이브/파일시스템 루트, 홈 폴더 삭제를 거부합니다 (Todo #99 — 프론트 버그 방어선).
func guardDeletable(p string) error {
	if strings.TrimSpace(p) == "" {
		return fmt.Errorf("빈 경로는 삭제할 수 없습니다")
	}
	abs, err := filepath.Abs(p)
	if err != nil {
		return err
	}
	clean := filepath.Clean(abs)
	if clean == filepath.Dir(clean) {
		return fmt.Errorf("루트 폴더는 삭제할 수 없습니다: %s", clean)
	}
	if home, err := os.UserHomeDir(); err == nil && samePath(clean, home) {
		return fmt.Errorf("홈 폴더는 삭제할 수 없습니다: %s", clean)
	}
	return nil
}

// decodeShellOutput: UTF-8이면 그대로, 아니면 CP949로 디코딩 (Windows 콘솔 코드페이지 949/65001 모두 대응)
func decodeShellOutput(out []byte) string {
	if utf8.Valid(out) {
		return string(out)
	}
	if decoded, err := korean.EUCKR.NewDecoder().Bytes(out); err == nil {
		return string(decoded)
	}
	return string(out)
}

// unescapeMountField: /proc/mounts의 8진수 이스케이프(\040 공백, \011 탭, \134 역슬래시 등)를 복원
func unescapeMountField(s string) string {
	if !strings.Contains(s, "\\") {
		return s
	}
	var b strings.Builder
	for i := 0; i < len(s); i++ {
		if s[i] == '\\' && i+3 < len(s) {
			if v, err := strconv.ParseUint(s[i+1:i+4], 8, 8); err == nil {
				b.WriteByte(byte(v))
				i += 3
				continue
			}
		}
		b.WriteByte(s[i])
	}
	return b.String()
}
