package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"golang.org/x/text/encoding/korean"
)

// writeFileAtomic: 같은 폴더의 임시 파일에 쓴 뒤 rename으로 교체합니다.
// 저장 도중 크래시/디스크 부족이 나도 기존 파일이 반쯤 잘린 상태로 남지 않습니다 (Todo #86, #87).
func writeFileAtomic(path string, data []byte, perm os.FileMode) error {
	tmp, err := os.CreateTemp(filepath.Dir(path), filepath.Base(path)+".*.tmp")
	if err != nil {
		return err
	}
	tmpName := tmp.Name()
	if _, err := tmp.Write(data); err != nil {
		tmp.Close()
		os.Remove(tmpName)
		return err
	}
	if err := tmp.Sync(); err != nil {
		tmp.Close()
		os.Remove(tmpName)
		return err
	}
	if err := tmp.Close(); err != nil {
		os.Remove(tmpName)
		return err
	}
	if err := os.Chmod(tmpName, perm); err != nil {
		os.Remove(tmpName)
		return err
	}
	if err := os.Rename(tmpName, path); err != nil {
		os.Remove(tmpName)
		return err
	}
	return nil
}

// backupCorrupt: 파싱할 수 없는 설정 파일을 <name>.corrupt-<시각>으로 보관합니다.
// 다음 저장이 손상된 원본을 덮어써 복구 기회를 잃지 않도록 합니다.
func backupCorrupt(path string) {
	backup := fmt.Sprintf("%s.corrupt-%s", path, time.Now().Format("20060102-150405.000000000"))
	os.Rename(path, backup)
}

// writeUserFile: 사용자 파일 저장 (에디터). 기존 권한을 유지하며 원자적으로 교체합니다.
// 다른 프로그램이 파일을 열고 있어 교체(rename)가 거부되면 기존 방식(제자리 덮어쓰기)으로 저장합니다.
func writeUserFile(path string, data []byte) error {
	perm := os.FileMode(0644)
	if info, err := os.Stat(path); err == nil {
		perm = info.Mode().Perm()
	}
	if err := writeFileAtomic(path, data, perm); err == nil {
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
