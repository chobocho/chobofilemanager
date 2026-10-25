package main

import (
	"errors"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

// xdgTrash: freedesktop.org Trash 규격 1.0 — 리눅스 휴지통 (Todo #137-1).
// 같은 장치면 홈 휴지통($XDG_DATA_HOME/Trash), 다른 장치(USB 등)면 그 마운트 위치의
// .Trash/$uid(sticky일 때만) 또는 .Trash-$uid. 장치를 건너 복사하지 않음 (gio와 같게).
// OS에 묶인 부분(장치 번호 · sticky)은 함수로 받아 Windows에서도 테스트함.
type xdgTrash struct {
	home   string // 홈 휴지통 폴더
	uid    int
	now    func() time.Time
	device func(p string) (uint64, error) // st_dev (링크는 따라가지 않음)
	sticky func(fi os.FileInfo) bool
	rename func(from, to string) error // nil이면 os.Rename (테스트에서 실패 흉내)
}

func (t xdgTrash) trash(p string) error {
	abs, err := filepath.Abs(p)
	if err != nil {
		return err
	}
	if _, err := os.Lstat(abs); err != nil {
		return err
	}
	dir, infoPath, err := t.trashDirFor(abs)
	if err != nil {
		return err
	}
	if abs == dir || isSubPath(dir, abs) || isSubPath(abs, dir) {
		return fmt.Errorf("휴지통 폴더는 휴지통으로 보낼 수 없습니다: %s", abs)
	}
	files, infos := filepath.Join(dir, "files"), filepath.Join(dir, "info")
	for _, d := range []string{files, infos} {
		if err := os.MkdirAll(d, 0700); err != nil {
			return err
		}
	}
	name, info, err := t.reserve(files, infos, filepath.Base(abs), infoPath)
	if err != nil {
		return err
	}
	rename := t.rename
	if rename == nil {
		rename = os.Rename
	}
	if err := rename(abs, filepath.Join(files, name)); err != nil {
		os.Remove(info)
		return err
	}
	return nil
}

// reserve: 겹치지 않는 이름("a.txt", "a.2.txt"...)의 .trashinfo를 O_EXCL로 먼저 만들어 자리를 잡음
func (t xdgTrash) reserve(files, infos, base, infoPath string) (name, info string, err error) {
	ext := filepath.Ext(base)
	stem := strings.TrimSuffix(base, ext)
	if stem == "" { // ".bashrc" 같은 이름
		stem, ext = base, ""
	}
	body := fmt.Sprintf("[Trash Info]\nPath=%s\nDeletionDate=%s\n", infoPath, t.now().Format("2006-01-02T15:04:05"))
	for n := 1; n < 10000; n++ {
		name = base
		if n > 1 {
			name = stem + "." + strconv.Itoa(n) + ext
		}
		if _, err := os.Lstat(filepath.Join(files, name)); err == nil {
			continue // info 없이 남은 찌꺼기
		}
		info = filepath.Join(infos, name+".trashinfo")
		f, err := os.OpenFile(info, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
		if errors.Is(err, os.ErrExist) {
			continue
		}
		if err != nil {
			return "", "", err
		}
		_, werr := f.WriteString(body)
		if cerr := f.Close(); werr == nil {
			werr = cerr
		}
		if werr != nil {
			os.Remove(info)
			return "", "", werr
		}
		return name, info, nil
	}
	return "", "", fmt.Errorf("휴지통에 넣을 이름을 찾지 못했습니다: %s", base)
}

// trashDirFor: abs가 갈 휴지통 폴더와 .trashinfo의 Path 값
func (t xdgTrash) trashDirFor(abs string) (dir, infoPath string, err error) {
	dev, err := t.device(abs)
	if err != nil {
		return "", "", err
	}
	if err := os.MkdirAll(t.home, 0700); err != nil {
		return "", "", err
	}
	if homeDev, err := t.device(t.home); err == nil && homeDev == dev {
		return t.home, trashURLPath(abs), nil
	}
	top := t.mountTop(abs, dev)
	rel, err := filepath.Rel(top, abs)
	if err != nil {
		return "", "", err
	}
	uid := strconv.Itoa(t.uid)
	// $topdir/.Trash: 링크가 아니고 sticky인 폴더일 때만 그 안의 $uid (규격의 보안 조건)
	if fi, err := os.Lstat(filepath.Join(top, ".Trash")); err == nil && fi.IsDir() && fi.Mode()&os.ModeSymlink == 0 && t.sticky(fi) {
		d := filepath.Join(top, ".Trash", uid)
		if t.usableDir(d, dev) {
			return d, trashURLPath(rel), nil
		}
	}
	d := filepath.Join(top, ".Trash-"+uid)
	if t.usableDir(d, dev) {
		return d, trashURLPath(rel), nil
	}
	return "", "", fmt.Errorf("이 드라이브(%s)에는 휴지통을 만들 수 없습니다", top)
}

// usableDir: 없으면 0700으로 만들고, 링크가 아닌 같은 장치의 폴더인지
func (t xdgTrash) usableDir(d string, dev uint64) bool {
	if err := os.Mkdir(d, 0700); err != nil && !errors.Is(err, os.ErrExist) {
		return false
	}
	fi, err := os.Lstat(d)
	if err != nil || !fi.IsDir() || fi.Mode()&os.ModeSymlink != 0 {
		return false
	}
	got, err := t.device(d)
	return err == nil && got == dev
}

// mountTop: 같은 장치인 가장 위 조상 폴더 (마운트 위치)
func (t xdgTrash) mountTop(abs string, dev uint64) string {
	top := filepath.Dir(abs)
	for {
		parent := filepath.Dir(top)
		if parent == top {
			return top
		}
		if d, err := t.device(parent); err != nil || d != dev {
			return top
		}
		top = parent
	}
}

// trashURLPath: .trashinfo의 Path — 조각마다 URL 이스케이프, "/"는 그대로
func trashURLPath(p string) string {
	segs := strings.Split(filepath.ToSlash(p), "/")
	for i, s := range segs {
		segs[i] = url.PathEscape(s)
	}
	return strings.Join(segs, "/")
}
