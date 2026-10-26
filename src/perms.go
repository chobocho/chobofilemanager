package main

// 권한 · 소유자 바꾸기 (Alt+A, Todo #137-2) — mc의 chmod(Ctrl+X C) · chown(Ctrl+X O)

import (
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
)

var errPermsUnsupported = errors.New("권한 · 소유자 바꾸기는 리눅스 · macOS에서만 됩니다")

// OwnerChoices: 소유자 · 그룹 입력 칸의 후보 (/etc/passwd · /etc/group)
type OwnerChoices struct {
	Users  []string `json:"users"`
	Groups []string `json:"groups"`
}

// unixPerm: Go 모드 → chmod 숫자 (setuid 04000 · setgid 02000 · sticky 01000 포함)
func unixPerm(m os.FileMode) uint32 {
	p := uint32(m.Perm())
	if m&os.ModeSetuid != 0 {
		p |= 04000
	}
	if m&os.ModeSetgid != 0 {
		p |= 02000
	}
	if m&os.ModeSticky != 0 {
		p |= 01000
	}
	return p
}

// goMode: chmod 숫자 → os.Chmod에 넘길 Go 모드
func goMode(p uint32) os.FileMode {
	m := os.FileMode(p & 0777)
	if p&04000 != 0 {
		m |= os.ModeSetuid
	}
	if p&02000 != 0 {
		m |= os.ModeSetgid
	}
	if p&01000 != 0 {
		m |= os.ModeSticky
	}
	return m
}

// ChangeMode: set 비트는 켜고 clear 비트는 끔 — 여러 파일에서 바꾸지 않은 비트는 파일마다 그대로.
// recursive면 폴더 안까지 (안의 심볼릭 링크는 건너뜀 — 링크 너머를 바꾸지 않게)
func (fm *FileManager) ChangeMode(paths []string, set, clear uint32, recursive bool) error {
	if !unixCopy {
		return errPermsUnsupported
	}
	if err := refuseInArchive(paths...); err != nil {
		return err
	}
	set, clear = set&07777, clear&07777
	apply := func(p string, m os.FileMode) error {
		return os.Chmod(p, goMode(unixPerm(m)&^clear|set))
	}
	var errs []error
	for _, p := range paths {
		fi, err := os.Stat(p) // 고른 항목이 링크면 가리키는 것 (chmod와 같게)
		if err != nil {
			errs = append(errs, err)
			continue
		}
		if li, err := os.Lstat(p); !recursive || !fi.IsDir() || (err == nil && li.Mode()&os.ModeSymlink != 0) {
			if err := apply(p, fi.Mode()); err != nil {
				errs = append(errs, err)
			}
			continue
		}
		errs = append(errs, chmodTree(p, apply)...)
	}
	return joinPermErrors(errs)
}

// chmodTree: 폴더는 들어가기 전에 주인 rwx를 잠시 켜고(권한을 빼도 안을 다 돌게), 다 돈 뒤 아래부터 최종 권한
func chmodTree(root string, apply func(string, os.FileMode) error) []error {
	var errs []error
	type dirMode struct {
		path string
		mode os.FileMode
	}
	var dirs []dirMode
	filepath.WalkDir(root, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			errs = append(errs, err)
			if d != nil && d.IsDir() {
				return fs.SkipDir
			}
			return nil
		}
		if d.Type()&os.ModeSymlink != 0 {
			return nil
		}
		info, err := d.Info()
		if err != nil {
			errs = append(errs, err)
			return nil
		}
		if d.IsDir() {
			dirs = append(dirs, dirMode{p, info.Mode()})
			if err := os.Chmod(p, info.Mode()|0700); err != nil {
				errs = append(errs, err)
				return fs.SkipDir
			}
			return nil
		}
		if err := apply(p, info.Mode()); err != nil {
			errs = append(errs, err)
		}
		return nil
	})
	for i := len(dirs) - 1; i >= 0; i-- {
		if err := apply(dirs[i].path, dirs[i].mode); err != nil {
			errs = append(errs, err)
		}
	}
	return errs
}

// ChangeOwner: 소유자 · 그룹을 이름이나 숫자로 (빈 값은 그대로). recursive면 안까지 — 안의 링크는 링크 자체만 (chown -R처럼)
func (fm *FileManager) ChangeOwner(paths []string, owner, group string, recursive bool) error {
	if !unixCopy {
		return errPermsUnsupported
	}
	if err := refuseInArchive(paths...); err != nil {
		return err
	}
	uid, gid, err := lookupOwner(owner, group)
	if err != nil {
		return err
	}
	if uid < 0 && gid < 0 {
		return nil
	}
	var errs []error
	for _, p := range paths {
		if err := os.Chown(p, uid, gid); err != nil {
			errs = append(errs, err)
			continue
		}
		if fi, err := os.Lstat(p); !recursive || err != nil || !fi.IsDir() {
			continue
		}
		filepath.WalkDir(p, func(q string, d fs.DirEntry, err error) error {
			if err != nil {
				errs = append(errs, err)
				return nil
			}
			if q == p {
				return nil
			}
			if err := os.Lchown(q, uid, gid); err != nil {
				errs = append(errs, err)
			}
			return nil
		})
	}
	return joinPermErrors(errs)
}

// joinPermErrors: 되는 것은 다 바꾸고 실패는 모아서 — 첫 오류와 개수
func joinPermErrors(errs []error) error {
	switch len(errs) {
	case 0:
		return nil
	case 1:
		return errs[0]
	}
	return fmt.Errorf("%d개 실패: %w", len(errs), errs[0])
}

func (fm *FileManager) GetOwnerChoices() OwnerChoices {
	return ownerChoices()
}
