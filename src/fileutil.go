package main

import (
	"fmt"
	"os"
	"path/filepath"
	"time"
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
