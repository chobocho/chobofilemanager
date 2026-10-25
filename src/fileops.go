package main

// 파일 작업: 복사·이동·삭제·이름 바꾸기와 그 공용 도우미 (Todo #132-3, filemanager.go에서 분리)

import (
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

type CopyConflict struct {
	Name       string `json:"name"`
	SourcePath string `json:"sourcePath"`
	DestPath   string `json:"destPath"`
}

func (fm *FileManager) CheckCopyConflicts(sources []string, destination string) []CopyConflict {
	var conflicts []CopyConflict
	for _, src := range sources {
		name := filepath.Base(src)
		destPath := filepath.Join(destination, name)
		if _, err := os.Stat(destPath); err == nil {
			conflicts = append(conflicts, CopyConflict{
				Name:       name,
				SourcePath: src,
				DestPath:   destPath,
			})
		}
	}
	return conflicts
}

func (fm *FileManager) CopyItems(sources []string, destination string) error {
	sources, err := fm.extractArchiveSources(sources, destination, "overwrite")
	if err != nil {
		return err
	}
	for _, src := range sources {
		if _, err := os.Lstat(src); err != nil {
			return err
		}
		destPath := filepath.Join(destination, filepath.Base(src))
		if err := copyItem(src, destPath); err != nil {
			return err
		}
	}
	return nil
}

func (fm *FileManager) CopyItemsRename(sources []string, destination string) error {
	sources, err := fm.extractArchiveSources(sources, destination, "rename")
	if err != nil {
		return err
	}
	for _, src := range sources {
		if _, err := os.Lstat(src); err != nil {
			return err
		}
		name := filepath.Base(src)
		destPath := filepath.Join(destination, name)
		if _, err := os.Stat(destPath); err == nil {
			if destPath, err = uniqueName(destination, name); err != nil {
				return err
			}
		}
		if err := copyItem(src, destPath); err != nil {
			return err
		}
	}
	return nil
}

func (fm *FileManager) CopyItemsSkipConflicts(sources []string, destination string) error {
	sources, err := fm.extractArchiveSources(sources, destination, "skip")
	if err != nil {
		return err
	}
	for _, src := range sources {
		if _, err := os.Lstat(src); err != nil {
			return err
		}
		destPath := filepath.Join(destination, filepath.Base(src))
		if _, err := os.Lstat(destPath); err == nil {
			continue // 이미 존재하면 건너뜀 (끊어진 링크도 있는 것)
		}
		if err := copyItem(src, destPath); err != nil {
			return err
		}
	}
	return nil
}

func (fm *FileManager) moveOne(src, destPath string) error {
	if isSubPath(src, destPath) {
		return errIntoSelf(src)
	}
	// 충돌 검사 뒤에 생긴 같은 이름 항목도 덮어쓰지 않음 (Todo #130-1, 덮어쓰기 모드는 대상을 먼저 치움)
	if err := refuseOtherAt(src, destPath); err != nil {
		return err
	}
	err := os.Rename(src, destPath)
	if err == nil || !isCrossDevice(err) {
		return err
	}
	// Cross-device: copy then delete — 복사가 하나라도 실패(건너뛴 특수 파일 포함)하면 원본은 그대로
	info, err := os.Lstat(src)
	if err != nil {
		return err
	}
	if err := copyItem(src, destPath); err != nil {
		return err
	}
	if info.IsDir() {
		return os.RemoveAll(src)
	}
	return os.Remove(src) // 링크 · 정션은 링크만
}

// unixCopy: 리눅스 · macOS는 mc처럼 심볼릭 링크를 링크로 복사하고 폴더 권한을 유지 (Todo #137-3).
// Windows는 링크 · 정션이 가리키는 내용을 복사 (TC와 같게, 링크 만들기에 권한이 필요)
var unixCopy = runtime.GOOS != "windows"

// errSpecialSkip: 다시 만들 수 없는 특수 파일(소켓, root가 아닐 때의 장치 파일)
var errSpecialSkip = errors.New("special file skipped")

// specialSkipped: 복사하지 않은 특수 파일 목록 — 나머지는 복사하고 끝에 알림
type specialSkipped struct{ names []string }

func (e *specialSkipped) Error() string {
	return fmt.Sprintf("특수 파일(소켓 · 장치 등) %d개는 복사하지 않았습니다: %s", len(e.names), strings.Join(e.names, ", "))
}

// copyItem: 고른 항목 하나 — 폴더 · 파일 · 링크 · 특수 파일 (Todo #137-3)
func copyItem(src, dst string) error {
	fi, err := os.Lstat(src)
	if err != nil {
		return err
	}
	if fi.Mode()&os.ModeSymlink != 0 && unixCopy {
		return copySymlink(src, dst)
	}
	if fi.Mode()&(os.ModeSymlink|os.ModeIrregular) != 0 {
		if fi, err = os.Stat(src); err != nil { // Windows 링크 · 정션: 가리키는 것
			return err
		}
	}
	switch {
	case fi.IsDir():
		return copyDir(src, dst)
	case fi.Mode().IsRegular():
		return copyFile(src, dst)
	}
	if err := copySpecialFile(src, dst, fi); err != nil {
		if errors.Is(err, errSpecialSkip) {
			return &specialSkipped{[]string{filepath.Base(src)}}
		}
		return err
	}
	return nil
}

// copySymlink: 링크를 링크로 (가리키는 값 그대로 — 상대 링크는 복사본 안에서도 그대로 통함, 끊어진 링크도)
func copySymlink(src, dst string) error {
	if samePath(src, dst) {
		return errSameSource(src)
	}
	target, err := os.Readlink(src)
	if err != nil {
		return err
	}
	if err := clearForReplace(dst); err != nil {
		return err
	}
	return os.Symlink(target, dst)
}

// clearForReplace: 덮어쓸 자리의 파일 · 링크를 치움 (폴더는 거부)
func clearForReplace(dst string) error {
	fi, err := os.Lstat(dst)
	if err != nil {
		return nil
	}
	if fi.IsDir() {
		return fmt.Errorf("같은 이름의 폴더가 있습니다: %s", filepath.Base(dst))
	}
	return os.Remove(dst)
}

// copySpecialFile: FIFO · 장치 파일은 내용을 읽지 않고 같은 것을 만듦 — 읽으면 멈추거나(FIFO) 끝나지 않음(/dev/zero).
// 만들 수 없는 것(소켓 등)은 대상을 건드리지 않고 errSpecialSkip
func copySpecialFile(src, dst string, fi os.FileInfo) error {
	if samePath(src, dst) {
		return errSameSource(src)
	}
	if !canMakeSpecial(fi) {
		return errSpecialSkip
	}
	if err := clearForReplace(dst); err != nil {
		return err
	}
	if err := makeSpecial(dst, fi); err != nil {
		return fmt.Errorf("%s: %w", filepath.Base(src), err)
	}
	os.Chmod(dst, fi.Mode().Perm()) // mkfifo · mknod는 umask를 받음
	os.Chtimes(dst, fi.ModTime(), fi.ModTime())
	return nil
}

// refuseArchiveMove: 압축 파일 안에서 꺼내 옮기거나 안으로 옮기는 것은 거부 (Todo #133-5)
func refuseArchiveMove(sources []string, destination string) error {
	if archiveTarget(destination) {
		return errArchiveReadOnly
	}
	return refuseInArchive(sources...)
}

func (fm *FileManager) MoveItems(sources []string, destination string) error {
	if err := refuseArchiveMove(sources, destination); err != nil {
		return err
	}
	for _, src := range sources {
		destPath := filepath.Join(destination, filepath.Base(src))
		if err := fm.moveOne(src, destPath); err != nil {
			return err
		}
	}
	return nil
}

// MoveItemsOverwrite: 대상에 같은 이름 항목이 있으면 교체하며 이동합니다.
// 원본과 대상이 같으면 거부하고, 이동 실패 시 기존 대상을 복원합니다 (Todo #68).
func (fm *FileManager) MoveItemsOverwrite(sources []string, destination string) error {
	if err := refuseArchiveMove(sources, destination); err != nil {
		return err
	}
	for _, src := range sources {
		destPath := filepath.Join(destination, filepath.Base(src))
		if samePath(src, destPath) {
			return errSameSource(src)
		}
		if _, err := os.Lstat(src); err != nil {
			return err
		}
		if err := replaceWith(destPath, func() error { return fm.moveOne(src, destPath) }); err != nil {
			return err
		}
	}
	return nil
}

// MoveItemsRename: 대상에 같은 이름 파일이 있으면 자동으로 이름을 변경하여 이동합니다.
func (fm *FileManager) MoveItemsRename(sources []string, destination string) error {
	if err := refuseArchiveMove(sources, destination); err != nil {
		return err
	}
	for _, src := range sources {
		name := filepath.Base(src)
		destPath := filepath.Join(destination, name)
		if _, err := os.Stat(destPath); err == nil {
			if destPath, err = uniqueName(destination, name); err != nil {
				return err
			}
		}
		if err := fm.moveOne(src, destPath); err != nil {
			return err
		}
	}
	return nil
}

func (fm *FileManager) DeleteItems(paths []string) error {
	if err := refuseInArchive(paths...); err != nil {
		return err
	}
	for _, p := range paths {
		if err := guardDeletable(p); err != nil {
			return err
		}
	}
	for _, p := range paths {
		if err := os.RemoveAll(p); err != nil {
			return err
		}
	}
	return nil
}

// Todo #57: 휴지통(Recycle Bin)으로 이동. Windows: SHFileOperationW, 리눅스: freedesktop 휴지통(#137-1), 그 외: 미지원.
func (fm *FileManager) TrashItems(paths []string) error {
	if err := refuseInArchive(paths...); err != nil {
		return err
	}
	for _, p := range paths {
		if err := guardDeletable(p); err != nil {
			return err
		}
	}
	return trashItems(paths)
}

func (fm *FileManager) CreateDirectory(path string) error {
	if err := refuseInArchive(path); err != nil {
		return err
	}
	if _, err := os.Stat(path); err == nil {
		return fmt.Errorf("폴더가 이미 존재합니다: %s", filepath.Base(path))
	}
	return os.MkdirAll(path, 0755)
}

func (fm *FileManager) CreateFile(path string) error {
	if err := refuseInArchive(path); err != nil {
		return err
	}
	// O_EXCL: 확인과 생성 사이에 만들어진 파일을 비우지 않도록 (Todo #99)
	f, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0644)
	if os.IsExist(err) {
		return fmt.Errorf("파일이 이미 존재합니다: %s", filepath.Base(path))
	}
	if err != nil {
		return err
	}
	return f.Close()
}

