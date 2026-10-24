package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"testing"
)

// ─── Todo #90: copyFile 실패 정리, 링크/정션 폴더 처리 ─────────────────────────

func TestCopyFile_ReadErrorRemovesPartialDest(t *testing.T) {
	base := t.TempDir()
	srcDir := filepath.Join(base, "adir") // 디렉터리를 읽으면 io.Copy가 실패
	os.MkdirAll(srcDir, 0755)
	dst := filepath.Join(base, "out.bin")
	if err := copyFile(srcDir, dst); err == nil {
		t.Fatal("expected read error")
	}
	if _, err := os.Stat(dst); !os.IsNotExist(err) {
		t.Error("partial destination must be removed on failure")
	}
}

// makeDirLink: Windows는 정션(권한 불필요), 그 외는 심볼릭 링크
func makeDirLink(t *testing.T, target, link string) {
	t.Helper()
	if runtime.GOOS == "windows" {
		if out, err := exec.Command("cmd", "/c", "mklink", "/J", link, target).CombinedOutput(); err != nil {
			t.Skipf("mklink /J failed: %v %s", err, out)
		}
		return
	}
	if err := os.Symlink(target, link); err != nil {
		t.Skipf("symlink: %v", err)
	}
}

func TestListDirectory_DirLinkIsDir(t *testing.T) {
	base := t.TempDir()
	real := filepath.Join(base, "real")
	os.MkdirAll(real, 0755)
	makeDirLink(t, real, filepath.Join(base, "link"))

	listing, err := newTestFM().ListDirectory(base)
	if err != nil {
		t.Fatal(err)
	}
	for _, f := range listing.Files {
		if f.Name == "link" && !f.IsDir {
			t.Error("a link to a directory should be listed as a directory")
		}
	}
}

func TestCopyItems_DirWithLinkedDirCopiesContents(t *testing.T) {
	base := t.TempDir()
	other := filepath.Join(base, "other")
	os.MkdirAll(other, 0755)
	os.WriteFile(filepath.Join(other, "in.txt"), []byte("linked"), 0644)
	src := filepath.Join(base, "src")
	os.MkdirAll(src, 0755)
	os.WriteFile(filepath.Join(src, "a.txt"), []byte("a"), 0644)
	makeDirLink(t, other, filepath.Join(src, "lnk"))

	dst := filepath.Join(base, "dst")
	os.MkdirAll(dst, 0755)
	if err := newTestFM().CopyItems([]string{src}, dst); err != nil {
		t.Fatalf("CopyItems: %v", err)
	}
	if data, _ := os.ReadFile(filepath.Join(dst, "src", "a.txt")); string(data) != "a" {
		t.Error("regular file should be copied")
	}
	if data, _ := os.ReadFile(filepath.Join(dst, "src", "lnk", "in.txt")); string(data) != "linked" {
		t.Error("linked directory contents should be copied")
	}
}

func TestCopyItems_LinkToAncestorRejected(t *testing.T) {
	base := t.TempDir()
	src := filepath.Join(base, "src")
	os.MkdirAll(src, 0755)
	makeDirLink(t, base, filepath.Join(src, "loop")) // 상위 폴더를 가리키는 링크 → 무한 복사 위험
	dst := filepath.Join(t.TempDir(), "dst")
	os.MkdirAll(dst, 0755)
	if err := newTestFM().CopyItems([]string{src}, dst); err == nil {
		t.Error("link pointing to an ancestor should be rejected")
	}
}
