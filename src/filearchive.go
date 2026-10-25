package main

// ZIP 압축·풀기 (Todo #132-3)

import (
	"archive/zip"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"totalcmd/internal/archive"
)

// CompressItems: 임시 파일에 압축한 뒤 성공 시에만 destPath로 교체합니다 (Todo #89).
// 엔트리 이름은 zip 규격대로 '/'를 사용하고 빈 폴더도 포함합니다. 모든 에러를 보고합니다.
func (fm *FileManager) CompressItems(sources []string, destPath string) error {
	if err := refuseInArchive(append([]string{destPath}, sources...)...); err != nil {
		return err
	}
	if !strings.HasSuffix(destPath, ".zip") {
		destPath += ".zip"
	}
	// 같은 이름의 압축 파일이 있으면 덮어쓰지 않고 "archive (1).zip" 형태로 (Todo #99)
	if _, err := os.Lstat(destPath); err == nil {
		unique, err := uniqueName(filepath.Dir(destPath), filepath.Base(destPath))
		if err != nil {
			return err
		}
		destPath = unique
	}
	for _, src := range sources {
		if isSubPath(src, destPath) {
			return fmt.Errorf("압축 파일을 압축 대상 폴더 안에 만들 수 없습니다: %s", filepath.Base(src))
		}
	}

	tmp, err := os.CreateTemp(filepath.Dir(destPath), filepath.Base(destPath)+".*.tmp")
	if err != nil {
		return err
	}
	tmpName := tmp.Name()
	fail := func(err error) error {
		tmp.Close()
		os.Remove(tmpName)
		return err
	}

	w := zip.NewWriter(tmp)
	for _, src := range sources {
		info, err := os.Stat(src)
		if err != nil {
			return fail(err)
		}
		if !info.IsDir() {
			if err := addZipEntry(w, src, filepath.Base(src), info); err != nil {
				return fail(err)
			}
			continue
		}
		base := filepath.Dir(src)
		err = filepath.WalkDir(src, func(path string, d os.DirEntry, walkErr error) error {
			if walkErr != nil {
				return walkErr
			}
			rel, err := filepath.Rel(base, path)
			if err != nil {
				return err
			}
			fi, err := d.Info()
			if err != nil {
				return err
			}
			return addZipEntry(w, path, filepath.ToSlash(rel), fi)
		})
		if err != nil {
			return fail(err)
		}
	}
	if err := w.Close(); err != nil {
		return fail(err)
	}
	if err := tmp.Close(); err != nil {
		os.Remove(tmpName)
		return err
	}
	if err := os.Rename(tmpName, destPath); err != nil {
		os.Remove(tmpName)
		return err
	}
	return nil
}

// addZipEntry: 파일 또는 폴더(이름 끝 '/') 엔트리를 추가합니다.
func addZipEntry(w *zip.Writer, path, name string, info os.FileInfo) error {
	hdr, err := zip.FileInfoHeader(info)
	if err != nil {
		return err
	}
	hdr.Name = name
	if info.IsDir() {
		hdr.Name += "/"
		_, err := w.CreateHeader(hdr)
		return err
	}
	hdr.Method = zip.Deflate
	fw, err := w.CreateHeader(hdr)
	if err != nil {
		return err
	}
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()
	_, err = io.Copy(fw, f)
	return err
}

func (fm *FileManager) ExtractArchive(archivePath, destDir string) error {
	if archiveTarget(destDir) {
		return errArchiveReadOnly
	}
	// ZIP 말고 다른 형식(TAR, 7Z, RAR)은 internal/archive로 (Todo #133-5)
	if kind := archive.Kind(archivePath); kind != "" && kind != "zip" {
		sub, err := uniqueName(destDir, archive.BaseName(filepath.Base(archivePath)))
		if err != nil {
			return err
		}
		if err := os.MkdirAll(sub, 0755); err != nil {
			return err
		}
		if err := archive.Extract(archivePath, nil, sub, "overwrite"); err != nil {
			return err
		}
		copyMarkOfTheWeb(archivePath, sub)
		return nil
	}
	// 압축 파일명(확장자 제거)으로 서브폴더 생성, 이미 존재하면 (N) 접미사 추가
	base := filepath.Base(archivePath)
	folderName := strings.TrimSuffix(base, filepath.Ext(base))
	subDir, err := uniqueName(destDir, folderName)
	if err != nil {
		return err
	}
	destDir = subDir
	if err := os.MkdirAll(destDir, 0755); err != nil {
		return err
	}

	r, err := zip.OpenReader(archivePath)
	if err != nil {
		return err
	}
	defer r.Close()

	// Todo #89: 각 단계 에러를 보고. 디렉터리 밖으로 나가는 엔트리(zip slip)는 건너뛰고 마지막에 에러로 알림
	skipped := 0
	for _, f := range r.File {
		destPath := filepath.Join(destDir, f.Name)
		if !strings.HasPrefix(filepath.Clean(destPath), filepath.Clean(destDir)+string(os.PathSeparator)) {
			skipped++
			continue // zip slip protection
		}
		if f.FileInfo().IsDir() {
			if err := os.MkdirAll(destPath, 0755); err != nil {
				return err
			}
			continue
		}
		if err := os.MkdirAll(filepath.Dir(destPath), 0755); err != nil {
			return err
		}
		if err := extractZipFile(f, destPath); err != nil {
			return fmt.Errorf("%s 압축 해제 실패: %w", f.Name, err)
		}
	}
	if skipped > 0 {
		return fmt.Errorf("안전하지 않은 경로의 항목 %d개를 건너뛰었습니다", skipped)
	}
	copyMarkOfTheWeb(archivePath, destDir)
	return nil
}

func extractZipFile(f *zip.File, destPath string) error {
	rc, err := f.Open()
	if err != nil {
		return err
	}
	defer rc.Close()
	out, err := os.Create(destPath)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, rc); err != nil {
		out.Close()
		os.Remove(destPath)
		return err
	}
	return out.Close()
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
