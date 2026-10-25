package main

import (
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"
)

// Todo #133-8: FTP를 패널에서 — "ftp://<연결>/경로"를 App이 FTPManager로 보냄

func ftpPanelFixture(t *testing.T) (*App, *fakeFTPServer, string) {
	t.Helper()
	srv := startFakeFTP(t)
	srv.listings = map[string][]string{
		"/": {
			"-rw-r--r-- 1 u g 5 Jan 01 10:00 a.txt",
			"drwxr-xr-x 1 u g 0 Jan 01 10:00 sub",
		},
		"/sub": {
			"-rw-r--r-- 1 u g 3 Jan 01 10:00 b.txt",
			"drwxr-xr-x 1 u g 0 Jan 01 10:00 deep",
		},
		"/sub/deep": {
			"-rw-r--r-- 1 u g 2 Jan 01 10:00 c.txt",
		},
	}
	srv.files = map[string][]byte{"/a.txt": []byte("hello"), "/sub/b.txt": []byte("bbb"), "/sub/deep/c.txt": []byte("cc")}
	a := newTestApp(t)
	id, err := a.FTPConnect(srv.config())
	if err != nil {
		t.Fatal(err)
	}
	return a, srv, id
}

func ftpNames(l *DirectoryListing) string {
	var ns []string
	for _, f := range l.Files {
		ns = append(ns, f.Name+"="+f.Path)
	}
	sort.Strings(ns)
	return strings.Join(ns, " ")
}

func TestFTPPath_ParseAndParent(t *testing.T) {
	for in, want := range map[string][2]string{
		"ftp://id/":        {"id", "/"},
		"ftp://id":         {"id", "/"},
		"ftp://id/pub/x":   {"id", "/pub/x"},
		"ftp://id/pub/../": {"id", "/"},
	} {
		id, remote, ok := parseFTPPath(in)
		if !ok || id != want[0] || remote != want[1] {
			t.Errorf("parse(%s) = %s %s %v", in, id, remote, ok)
		}
	}
	if _, _, ok := parseFTPPath(`C:\x`); ok {
		t.Error("local path is not ftp")
	}
	a := newTestApp(t)
	if p := a.GetParentPath("ftp://id/pub/x"); p != "ftp://id/pub" {
		t.Errorf("parent = %s", p)
	}
	if p := a.GetParentPath("ftp://id/pub"); p != "ftp://id/" {
		t.Errorf("parent = %s", p)
	}
	if p := a.GetParentPath("ftp://id/"); p != "ftp://id/" {
		t.Errorf("root parent = %s", p)
	}
}

func TestFTPPanel_List(t *testing.T) {
	a, _, id := ftpPanelFixture(t)
	root, err := a.ListDirectory("ftp://" + id + "/")
	if err != nil {
		t.Fatal(err)
	}
	if root.Path != "ftp://"+id+"/" || ftpNames(root) != "a.txt=ftp://"+id+"/a.txt sub=ftp://"+id+"/sub" {
		t.Fatalf("root = %s %s", root.Path, ftpNames(root))
	}
	sub, err := a.ListDirectory("ftp://" + id + "/sub")
	if err != nil || sub.Path != "ftp://"+id+"/sub" || !strings.Contains(ftpNames(sub), "b.txt=ftp://"+id+"/sub/b.txt") {
		t.Fatalf("sub = %+v %v", sub, err)
	}
	if _, err := a.ListDirectory("ftp://nope/"); err == nil {
		t.Fatal("unknown connection: want error")
	}
}

func TestFTPPanel_DownloadFilesAndFolders(t *testing.T) {
	a, _, id := ftpPanelFixture(t)
	dest := t.TempDir()
	if err := a.CopyItems([]string{"ftp://" + id + "/a.txt", "ftp://" + id + "/sub"}, dest); err != nil {
		t.Fatal(err)
	}
	for rel, want := range map[string]string{"a.txt": "hello", "sub/b.txt": "bbb", "sub/deep/c.txt": "cc"} {
		if b, _ := os.ReadFile(filepath.Join(dest, filepath.FromSlash(rel))); string(b) != want {
			t.Fatalf("%s = %q", rel, b)
		}
	}
	// 받기 충돌: 로컬 이름 기준
	cs := a.CheckCopyConflicts([]string{"ftp://" + id + "/a.txt"}, dest)
	if len(cs) != 1 {
		t.Fatalf("conflicts = %+v", cs)
	}
	os.WriteFile(filepath.Join(dest, "a.txt"), []byte("mine"), 0644)
	a.CopyItemsSkipConflicts([]string{"ftp://" + id + "/a.txt"}, dest)
	if b, _ := os.ReadFile(filepath.Join(dest, "a.txt")); string(b) != "mine" {
		t.Fatal("skip")
	}
	a.CopyItemsRename([]string{"ftp://" + id + "/a.txt"}, dest)
	if b, _ := os.ReadFile(filepath.Join(dest, "a (1).txt")); string(b) != "hello" {
		t.Fatal("rename")
	}
}

