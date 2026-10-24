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
