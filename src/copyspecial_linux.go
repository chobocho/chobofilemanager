//go:build linux

package main

import (
	"os"
	"syscall"
)

// canMakeSpecial: 이 특수 파일을 대상에 다시 만들 수 있는지 (Todo #137-3) —
// FIFO는 누구나, 장치 파일은 root만(mknod), 소켓은 만들 수 없음(mc도 건너뜀)
func canMakeSpecial(fi os.FileInfo) bool {
	m := fi.Mode()
	switch {
	case m&os.ModeNamedPipe != 0:
		return true
	case m&os.ModeDevice != 0:
		_, ok := fi.Sys().(*syscall.Stat_t)
		return ok && os.Geteuid() == 0
	}
	return false
}

// makeSpecial: 내용을 읽지 않고 같은 종류의 특수 파일을 만듦 (권한은 호출한 쪽이 맞춤)
func makeSpecial(dst string, fi os.FileInfo) error {
	m := fi.Mode()
	if m&os.ModeNamedPipe != 0 {
		return syscall.Mkfifo(dst, uint32(m.Perm()))
	}
	st := fi.Sys().(*syscall.Stat_t)
	kind := uint32(syscall.S_IFBLK)
	if m&os.ModeCharDevice != 0 {
		kind = syscall.S_IFCHR
	}
	return syscall.Mknod(dst, kind|uint32(m.Perm()), int(st.Rdev))
}