// RenameItem: 이름 바꾸기. 같은 이름의 다른 항목이 있으면 거부 — Windows의 os.Rename은 파일을 말없이 덮어씀 (Todo #130-1).
// 대소문자만 바꾸는 것(a.txt → A.txt)은 같은 파일이므로 허용
func (fm *FileManager) RenameItem(oldPath, newPath string) error {
	if err := refuseInArchive(oldPath, newPath); err != nil {
		return err
	}
	if err := refuseOtherAt(oldPath, newPath); err != nil {
		return err
	}
	return os.Rename(oldPath, newPath)
}

// refuseOtherAt: dst에 src가 아닌 다른 항목이 있으면 오류 — os.Rename이 덮어쓰기 전에 (이름 바꾸기·이동 공용)
func refuseOtherAt(src, dst string) error {
	d, err := os.Lstat(dst)
	if err != nil {
		return nil
	}
	sInfo, err := os.Lstat(src)
	if err != nil {
		return err
	}
	if !os.SameFile(sInfo, d) {
		return fmt.Errorf("같은 이름이 이미 있습니다: %s", filepath.Base(dst))
	}
	return nil
}

// errSameSource: 원본과 대상이 같은 항목일 때 반환 (Todo #69 — os.Create가 원본을 비우는 것 방지)
func errSameSource(src string) error {
	return fmt.Errorf("원본과 대상이 같습니다: %s", filepath.Base(src))
}

