package main

// 여러 이름 바꾸기 (Ctrl+M, Todo #133-4)

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

type RenamePair struct {
	Old string `json:"old"`
	New string `json:"new"`
}

// RenameBatch: 같은 폴더 안에서 여러 항목의 이름을 한 번에 바꿉니다.
// 먼저 모두 임시 이름으로 옮긴 뒤 새 이름으로 — 묶음 안끼리 이름을 맞바꾸거나(a↔b) 이어 바꿀(1→2, 2→3) 수 있음.
// 묶음 밖의 이미 있는 이름과 겹치면 아무것도 바꾸지 않고, 중간에 실패하면 바꾼 것을 되돌립니다.
func (fm *FileManager) RenameBatch(pairs []RenamePair) error {
	if len(pairs) == 0 {
		return nil
	}
	for _, p := range pairs {
		if err := refuseInArchive(p.Old, p.New); err != nil {
			return err
		}
	}
	key := nameKey
	olds := map[string]bool{}
	news := map[string]bool{}
	for _, p := range pairs {
		name := filepath.Base(p.New)
		if name == "." || name == ".." || strings.ContainsAny(name, `/\`) || filepath.Dir(filepath.Clean(p.New)) != filepath.Dir(filepath.Clean(p.Old)) {
			return fmt.Errorf("같은 폴더 안의 이름만 바꿀 수 있습니다: %s", p.New)
		}
		olds[key(p.Old)] = true
		if news[key(p.New)] {
			return fmt.Errorf("같은 새 이름이 여럿입니다: %s", name)
		}
		news[key(p.New)] = true
	}
	for _, p := range pairs {
		if _, err := os.Lstat(p.Old); err != nil {
			return err
		}
		if olds[key(p.New)] {
			continue // 묶음 안에서 비워질 이름 (자기 자신의 대소문자만 바꾸는 경우 포함)
		}
		if _, err := os.Lstat(p.New); err == nil {
			return fmt.Errorf("이미 있는 이름입니다: %s", filepath.Base(p.New))
		}
	}

	type step struct{ from, to string }
	var done []step
	// 되돌리기: 되돌리지 못한 항목(임시 이름으로 남은 것)을 오류에 함께 알림 (Todo #134-1)
	fail := func(err error) error {
		var left []string
		for i := len(done) - 1; i >= 0; i-- {
			if rerr := os.Rename(done[i].to, done[i].from); rerr != nil {
				left = append(left, done[i].to)
			}
		}
		return rollbackError(err, left)
	}
	temps := make([]string, len(pairs))
	for i, p := range pairs {
		tmp, err := uniqueName(filepath.Dir(p.Old), fmt.Sprintf(".~rename%d.%s", i, filepath.Base(p.Old)))
		if err == nil {
			err = os.Rename(p.Old, tmp)
		}
		if err != nil {
			return fail(err)
		}
		temps[i] = tmp
		done = append(done, step{p.Old, tmp})
	}
	for i, p := range pairs {
		// 묶음 밖의 항목이 그 사이 생겼거나 대소문자만 다른 이웃이면 덮어쓰지 않음 (os.Rename은 말없이 덮어씀)
		if _, err := os.Lstat(p.New); err == nil {
			return fail(fmt.Errorf("이미 있는 이름입니다: %s", filepath.Base(p.New)))
		}
		if err := os.Rename(temps[i], p.New); err != nil {
			return fail(err)
		}
		done = append(done, step{temps[i], p.New})
	}
	return nil
}

// nameKey: 이름 비교 — Windows · macOS는 대소문자를 구분하지 않고, 그 밖(Linux)은 구분 (Todo #134-1)
func nameKey(p string) string {
	p = filepath.Clean(p)
	if runtime.GOOS == "windows" || runtime.GOOS == "darwin" {
		return strings.ToLower(p)
	}
	return p
}

func rollbackError(err error, leftovers []string) error {
	if len(leftovers) == 0 {
		return err
	}
	return fmt.Errorf("%w — 되돌리지 못해 임시 이름으로 남은 항목: %s", err, strings.Join(leftovers, ", "))
}
