package main

import (
	"archive/zip"
	"encoding/base64"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"time"
	"unicode/utf8"

	"go.starlark.net/starlark"
	"go.starlark.net/syntax"
	"golang.org/x/text/encoding/korean"
)

// FileManager: 파일 작업 (상태 없음 — 작업마다 경로를 받음)
type FileManager struct{}

type FileInfo struct {
	Name        string    `json:"name"`
	Path        string    `json:"path"`
	Size        int64     `json:"size"`
	IsDir       bool      `json:"isDir"`
	IsHidden    bool      `json:"isHidden"`
	Modified    time.Time `json:"modified"`
	Extension   string    `json:"extension"`
	Permissions string    `json:"permissions"`
	IsSymlink   bool      `json:"isSymlink"`
	LinkTarget  string    `json:"linkTarget"`
}

type DirectoryListing struct {
	Path  string     `json:"path"`
	Files []FileInfo `json:"files"`
	Error string     `json:"error,omitempty"`
}

type DriveInfo struct {
	Name       string `json:"name"`
	Path       string `json:"path"`
	DriveType  string `json:"driveType"`
	TotalSpace int64  `json:"totalSpace"`
	FreeSpace  int64  `json:"freeSpace"`
}

type PathPart struct {
	Name string `json:"name"`
	Path string `json:"path"`
}

func NewFileManager() *FileManager {
	return &FileManager{}
}

func (fm *FileManager) ListDirectory(path string) (*DirectoryListing, error) {
	if path == "" {
		path = fm.GetHomeDirectory()
	}

	entries, err := os.ReadDir(path)
	if err != nil {
		return nil, fmt.Errorf("cannot read directory: %w", err)
	}

	var files []FileInfo
	for _, entry := range entries {
		info, err := entry.Info()
		if err != nil {
			continue
		}

		fullPath := filepath.Join(path, entry.Name())
		isHidden := isHiddenFile(entry.Name())

		fi := FileInfo{
			Name:        entry.Name(),
			Path:        fullPath,
			Size:        info.Size(),
			IsDir:       entry.IsDir(),
			IsHidden:    isHidden,
			Modified:    info.ModTime(),
			Extension:   strings.ToLower(filepath.Ext(entry.Name())),
			Permissions: info.Mode().String(),
		}

		if entry.Type()&(os.ModeSymlink|os.ModeIrregular) != 0 {
			fi.IsSymlink = true
			target, err := os.Readlink(fullPath)
			if err == nil {
				fi.LinkTarget = target
			}
			// 폴더를 가리키는 링크/정션은 폴더로 표시 (Enter로 진입 가능, Todo #90)
			if ti, err := os.Stat(fullPath); err == nil && ti.IsDir() {
				fi.IsDir = true
			}
		}

		files = append(files, fi)
	}

	// Sort: directories first, then files, both alphabetically
	sort.Slice(files, func(i, j int) bool {
		if files[i].IsDir != files[j].IsDir {
			return files[i].IsDir
		}
		return strings.ToLower(files[i].Name) < strings.ToLower(files[j].Name)
	})

	return &DirectoryListing{
		Path:  path,
		Files: files,
	}, nil
}

func (fm *FileManager) GetHomeDirectory() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return "/"
	}
	return home
}

func (fm *FileManager) GetDrives() []DriveInfo {
	if runtime.GOOS == "windows" {
		return getWindowsDrives()
	}
	return getLinuxMounts()
}

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

func (fm *FileManager) MoveItems(sources []string, destination string) error {
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
	for _, p := range paths {
		if err := guardDeletable(p); err != nil {
			return err
		}
	}
	return trashItems(paths)
}

func (fm *FileManager) CreateDirectory(path string) error {
	if _, err := os.Stat(path); err == nil {
		return fmt.Errorf("폴더가 이미 존재합니다: %s", filepath.Base(path))
	}
	return os.MkdirAll(path, 0755)
}

