package termapp

import (
	"strings"
	"testing"
)

// ─── Todo #130-2: 원격 이름 바꾸기가 다른 파일을 덮어쓰지 않게 (SCP의 mv, FTP의 RNTO는 덮어씀) ──

func TestFileRenameRefusesAnExistingName(t *testing.T) {
	a, fs := pickerApp(t, &fakePicker{})
	fs.files["/d/a.txt"] = []byte("A")
	fs.files["/d/b.txt"] = []byte("B")
	err := a.FileRename(1, "/d", "a.txt", "b.txt")
	if err == nil || !strings.Contains(err.Error(), "b.txt") {
		t.Fatalf("rename onto b.txt: %v", err)
	}
	if string(fs.files["/d/b.txt"]) != "B" {
		t.Fatal("b.txt changed")
	}
}

func TestFileRenameAllowsANewNameAndCaseOnly(t *testing.T) {
	a, fs := pickerApp(t, &fakePicker{})
	fs.files["/d/a.txt"] = []byte("A")
	if err := a.FileRename(1, "/d", "a.txt", "c.txt"); err != nil {
		t.Fatal(err)
	}
	if err := a.FileRename(1, "/d", "a.txt", "A.txt"); err != nil {
		t.Fatalf("case-only rename (a case-insensitive server may list both as one): %v", err)
	}
}
