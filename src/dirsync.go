package main

// 폴더 비교 · 동기화 (Alt+F2, Todo #133-6) — Total Commander "Synchronize dirs"

import (
	"bytes"
	"fmt"
	"io"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

type CompareOptions struct {
	Recursive  bool `json:"recursive"`
	ByContent  bool `json:"byContent"`  // 크기가 같으면 내용까지 비교
	IgnoreDate bool `json:"ignoreDate"` // 날짜는 보지 않음 (크기·내용만)
}

type SideInfo struct {
	Size     int64     `json:"size"`
	Modified time.Time `json:"modified"`
	IsDir    bool      `json:"isDir"`
}

// SyncItem.State: equal · left-newer · right-newer · different · left-only · right-only
type SyncItem struct {
	Rel   string    `json:"rel"` // '/'로 나눈 상대 경로
	IsDir bool      `json:"isDir"`
	Left  *SideInfo `json:"left"`
	Right *SideInfo `json:"right"`
	State string    `json:"state"`
}

type SyncAction struct {
	Rel string `json:"rel"`
	To  string `json:"to"` // "right": 왼쪽 → 오른쪽, "left": 오른쪽 → 왼쪽
}

const (
	maxCompareItems = 200000
	timeSlack       = 2 * time.Second // FAT·네트워크 드라이브의 2초 단위 시각
)

// CompareDirs: 두 폴더를 이름으로 맞춰 비교. 한쪽에만 있는 폴더는 하위까지 한 항목으로,
// 양쪽에 있는 폴더는 Recursive일 때만 안으로 들어감.
func (fm *FileManager) CompareDirs(left, right string, opts CompareOptions) ([]SyncItem, error) {
	for _, d := range []string{left, right} {
		fi, err := os.Stat(d)
		if err != nil {
			return nil, err
		}
		if !fi.IsDir() {
			return nil, fmt.Errorf("폴더가 아닙니다: %s", d)
		}
	}
	var items []SyncItem
	var walk func(rel string) error
	walk = func(rel string) error {
		ls, err := readSide(filepath.Join(left, filepath.FromSlash(rel)))
		if err != nil {
			return err
		}
		rs, err := readSide(filepath.Join(right, filepath.FromSlash(rel)))
		if err != nil {
			return err
		}
		names := map[string]bool{}
		for n := range ls {
			names[n] = true
		}
		for n := range rs {
			names[n] = true
		}
		sorted := make([]string, 0, len(names))
		for n := range names {
			sorted = append(sorted, n)
		}
		sort.Slice(sorted, func(i, j int) bool { return strings.ToLower(sorted[i]) < strings.ToLower(sorted[j]) })
		for _, n := range sorted {
			if len(items) >= maxCompareItems {
				return fmt.Errorf("항목이 너무 많습니다 (%d개 넘음)", maxCompareItems)
			}
			l, r := ls[n], rs[n]
			childRel := path.Join(rel, n)
			if l != nil && r != nil && l.IsDir && r.IsDir {
				if opts.Recursive {
					if err := walk(childRel); err != nil {
						return err
					}
				}
				continue
			}
			it := SyncItem{Rel: childRel, Left: l, Right: r}
			switch {
			case r == nil:
				it.State, it.IsDir = "left-only", l.IsDir
			case l == nil:
				it.State, it.IsDir = "right-only", r.IsDir
			case l.IsDir != r.IsDir:
				it.State = "different"
			default:
				it.State = compareFiles(filepath.Join(left, filepath.FromSlash(childRel)), filepath.Join(right, filepath.FromSlash(childRel)), l, r, opts)
			}
			items = append(items, it)
		}
		return nil
	}
	if err := walk(""); err != nil {
		return nil, err
	}
	return items, nil
}

func readSide(dir string) (map[string]*SideInfo, error) {
	out := map[string]*SideInfo{}
	es, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}
	for _, e := range es {
		info, err := e.Info()
		if err != nil {
			continue
		}
		isDir := e.IsDir()
		if e.Type()&(os.ModeSymlink|os.ModeIrregular) != 0 {
			if ti, err := os.Stat(filepath.Join(dir, e.Name())); err == nil {
				isDir = ti.IsDir()
			}
		}
		si := &SideInfo{Modified: info.ModTime(), IsDir: isDir}
		if !isDir {
			si.Size = info.Size()
		}
		out[e.Name()] = si
	}
	return out, nil
}

func compareFiles(lp, rp string, l, r *SideInfo, opts CompareOptions) string {
	sameSize := l.Size == r.Size
	if opts.ByContent && sameSize {
		if same, err := sameContent(lp, rp); err == nil && same {
			return "equal"
		}
	} else if sameSize && (opts.IgnoreDate || absDur(l.Modified.Sub(r.Modified)) <= timeSlack) {
		return "equal"
	}
	if opts.IgnoreDate {
		return "different"
	}
	d := l.Modified.Sub(r.Modified)
	switch {
	case d > timeSlack:
		return "left-newer"
	case d < -timeSlack:
		return "right-newer"
	}
	return "different"
}

func absDur(d time.Duration) time.Duration {
	if d < 0 {
		return -d
	}
	return d
}

func sameContent(a, b string) (bool, error) {
	fa, err := os.Open(a)
	if err != nil {
		return false, err
	}
	defer fa.Close()
	fb, err := os.Open(b)
	if err != nil {
		return false, err
	}
	defer fb.Close()
	ba, bb := make([]byte, 64*1024), make([]byte, 64*1024)
	for {
		na, ea := io.ReadFull(fa, ba)
		nb, eb := io.ReadFull(fb, bb)
		if na != nb || !bytes.Equal(ba[:na], bb[:nb]) {
			return false, nil
		}
		if ea == io.EOF || ea == io.ErrUnexpectedEOF {
			return eb == io.EOF || eb == io.ErrUnexpectedEOF, nil
		}
		if ea != nil {
			return false, ea
		}
	}
}

// SyncDirs: 고른 항목을 정해진 방향으로 복사 (덮어씀, 수정 시각 유지). 폴더는 하위까지.
func (fm *FileManager) SyncDirs(left, right string, actions []SyncAction) error {
	for _, a := range actions {
		rel := path.Clean("/" + strings.ReplaceAll(a.Rel, `\`, "/"))
		if a.Rel == "" || rel == "/" || strings.Contains(a.Rel, "..") {
			return fmt.Errorf("잘못된 경로: %q", a.Rel)
		}
		var src, dst string
		switch a.To {
		case "right":
			src, dst = filepath.Join(left, filepath.FromSlash(rel)), filepath.Join(right, filepath.FromSlash(rel))
		case "left":
			src, dst = filepath.Join(right, filepath.FromSlash(rel)), filepath.Join(left, filepath.FromSlash(rel))
		default:
			return fmt.Errorf("잘못된 방향: %q", a.To)
		}
		info, err := os.Stat(src)
		if err != nil {
			return err
		}
		if err := os.MkdirAll(filepath.Dir(dst), 0755); err != nil {
			return err
		}
		if info.IsDir() {
			err = copyDir(src, dst)
		} else {
			err = copyFile(src, dst)
		}
		if err != nil {
			return fmt.Errorf("%s: %w", a.Rel, err)
		}
	}
	return nil
}
