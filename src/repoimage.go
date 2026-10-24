package main

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

// Todo #116: 마크다운의 GitHub blob 이미지(https://github.com/<owner>/<repo>/blob/<ref>/<path>)를
// 마크다운 파일이 속한 로컬 git 저장소의 같은 파일로 보여 주기 위한 해석.
// 찾지 못하면 빈 문자열을 반환하고, 프론트는 raw.githubusercontent.com 주소로 표시합니다.

var repoImageExts = map[string]bool{
	".png": true, ".jpg": true, ".jpeg": true, ".gif": true,
	".webp": true, ".bmp": true, ".svg": true, ".ico": true,
}

var remoteURLLine = regexp.MustCompile(`(?m)^\s*url\s*=\s*(\S+)`)

// ResolveRepoImage: 로컬 사본이 있으면 data URL, 없거나 조건에 맞지 않으면 "".
func (fm *FileManager) ResolveRepoImage(markdownPath, owner, repo, relPath string) string {
	root := findGitRoot(filepath.Dir(markdownPath))
	if root == "" || !repoMatches(root, owner, repo) {
		return ""
	}
	target, ok := repoFilePath(root, relPath)
	if !ok || !repoImageExts[strings.ToLower(filepath.Ext(target))] {
		return ""
	}
	if info, err := os.Stat(target); err != nil || info.IsDir() {
		return ""
	}
	dataURL, err := fm.ReadImageFile(target)
	if err != nil {
		return ""
	}
	return dataURL
}

// findGitRoot: dir부터 위로 올라가며 .git(폴더 또는 워크트리용 파일)이 있는 폴더를 찾음
func findGitRoot(dir string) string {
	dir = filepath.Clean(dir)
	for {
		if _, err := os.Stat(filepath.Join(dir, ".git")); err == nil {
			return dir
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return ""
		}
		dir = parent
	}
}

// repoMatches: .git/config의 remote 주소 중 github.com/<owner>/<repo>가 있으면 true.
// remote가 하나도 없거나(.git이 파일인 워크트리 포함) 설정을 읽을 수 없으면 경로만으로 판단해 true.
func repoMatches(root, owner, repo string) bool {
	data, err := os.ReadFile(filepath.Join(root, ".git", "config"))
	if err != nil {
		return true
	}
	urls := remoteURLLine.FindAllStringSubmatch(string(data), -1)
	if len(urls) == 0 {
		return true
	}
	want := strings.ToLower(owner + "/" + repo)
	for _, m := range urls {
		u := strings.ToLower(strings.TrimSuffix(strings.TrimSuffix(m[1], "/"), ".git"))
		if strings.HasSuffix(u, "github.com/"+want) || strings.HasSuffix(u, "github.com:"+want) {
			return true
		}
	}
	return false
}

// repoFilePath: 저장소 기준 상대 경로를 실제 경로로. 절대 경로나 저장소 밖으로 나가는 경로는 거부
func repoFilePath(root, relPath string) (string, bool) {
	if relPath == "" || strings.HasPrefix(relPath, "/") || strings.HasPrefix(relPath, `\`) || filepath.VolumeName(relPath) != "" || strings.Contains(relPath, ":") {
		return "", false
	}
	target := filepath.Join(root, filepath.FromSlash(relPath))
	if !isSubPath(root, target) {
		return "", false
	}
	return target, true
}