func copyFile(src, dst string) error {
	if samePath(src, dst) {
		return errSameSource(src)
	}
	// 일반 파일만 읽음 — FIFO · 장치 파일을 열면 멈추거나 끝나지 않음 (Todo #137-3)
	if fi, err := os.Stat(src); err != nil {
		return err
	} else if !fi.Mode().IsRegular() {
		return fmt.Errorf("일반 파일이 아닙니다 (FIFO · 장치 등): %s", filepath.Base(src))
	}
	// 대상이 심볼릭 링크면 링크가 가리키는 다른 파일에 쓰지 않도록 링크만 치움
	if fi, err := os.Lstat(dst); err == nil && fi.Mode()&os.ModeSymlink != 0 {
		if err := os.Remove(dst); err != nil {
			return err
		}
	}
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()

	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	// Todo #90: 쓰기/닫기(네트워크 드라이브의 지연 쓰기 실패 등) 에러를 확인하고 부분 파일은 삭제.
	// 이동(moveOne)은 이 결과를 보고 원본을 지우므로 실패를 성공으로 보고하면 데이터가 사라짐.
	if _, err := io.Copy(out, in); err != nil {
		out.Close()
		os.Remove(dst)
		return err
	}
	if err := out.Close(); err != nil {
		os.Remove(dst)
		return err
	}

	if info, err := os.Stat(src); err == nil {
		os.Chmod(dst, info.Mode())
		// 수정 시각 유지 (Total Commander와 같게, 폴더 동기화가 다시 비교해도 같게 — Todo #133-6)
		os.Chtimes(dst, info.ModTime(), info.ModTime())
	}
	return nil
}

