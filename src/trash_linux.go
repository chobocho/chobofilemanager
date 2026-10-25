//go:build linux

package main

import (
	"os"
	"path/filepath"
	"syscall"
	"time"
)

// 리눅스 휴지통: freedesktop.org Trash 규격 (Todo #137-1) — 파일 관리자(Nautilus · Dolphin)와 같은 휴지통
func trashItems(paths []string) error {
	t := linuxTrash()
	for _, p := range paths {
		if err := t.trash(p); err != nil {
			return err
		}
	}
	return nil
}

func linuxTrash() xdgTrash {
	data := os.Getenv("XDG_DATA_HOME")
	if !filepath.IsAbs(data) {
		home, _ := os.UserHomeDir()
		data = filepath.Join(home, ".local", "share")
	}
	return xdgTrash{
		home: filepath.Join(data, "Trash"),
		uid:  os.Getuid(),
		now:  time.Now,
		device: func(p string) (uint64, error) {
			var st syscall.Stat_t
			if err := syscall.Lstat(p, &st); err != nil {
				return 0, err
			}
			return uint64(st.Dev), nil
		},
		sticky: func(fi os.FileInfo) bool { return fi.Mode()&os.ModeSticky != 0 },
	}
}