func (fm *FileManager) CreateFile(path string) error {
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

func (fm *FileManager) RenameItem(oldPath, newPath string) error {
	return os.Rename(oldPath, newPath)
}

func (fm *FileManager) GetFileInfo(path string) (*FileInfo, error) {
	info, err := os.Lstat(path)
	if err != nil {
		return nil, err
	}
	fi := &FileInfo{
		Name:        info.Name(),
		Path:        path,
		Size:        info.Size(),
		IsDir:       info.IsDir(),
		IsHidden:    isHiddenFile(info.Name()),
		Modified:    info.ModTime(),
		Extension:   strings.ToLower(filepath.Ext(info.Name())),
		Permissions: info.Mode().String(),
	}
	if info.Mode()&os.ModeSymlink != 0 {
		fi.IsSymlink = true
		target, err := os.Readlink(path)
		if err == nil {
			fi.LinkTarget = target
		}
	}
	return fi, nil
}

// detectionWindow: DetectEncoding이 검사하는 파일 앞부분 크기.
// 큰 파일에서 전체 바이트를 휴리스틱에 돌릴 필요는 없음.
const detectionWindow = 64 * 1024

func (fm *FileManager) ReadTextFile(path string) (string, error) {
	return fm.ReadTextFileWithEncoding(path, "auto")
}

// ReadTextFileWithEncoding: 사용자 지정 인코딩으로 파일을 읽는다.
// encName 값:
//   - "auto" 또는 "" — DetectEncoding으로 자동 판별
//   - "utf-8", "utf-16le", "utf-16be", "cp949"(=euc-kr), "johab"(=조합형)
//   - 알 수 없는 값은 "auto"로 폴백
//
// 인코딩 자동 판별이 틀린 케이스(짧은 한글 파일, 혼합 인코딩 등)에서
// 사용자가 F3/F4 뷰어/편집기 UI로 수동 변경할 때 사용.
// 내장 뷰어/에디터로 읽을 수 있는 최대 크기 (Todo #98, #114: 32MB).
// 프론트 MAX_VIEWER_FILE_SIZE(utils/fileTypes.js)와 같은 값 — 프론트 검사를 거치지 않는 호출에도 메모리 폭주 방지
const maxViewerFileSize = 32 * 1024 * 1024

func readLimited(path string) ([]byte, error) {
	info, err := os.Stat(path)
	if err != nil {
		return nil, err
	}
	if info.Size() > maxViewerFileSize {
		return nil, fmt.Errorf("파일이 너무 큽니다 (%d MB 초과): %s", maxViewerFileSize/1024/1024, filepath.Base(path))
	}
	return os.ReadFile(path)
}

func (fm *FileManager) ReadTextFileWithEncoding(path string, encName string) (string, error) {
	data, err := readLimited(path)
	if err != nil {
		return "", err
	}
	enc, isAuto := parseEncodingName(encName)
	if isAuto {
		window := data
		if len(window) > detectionWindow {
			window = window[:detectionWindow]
		}
		enc = DetectEncoding(window)
	}
	if decoded, decErr := DecodeToUTF8(data, enc); decErr == nil {
		return decoded, nil
	}
	// CP949 strict 실패 → EUC-KR 관용 모드 폴백
	if decoded, decErr := korean.EUCKR.NewDecoder().Bytes(data); decErr == nil {
		return string(decoded), nil
	}
	if utf8.Valid(data) {
		return composeHangulJamo(string(data)), nil
	}
	return string(data), nil
}

// parseEncodingName: UI에서 받은 문자열을 Encoding으로 변환.
// 두 번째 반환값이 true면 "auto" — 호출 측에서 자동 판별 수행.
func parseEncodingName(name string) (Encoding, bool) {
	switch strings.ToLower(strings.TrimSpace(name)) {
	case "", "auto":
		return EncUnknown, true
	case "utf-8", "utf8":
		return EncUTF8, false
	case "utf-8-bom", "utf8-bom":
		return EncUTF8BOM, false
	case "utf-16le", "utf-16-le", "utf16le":
		return EncUTF16LE, false
	case "utf-16be", "utf-16-be", "utf16be":
		return EncUTF16BE, false
	case "cp949", "euc-kr", "euckr":
		return EncCP949, false
	case "johab", "조합형":
		return EncJohab, false
	}
	// 미지원 인코딩 이름은 auto 폴백
	return EncUnknown, true
}

func (fm *FileManager) WriteTextFile(path string, content string) error {
	return writeUserFile(path, []byte(content))
}

// WriteTextFileWithEncoding: 지정 인코딩으로 저장합니다 (Todo #74).
// encName이 auto/빈 값이면 기존 파일의 인코딩을 판별해 유지하고, 새/빈 파일은 UTF-8로 저장합니다.
// 인코딩할 수 없는 문자가 있으면 파일을 건드리지 않고 에러를 반환합니다.
func (fm *FileManager) WriteTextFileWithEncoding(path string, content string, encName string) error {
	enc, isAuto := parseEncodingName(encName)
	if isAuto {
		enc = EncUTF8
		if f, err := os.Open(path); err == nil {
			buf := make([]byte, detectionWindow)
			n, _ := io.ReadFull(f, buf)
			f.Close()
			if n > 0 {
				enc = DetectEncoding(buf[:n])
			}
		}
	}
	data, err := EncodeFromUTF8(content, enc)
	if err != nil {
		return err
	}
	return writeUserFile(path, data)
}

// imageMimeType: 파일 확장자를 보고 표준 MIME 타입을 결정.
// 미지원 확장자는 application/octet-stream (브라우저가 처리 불가능하지만
// 호출자에게 "지원 안 됨"을 명확히 알리는 표식).
func imageMimeType(ext string) string {
	switch strings.ToLower(ext) {
	case ".png":
		return "image/png"
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".gif":
		return "image/gif"
	case ".webp":
		return "image/webp"
	case ".bmp":
		return "image/bmp"
	case ".svg":
		return "image/svg+xml"
	case ".ico":
		return "image/x-icon"
	}
	return "application/octet-stream"
}

// CreateStarlarkScratchFile: Ctrl+Enter로 호출되는 Starlark 스크래치 버퍼를 위한
// 임시 .star 파일을 생성하고 절대 경로를 반환한다.
//
// 사용 흐름: 파일패널 등에서 Ctrl+Enter → 본 API로 임시 파일 생성 → F4 에디터로
// 열어서 Starlark 스니펫 작성 → F5/Ctrl+Enter로 실행.
//
// 위치는 OS 임시 디렉터리(os.TempDir())이며, 패턴은 chobofm-scratch-*.star.
// OS가 주기적으로 정리하므로 별도 cleanup 코드 불필요.
func (fm *FileManager) CreateStarlarkScratchFile() (string, error) {
	f, err := os.CreateTemp("", "chobofm-scratch-*.star")
	if err != nil {
		return "", err
	}
	defer f.Close()
	template := fmt.Sprintf("# Starlark 스크래치 (%s)\n# F5 또는 Ctrl+Enter로 실행\n\nprint(\"Hello, Starlark!\")\n",
		time.Now().Format("2006-01-02 15:04:05"))
	if _, err := f.WriteString(template); err != nil {
		return "", err
	}
	return f.Name(), nil
}

// ReadImageFile: 이미지 파일을 base64 데이터 URL로 읽는다 (Todo #52).
// 프론트엔드는 <img src={dataUrl}>로 그대로 사용. Wails에서 file:// URL을
// 직접 띄우는 것보다 이식성·보안 측면에서 단순.
func (fm *FileManager) ReadImageFile(path string) (string, error) {
	data, err := readLimited(path)
	if err != nil {
		return "", err
	}
	mime := imageMimeType(filepath.Ext(path))
	return "data:" + mime + ";base64," + base64.StdEncoding.EncodeToString(data), nil
}

// buildOpenCmd: Linux용 열기 명령. Windows는 셸 구문 해석을 피하기 위해 ShellExecuteW 사용 (Todo #72).
func buildOpenCmd(path string) (*exec.Cmd, error) {
	dir := filepath.Dir(path)
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "linux":
		cmd = exec.Command("xdg-open", path)
	default:
		return nil, fmt.Errorf("unsupported OS")
	}
	cmd.Dir = dir
	return cmd, nil
}

