package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// ─── Todo #116: 마크다운의 GitHub blob 이미지 → 같은 저장소의 로컬 사본 ─────────

var pngBytes = []byte{0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n', 0, 0, 0, 0}

// makeRepo: remoteURL을 origin으로 가진 가짜 git 저장소 (빈 문자열이면 remote 없음)
func makeRepo(t *testing.T, remoteURL string) string {
	t.Helper()
	root := t.TempDir()
	os.MkdirAll(filepath.Join(root, ".git"), 0755)
	cfg := "[core]\n\trepositoryformatversion = 0\n"
	if remoteURL != "" {
		cfg += "[remote \"origin\"]\n\turl = " + remoteURL + "\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n"
	}
	os.WriteFile(filepath.Join(root, ".git", "config"), []byte(cfg), 0644)
	os.MkdirAll(filepath.Join(root, "doc"), 0755)
	os.WriteFile(filepath.Join(root, "doc", "shot.png"), pngBytes, 0644)
	os.WriteFile(filepath.Join(root, "README.md"), []byte("# x"), 0644)
	return root
}

func TestResolveRepoImage_FindsLocalCopy(t *testing.T) {
	root := makeRepo(t, "https://github.com/chobocho/freecell.git")
	got := newTestFM().ResolveRepoImage(filepath.Join(root, "README.md"), "chobocho", "freecell", "doc/shot.png")
	if !strings.HasPrefix(got, "data:image/png;base64,") {
		t.Errorf("expected local data URL, got %q", got)
	}
}

func TestResolveRepoImage_FromSubdirMarkdown(t *testing.T) {
	root := makeRepo(t, "git@github.com:chobocho/freecell.git")
	os.MkdirAll(filepath.Join(root, "src", "deep"), 0755)
	md := filepath.Join(root, "src", "deep", "NOTES.md")
	os.WriteFile(md, []byte("x"), 0644)
	if got := newTestFM().ResolveRepoImage(md, "chobocho", "freecell", "doc/shot.png"); got == "" {
		t.Error("should resolve relative to the git root, not the markdown folder")
	}
}

func TestResolveRepoImage_CaseInsensitiveRepoMatch(t *testing.T) {
	root := makeRepo(t, "https://github.com/ChoboCho/FreeCell")
	if got := newTestFM().ResolveRepoImage(filepath.Join(root, "README.md"), "chobocho", "freecell", "doc/shot.png"); got == "" {
		t.Error("GitHub owner/repo names are case-insensitive")
	}
}

func TestResolveRepoImage_OtherRepoNotUsed(t *testing.T) {
	root := makeRepo(t, "https://github.com/someone/else.git")
	if got := newTestFM().ResolveRepoImage(filepath.Join(root, "README.md"), "chobocho", "freecell", "doc/shot.png"); got != "" {
		t.Error("image from another repository must not be replaced with a local file")
	}
}

func TestResolveRepoImage_NoRemoteAllowed(t *testing.T) {
	// remote가 없는 로컬 저장소(복사본 등)는 경로가 있으면 사용
	root := makeRepo(t, "")
	if got := newTestFM().ResolveRepoImage(filepath.Join(root, "README.md"), "chobocho", "freecell", "doc/shot.png"); got == "" {
		t.Error("repo without remotes should allow local copy")
	}
}

func TestResolveRepoImage_Rejections(t *testing.T) {
	root := makeRepo(t, "https://github.com/chobocho/freecell.git")
	os.WriteFile(filepath.Join(root, "doc", "notes.txt"), []byte("x"), 0644)
	md := filepath.Join(root, "README.md")
	fm := newTestFM()
	for _, p := range []string{
		"doc/missing.png",   // 없음
		"../outside.png",    // 저장소 밖
		"doc/../../x.png",   // 저장소 밖
		"doc/notes.txt",     // 이미지 아님
		"",                  // 빈 경로
		"/etc/passwd",       // 절대 경로
		"C:/Windows/x.png",  // 절대 경로
	} {
		if got := fm.ResolveRepoImage(md, "chobocho", "freecell", p); got != "" {
			t.Errorf("path %q must not resolve, got %q", p, got[:20])
		}
	}
}

func TestResolveRepoImage_NotInGitRepo(t *testing.T) {
	dir := t.TempDir()
	os.MkdirAll(filepath.Join(dir, "doc"), 0755)
	os.WriteFile(filepath.Join(dir, "doc", "shot.png"), pngBytes, 0644)
	md := filepath.Join(dir, "README.md")
	os.WriteFile(md, []byte("x"), 0644)
	if got := newTestFM().ResolveRepoImage(md, "chobocho", "freecell", "doc/shot.png"); got != "" {
		t.Error("outside a git repository there is no local copy to prefer")
	}
}

func TestResolveRepoImage_GitFileWorktree(t *testing.T) {
	// 워크트리/서브모듈은 .git이 파일 — 저장소 루트로 인식 (remote 확인은 생략)
	root := t.TempDir()
	os.WriteFile(filepath.Join(root, ".git"), []byte("gitdir: /elsewhere/.git/worktrees/x\n"), 0644)
	os.MkdirAll(filepath.Join(root, "doc"), 0755)
	os.WriteFile(filepath.Join(root, "doc", "shot.png"), pngBytes, 0644)
	md := filepath.Join(root, "README.md")
	os.WriteFile(md, []byte("x"), 0644)
	if got := newTestFM().ResolveRepoImage(md, "chobocho", "freecell", "doc/shot.png"); got == "" {
		t.Error(".git file (worktree) should be treated as repository root")
	}
}

func TestApp_ResolveRepoImageBinding(t *testing.T) {
	root := makeRepo(t, "https://github.com/chobocho/freecell.git")
	a := newTestApp(t)
	if got := a.ResolveRepoImage(filepath.Join(root, "README.md"), "chobocho", "freecell", "doc/shot.png"); got == "" {
		t.Error("App binding should delegate")
	}
}
