//go:build !linux

package main

import (
	"errors"
	"os"
)

// 리눅스 밖에서는 특수 파일(FIFO · 장치 · 소켓)을 만들지 않고 건너뜀 (Todo #137-3)
func canMakeSpecial(fi os.FileInfo) bool { return false }

func makeSpecial(dst string, fi os.FileInfo) error {
	return errors.New("special files are not supported here")
}
