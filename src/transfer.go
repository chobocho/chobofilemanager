package main

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

// 덮어쓰기 중 임시로 보관하는 기존 대상의 이름 표식
const backupMarker = ".chobo-bak-"

// samePath: 두 경로가 같은 파일/폴더를 가리키는지 확인합니다.
// 둘 다 존재하면 os.SameFile로, 아니면 정규화한 경로 문자열로 비교합니다 (Windows는 대소문자 무시).
func samePath(a, b string) bool {
	if ia, err := os.Stat(a); err == nil {
		if ib, err := os.Stat(b); err == nil {
			return os.SameFile(ia, ib)
		}
	}
	return pathKey(a) == pathKey(b)
}

func pathKey(p string) string {
	if abs, err := filepath.Abs(p); err == nil {
		p = abs
	}
	p = filepath.Clean(p)
	if runtime.GOOS == "windows" {
		p = strings.ToLower(p)
	}
	return p
}

// replaceWith: 기존 dest를 백업 이름으로 옮긴 뒤 op를 실행합니다.
// op 성공 시 백업을 삭제하고, 실패 시 부분 결과를 지우고 백업을 원래 이름으로 되돌립니다.
func replaceWith(dest string, op func() error) error {
	if _, err := os.Lstat(dest); err != nil {
		if os.IsNotExist(err) {
			return op()
		}
		return err
	}
	backup := filepath.Join(filepath.Dir(dest),
		fmt.Sprintf("%s%s%d", filepath.Base(dest), backupMarker, time.Now().UnixNano()))
	if err := os.Rename(dest, backup); err != nil {
		return err
	}
	if err := op(); err != nil {
		os.RemoveAll(dest)
		if rerr := os.Rename(backup, dest); rerr != nil {
			return fmt.Errorf("%w (기존 항목 복원 실패, 백업: %s)", err, backup)
		}
		return err
	}
	return os.RemoveAll(backup)
}