func TestFTPPanel_UploadFilesAndFolders(t *testing.T) {
	a, srv, id := ftpPanelFixture(t)
	src := t.TempDir()
	os.WriteFile(filepath.Join(src, "l.txt"), []byte("L"), 0644)
	os.MkdirAll(filepath.Join(src, "d", "e"), 0755)
	os.WriteFile(filepath.Join(src, "d", "e", "x.bin"), []byte("X"), 0644)
	if err := a.CopyItems([]string{filepath.Join(src, "l.txt"), filepath.Join(src, "d")}, "ftp://"+id+"/sub"); err != nil {
		t.Fatal(err)
	}
	if string(srv.stored["/sub/l.txt"]) != "L" || string(srv.stored["/sub/d/e/x.bin"]) != "X" {
		t.Fatalf("stored = %v", srv.stored)
	}
	if !contains(srv.made, "/sub/d") || !contains(srv.made, "/sub/d/e") {
		t.Fatalf("made = %v", srv.made)
	}
	// 올리기 충돌: 원격 이름 기준, 건너뛰기 / 이름 바꾸기
	os.WriteFile(filepath.Join(src, "a.txt"), []byte("A"), 0644)
	if cs := a.CheckCopyConflicts([]string{filepath.Join(src, "a.txt")}, "ftp://"+id+"/"); len(cs) != 1 {
		t.Fatalf("conflicts = %+v", cs)
	}
	a.CopyItemsSkipConflicts([]string{filepath.Join(src, "a.txt")}, "ftp://"+id+"/")
	if _, ok := srv.stored["/a.txt"]; ok {
		t.Fatal("skip must not upload")
	}
	a.CopyItemsRename([]string{filepath.Join(src, "a.txt")}, "ftp://"+id+"/")
	if string(srv.stored["/a (1).txt"]) != "A" {
		t.Fatalf("rename upload: %v", srv.stored)
	}
}

func contains(xs []string, x string) bool {
	for _, v := range xs {
		if v == x {
			return true
		}
	}
	return false
}

func TestFTPPanel_EditDeleteCreate(t *testing.T) {
	a, srv, id := ftpPanelFixture(t)
	if s, err := a.ReadTextFile("ftp://" + id + "/a.txt"); err != nil || s != "hello" {
		t.Fatalf("read = %q %v", s, err)
	}
	if err := a.WriteTextFileWithEncoding("ftp://"+id+"/a.txt", "changed", "auto"); err != nil {
		t.Fatal(err)
	}
	if string(srv.stored["/a.txt"]) != "changed" {
		t.Fatalf("write = %q", srv.stored["/a.txt"])
	}
	if err := a.CreateDirectory("ftp://" + id + "/newdir"); err != nil || !contains(srv.made, "/newdir") {
		t.Fatalf("mkdir: %v %v", err, srv.made)
	}
	if err := a.CreateFile("ftp://" + id + "/new.txt"); err != nil {
		t.Fatal(err)
	}
	if b, ok := srv.stored["/new.txt"]; !ok || len(b) != 0 {
		t.Fatal("empty file upload")
	}
	if err := a.CreateFile("ftp://" + id + "/a.txt"); err == nil {
		t.Fatal("existing name: want error")
	}
	if err := a.DeleteItems([]string{"ftp://" + id + "/a.txt"}); err != nil || !contains(srv.deleted, "/a.txt") {
		t.Fatalf("delete file: %v %v", err, srv.deleted)
	}
	if err := a.DeleteItems([]string{"ftp://" + id + "/sub"}); err != nil || !contains(srv.removed, "/sub") && !contains(srv.removed, "sub") {
		t.Fatalf("delete folder: %v removed=%v", err, srv.removed)
	}
	if err := a.TrashItems([]string{"ftp://" + id + "/a.txt"}); err == nil || !strings.Contains(err.Error(), "휴지통") {
		t.Fatalf("trash on ftp: %v", err)
	}
	if r, err := a.DirSize("ftp://" + id + "/sub"); err != nil || r.Size != 5 || r.Files != 2 || r.Dirs != 1 {
		t.Fatalf("dirsize = %+v %v", r, err)
	}
}

func TestFTPPanel_MoveAndRename(t *testing.T) {
	a, srv, id := ftpPanelFixture(t)
	var renamed []string
	srv.handler = func(cmd, arg string) string {
		switch cmd {
		case "RNFR":
			renamed = append(renamed, arg)
			return "350 ready"
		case "RNTO":
			renamed = append(renamed, arg)
			return "250 ok"
		}
		return ""
	}
	dest := t.TempDir()
	if err := a.MoveItems([]string{"ftp://" + id + "/a.txt"}, dest); err != nil {
		t.Fatal(err)
	}
	if b, _ := os.ReadFile(filepath.Join(dest, "a.txt")); string(b) != "hello" || !contains(srv.deleted, "/a.txt") {
		t.Fatal("move down = download + delete")
	}
	local := filepath.Join(dest, "up.txt")
	os.WriteFile(local, []byte("U"), 0644)
	if err := a.MoveItems([]string{local}, "ftp://"+id+"/"); err != nil {
		t.Fatal(err)
	}
	if string(srv.stored["/up.txt"]) != "U" {
		t.Fatal("move up uploads")
	}
	if _, err := os.Stat(local); err == nil {
		t.Fatal("move up removes the local file")
	}
	if err := a.RenameItem("ftp://"+id+"/sub/b.txt", "ftp://"+id+"/sub/z.txt"); err != nil {
		t.Fatal(err)
	}
	if strings.Join(renamed, ",") != "/sub/b.txt,/sub/z.txt" {
		t.Fatalf("renamed = %v", renamed)
	}
	if err := a.CopyItems([]string{"ftp://" + id + "/a.txt"}, "ftp://"+id+"/sub"); err == nil {
		t.Fatal("ftp → ftp copy: want error")
	}
}