func copyDir(src, dst string) error {
	if samePath(src, dst) {
		return errSameSource(src)
	}
	if isSubPath(src, dst) {
		return errIntoSelf(src)
	}
	var skipped []string
	type dirMode struct {
		path string
		mode os.FileMode
	}
	var modes []dirMode
	err := filepath.WalkDir(src, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		rel, err := filepath.Rel(src, path)
		if err != nil {
			return err
		}
		target := filepath.Join(dst, rel)
		if d.IsDir() {
			if info, err := d.Info(); err == nil && unixCopy {
				modes = append(modes, dirMode{target, info.Mode().Perm()})
			}
			return os.MkdirAll(target, 0755)
		}
		t := d.Type()
		switch {
		case t&os.ModeSymlink != 0 && unixCopy:
			return copySymlink(path, target)
		// 심볼릭 링크 / Windows 정션(ModeIrregular)은 WalkDir가 따라가지 않으므로 직접 처리 (Todo #90)
		case t&(os.ModeSymlink|os.ModeIrregular) != 0:
			return copyLinkTarget(path, target, src)
		case t.IsRegular():
			return copyFile(path, target)
		}
		info, err := d.Info()
		if err != nil {
			return err
		}
		if err := copySpecialFile(path, target, info); errors.Is(err, errSpecialSkip) {
			skipped = append(skipped, filepath.ToSlash(rel))
		} else if err != nil {
			return err
		}
		return nil
	})
	// 폴더 권한은 안을 다 채운 뒤 아래부터 (읽기 전용 폴더에도 복사되게, Todo #137-3)
	for i := len(modes) - 1; i >= 0; i-- {
		os.Chmod(modes[i].path, modes[i].mode)
	}
	if err != nil {
		return err
	}
	if len(skipped) > 0 {
		return &specialSkipped{skipped}
	}
	return nil
}

// resolveLink: 링크가 가리키는 실제 경로. Go 1.23+에서 EvalSymlinks는 Windows 정션을 해석하지 않으므로
// Readlink로 직접 따라갑니다.
func resolveLink(link string) (string, error) {
	t, err := os.Readlink(link)
	if err != nil {
		return "", err
	}
	if !filepath.IsAbs(t) {
		t = filepath.Join(filepath.Dir(link), t)
	}
	if r, err := filepath.EvalSymlinks(t); err == nil {
		t = r
	}
	return filepath.Clean(t), nil
}

// copyLinkTarget: 링크가 가리키는 내용을 복사합니다. 복사 루트 자신이나 상위 폴더를 가리키면
// 무한 복사가 되므로 거부합니다.
func copyLinkTarget(link, target, root string) error {
	info, err := os.Stat(link)
	if err != nil {
		return fmt.Errorf("링크 대상을 찾을 수 없습니다: %s", filepath.Base(link))
	}
	if !info.IsDir() {
		return copyFile(link, target)
	}
	resolved, err := resolveLink(link)
	if err != nil {
		return err
	}
	if samePath(resolved, root) || isSubPath(resolved, root) {
		return fmt.Errorf("상위 폴더를 가리키는 링크는 복사할 수 없습니다: %s", filepath.Base(link))
	}
	return copyDir(resolved, target)
}

// ─── RunStarlarkFile ──────────────────────────────────────────────────────────
