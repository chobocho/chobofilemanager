package main

// 파일 작업: 복사·이동·삭제·이름 바꾸기와 그 공용 도우미 (Todo #132-3, filemanager.go에서 분리)

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
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
		info, err := os.Stat(src)
		if err != nil {
			return err
		}
		destPath := filepath.Join(destination, filepath.Base(src))
		if info.IsDir() {
			if err := copyDir(src, destPath); err != nil {
				return err
			}
		} else {
			if err := copyFile(src, destPath); err != nil {
				return err
			}
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
		info, err := os.Stat(src)
		if err != nil {
			return err
		}
		name := filepath.Base(src)
		destPath := filepath.Join(destination, name)
		if _, err := os.Stat(destPath); err == nil {
			if destPath, err = uniqueName(destination, name); err != nil {
				return err
			}
		}
		if info.IsDir() {
			if err := copyDir(src, destPath); err != nil {
				return err
			}
		} else {
			if err := copyFile(src, destPath); err != nil {
				return err
			}
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
		info, err := os.Stat(src)
		if err != nil {
			return err
		}
		destPath := filepath.Join(destination, filepath.Base(src))
		if _, err := os.Stat(destPath); err == nil {
			continue // 이미 존재하면 건너뜀
		}
		if info.IsDir() {
			if err := copyDir(src, destPath); err != nil {
				return err
			}
		} else {
			if err := copyFile(src, destPath); err != nil {
				return err
			}
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
	// Cross-device: copy then delete
	info, err := os.Stat(src)
	if err != nil {
		return err
	}
	if info.IsDir() {
		if err := copyDir(src, destPath); err != nil {
			return err
		}
		return os.RemoveAll(src)
	}
	if err := copyFile(src, destPath); err != nil {
		return err
	}
	return os.Remove(src)
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

// Todo #57: 휴지통(Recycle Bin)으로 이동. Windows: SHFileOperationW, 그 외: 미지원.
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
	return filepath.WalkDir(src, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		rel, err := filepath.Rel(src, path)
		if err != nil {
			return err
		}
		target := filepath.Join(dst, rel)
		if d.IsDir() {
			return os.MkdirAll(target, 0755)
		}
		// 심볼릭 링크 / Windows 정션(ModeIrregular)은 WalkDir가 따라가지 않으므로 직접 처리 (Todo #90)
		if d.Type()&(os.ModeSymlink|os.ModeIrregular) != 0 {
			return copyLinkTarget(path, target, src)
		}
		return copyFile(path, target)
	})
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
