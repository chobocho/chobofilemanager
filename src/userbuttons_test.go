package main

import (
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

// Todo #133-12: 사용자 단추 막대 — 저장/불러오기, 프로그램 실행

func TestUserButtons_SaveLoad(t *testing.T) {
	a := newTestApp(t)
	if got := a.GetUserButtons(); len(got) != 0 {
		t.Fatalf("empty at first: %+v", got)
	}
	btns := []UserButton{
		{ID: "1", Name: "메모장", Command: "notepad.exe", Params: "%F", StartDir: "%P"},
		{ID: "2", Name: "비교", Command: "@diff"},
	}
	if err := a.SaveUserButtons(btns); err != nil {
		t.Fatal(err)
	}
	if got := a.GetUserButtons(); !reflect.DeepEqual(got, btns) {
		t.Fatalf("got %+v", got)
	}
}

func TestUserButtons_CorruptFileIsBackedUp(t *testing.T) {
	a := newTestApp(t)
	dir, _ := a.resolvedConfigDir()
	os.MkdirAll(dir, 0755)
	p := filepath.Join(dir, "buttonbar.json")
	os.WriteFile(p, []byte("{broken"), 0644)
	if got := a.GetUserButtons(); len(got) != 0 {
		t.Fatalf("corrupt → empty, got %+v", got)
	}
	if err := a.SaveUserButtons([]UserButton{{ID: "x", Name: "x", Command: "x"}}); err != nil {
		t.Fatal(err)
	}
	if len(a.GetUserButtons()) != 1 {
		t.Fatal("saving after corrupt must work")
	}
}

func TestRunUserCommand(t *testing.T) {
	var got [3]string
	old := runProgram
	runProgram = func(cmd, params, dir string) error { got = [3]string{cmd, params, dir}; return nil }
	defer func() { runProgram = old }()
	a := newTestApp(t)
	dir := t.TempDir()
	if err := a.RunUserCommand("notepad.exe", `"C:\a b.txt"`, dir); err != nil {
		t.Fatal(err)
	}
	if got != [3]string{"notepad.exe", `"C:\a b.txt"`, dir} {
		t.Fatalf("got %v", got)
	}
	if err := a.RunUserCommand("  ", "", dir); err == nil {
		t.Fatal("empty command: want error")
	}
	// 시작 폴더가 없거나 FTP · 압축 안이면 홈 폴더에서
	a.RunUserCommand("x", "", "ftp://id/")
	if got[2] != a.fileManager.GetHomeDirectory() {
		t.Fatalf("ftp start dir → home, got %q", got[2])
	}
}

func TestSplitParams(t *testing.T) {
	cases := map[string][]string{
		``:                     nil,
		`a b`:                  {"a", "b"},
		`"a b" c`:              {"a b", "c"},
		`  x   "y z"  `:        {"x", "y z"},
		`-o="C:\x y\z" --flag`: {`-o=C:\x y\z`, "--flag"},
	}
	for in, want := range cases {
		if got := splitParams(in); !reflect.DeepEqual(got, want) {
			t.Errorf("splitParams(%q) = %q, want %q", in, got, want)
		}
	}
}