func (fm *FileManager) OpenFile(path string) error {
	if runtime.GOOS == "windows" {
		return shellOpen(path, filepath.Dir(path))
	}
	cmd, err := buildOpenCmd(path)
	if err != nil {
		return err
	}
	return cmd.Start()
}

func (fm *FileManager) RunShellCommand(command, workDir string) (string, error) {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		cmd = exec.Command("cmd", "/c", command)
	default:
		cmd = exec.Command("bash", "-c", command)
	}
	cmd.Dir = workDir
	output, err := cmd.CombinedOutput()
	return decodeShellOutput(output), err
}

func (fm *FileManager) OpenCmdWindow(workDir string) error {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		cmd = exec.Command("cmd", "/c", "start", "cmd.exe")
	default:
		cmd = exec.Command("x-terminal-emulator")
	}
	cmd.Dir = workDir
	return cmd.Start()
}

func (fm *FileManager) GetPathParts(path string) []PathPart {
	path = filepath.Clean(path)
	var parts []PathPart

	if runtime.GOOS == "windows" {
		// UNC 경로(\\server\share\...)는 "\\server\share"를 첫 조각으로 (Todo #99)
		if vol := filepath.VolumeName(path); strings.HasPrefix(vol, `\\`) {
			root := vol + `\`
			parts = append(parts, PathPart{Name: vol, Path: root})
			accumulated := root
			for _, seg := range strings.Split(strings.TrimPrefix(path[len(vol):], `\`), `\`) {
				if seg == "" {
					continue
				}
				accumulated = filepath.Join(accumulated, seg)
				parts = append(parts, PathPart{Name: seg, Path: accumulated})
			}
			return parts
		}
		segments := strings.Split(path, string(filepath.Separator))
		accumulated := ""
		for _, seg := range segments {
			if seg == "" {
				continue
			}
			if accumulated == "" {
				accumulated = seg + string(filepath.Separator)
			} else {
				accumulated = filepath.Join(accumulated, seg)
			}
			parts = append(parts, PathPart{Name: seg, Path: accumulated})
		}
	} else {
		parts = append(parts, PathPart{Name: "/", Path: "/"})
		segments := strings.Split(strings.TrimPrefix(path, "/"), "/")
		accumulated := "/"
		for _, seg := range segments {
			if seg == "" {
				continue
			}
			accumulated = filepath.Join(accumulated, seg)
			parts = append(parts, PathPart{Name: seg, Path: accumulated})
		}
	}
	return parts
}

func (fm *FileManager) JoinPath(parts ...string) string {
	return filepath.Join(parts...)
}

func (fm *FileManager) GetParentPath(path string) string {
	return filepath.Dir(path)
}

func (fm *FileManager) SearchFiles(rootPath, pattern string, recursive bool) ([]FileInfo, error) {
	var results []FileInfo

	// 쉼표로 분리한 후 각 키워드를 모두 포함하는 AND 검색
	rawTerms := strings.Split(pattern, ",")
	terms := make([]string, 0, len(rawTerms))
	for _, t := range rawTerms {
		t = strings.ToLower(strings.TrimSpace(t))
		if t != "" {
			terms = append(terms, t)
		}
	}
	if len(terms) == 0 {
		return results, nil
	}

	walkFn := func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if path == rootPath {
			return nil // 검색 루트 자체는 결과에서 제외
		}
		// 비재귀 검색: 폴더도 이름 매칭은 하되 내부로 들어가지 않음 (Todo #99)
		skip := error(nil)
		if !recursive && d.IsDir() {
			skip = filepath.SkipDir
		}
		name := strings.ToLower(d.Name())
		for _, term := range terms {
			if !strings.Contains(name, term) {
				return skip
			}
		}
		info, err := d.Info()
		if err == nil {
			results = append(results, FileInfo{
				Name:      d.Name(),
				Path:      path,
				Size:      info.Size(),
				IsDir:     d.IsDir(),
				Modified:  info.ModTime(),
				Extension: strings.ToLower(filepath.Ext(d.Name())),
			})
		}
		return skip
	}

	err := filepath.WalkDir(rootPath, walkFn)
	return results, err
}

func (fm *FileManager) GetFileSize(path string) (int64, error) {
	var total int64
	err := filepath.WalkDir(path, func(p string, d os.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if !d.IsDir() {
			info, err := d.Info()
			if err == nil {
				total += info.Size()
			}
		}
		return nil
	})
	return total, err
}

// CompressItems: 임시 파일에 압축한 뒤 성공 시에만 destPath로 교체합니다 (Todo #89).
// 엔트리 이름은 zip 규격대로 '/'를 사용하고 빈 폴더도 포함합니다. 모든 에러를 보고합니다.
func (fm *FileManager) CompressItems(sources []string, destPath string) error {
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

func isHiddenFile(name string) bool {
	return strings.HasPrefix(name, ".")
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

func (fm *FileManager) RunStarlarkFile(path string) (string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}

	var buf strings.Builder
	thread := &starlark.Thread{
		Name: filepath.Base(path),
		Print: func(_ *starlark.Thread, msg string) {
			buf.WriteString(msg)
			buf.WriteByte('\n')
		},
	}

	// While/Recursion 활성화 — 트리 워킹 인터프리터(Todo #62) 등 반복 루프가 필요한
	// 사용자 스크립트를 위해. 기본 비활성 옵션은 단순 표현 평가에는 충분하지만
	// 조건부 반복문 작성을 막아 1980년대 BASIC을 포팅하기 어렵게 만듦.
	opts := &syntax.FileOptions{While: true, Recursion: true}
	_, execErr := starlark.ExecFileOptions(opts, thread, path, data, nil)
	output := buf.String()
	if execErr != nil {
		if output != "" {
			return output + "\n" + execErr.Error(), nil
		}
		return execErr.Error(), nil
	}
	return output, nil
}
