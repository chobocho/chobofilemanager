package main

import (
	"os"
	"os/user"
	"path/filepath"
	"testing"
)

// ─── Todo #137-2: chmod · chown (실제 리눅스에서 — WSL) ────────────────────────

func permOf(t *testing.T, p string) uint32 {
	t.Helper()
	fi, err := os.Lstat(p)
	if err != nil {
		t.Fatal(err)
	}
	return unixPerm(fi.Mode())
}

func TestChangeMode_OnlyChangedBits(t *testing.T) {
	base := t.TempDir()
	a, b := filepath.Join(base, "a"), filepath.Join(base, "b")
	os.WriteFile(a, nil, 0644)
	os.WriteFile(b, nil, 0600)
	os.Chmod(a, 0644)
	os.Chmod(b, 0600)
	// 소유자 실행 켜고 기타 읽기 끄기 — 나머지 비트는 파일마다 그대로
	if err := newTestFM().ChangeMode([]string{a, b}, 0100, 0004, false); err != nil {
		t.Fatal(err)
	}
	if got := permOf(t, a); got != 0740 {
		t.Errorf("a = %o, want 740", got)
	}
	if got := permOf(t, b); got != 0700 {
		t.Errorf("b = %o, want 700", got)
	}
}

func TestChangeMode_SpecialBits(t *testing.T) {
	d := filepath.Join(t.TempDir(), "d")
	os.Mkdir(d, 0755)
	if err := newTestFM().ChangeMode([]string{d}, 01000|02000, 0, false); err != nil {
		t.Fatal(err)
	}
	if got := permOf(t, d); got != 03755 {
		t.Errorf("got %o, want 3755", got)
	}
}

func TestChangeMode_RecursiveRemovingDirAccess(t *testing.T) {
	base := t.TempDir()
	top := filepath.Join(base, "top")
	sub := filepath.Join(top, "sub")
	os.MkdirAll(sub, 0755)
	f := filepath.Join(sub, "f.txt")
	os.WriteFile(f, nil, 0644)
	outside := filepath.Join(base, "outside.txt")
	os.WriteFile(outside, nil, 0644)
	os.Chmod(outside, 0644)
	os.Symlink(outside, filepath.Join(sub, "link"))
	defer os.Chmod(top, 0755)
	defer os.Chmod(sub, 0755)

	// 모두에게서 실행 · 읽기를 빼도(들어갈 수 없게 돼도) 안까지 다 바뀜
	if err := newTestFM().ChangeMode([]string{top}, 0, 0555, true); err != nil {
		t.Fatal(err)
	}
	if got := permOf(t, top); got != 0200 {
		t.Errorf("top = %o, want 200", got)
	}
	os.Chmod(top, 0755)
	if got := permOf(t, sub); got != 0200 {
		t.Errorf("sub = %o, want 200", got)
	}
	os.Chmod(sub, 0755)
	if got := permOf(t, f); got != 0200 {
		t.Errorf("file = %o, want 200", got)
	}
	if got := permOf(t, outside); got != 0644 {
		t.Errorf("link target outside the tree must not change: %o", got)
	}
}

func TestChangeMode_NotRecursiveLeavesContents(t *testing.T) {
	top := filepath.Join(t.TempDir(), "top")
	os.Mkdir(top, 0755)
	f := filepath.Join(top, "f")
	os.WriteFile(f, nil, 0644)
	os.Chmod(f, 0644)
	if err := newTestFM().ChangeMode([]string{top}, 0, 0055, false); err != nil {
		t.Fatal(err)
	}
	if permOf(t, top) != 0700 || permOf(t, f) != 0644 {
		t.Errorf("top %o file %o", permOf(t, top), permOf(t, f))
	}
}

func TestChangeMode_ContinuesAfterError(t *testing.T) {
	base := t.TempDir()
	ok := filepath.Join(base, "ok")
	os.WriteFile(ok, nil, 0644)
	err := newTestFM().ChangeMode([]string{filepath.Join(base, "missing"), ok}, 0100, 0, false)
	if err == nil {
		t.Error("missing file must be reported")
	}
	if permOf(t, ok)&0100 == 0 {
		t.Error("the other file must still change")
	}
}

func TestChangeOwner_ToSelfByNameAndNumber(t *testing.T) {
	me, err := user.Current()
	if err != nil {
		t.Skip(err)
	}
	g, err := user.LookupGroupId(me.Gid)
	if err != nil {
		t.Skip(err)
	}
	top := filepath.Join(t.TempDir(), "top")
	os.Mkdir(top, 0755)
	os.WriteFile(filepath.Join(top, "f"), nil, 0644)
	os.Symlink("/nonexistent", filepath.Join(top, "broken"))
	// 내 소유 → 나: 권한 없이도 되는 chown. 안의 끊어진 링크도 오류 없이 (Lchown)
	if err := newTestFM().ChangeOwner([]string{top}, me.Username, g.Name, true); err != nil {
		t.Fatal(err)
	}
	if err := newTestFM().ChangeOwner([]string{top}, me.Uid, "", false); err != nil {
		t.Fatal(err)
	}
	l, _ := newTestFM().ListDirectory(top)
	for _, f := range l.Files {
		if f.Owner != me.Username || f.Group != g.Name {
			t.Errorf("%s: %s:%s", f.Name, f.Owner, f.Group)
		}
	}
}

func TestChangeOwner_UnknownNameRejected(t *testing.T) {
	p := filepath.Join(t.TempDir(), "f")
	os.WriteFile(p, nil, 0644)
	if err := newTestFM().ChangeOwner([]string{p}, "no-such-user-137", "", false); err == nil {
		t.Error("unknown user must be rejected")
	}
	if err := newTestFM().ChangeOwner([]string{p}, "", "no-such-group-137", false); err == nil {
		t.Error("unknown group must be rejected")
	}
}

func TestChangeOwner_ToOtherUserFailsWithoutRoot(t *testing.T) {
	if os.Geteuid() == 0 {
		t.Skip("root can chown")
	}
	p := filepath.Join(t.TempDir(), "f")
	os.WriteFile(p, nil, 0644)
	if err := newTestFM().ChangeOwner([]string{p}, "0", "", false); err == nil {
		t.Error("chown to root must fail for a normal user")
	}
}

func TestOwnerChoices_FromEtc(t *testing.T) {
	c := newTestFM().GetOwnerChoices()
	has := func(xs []string, x string) bool {
		for _, v := range xs {
			if v == x {
				return true
			}
		}
		return false
	}
	if !has(c.Users, "root") || !has(c.Groups, "root") {
		t.Errorf("root must be listed: %v / %v", c.Users, c.Groups)
	}
	p := filepath.Join(t.TempDir(), "passwd")
	os.WriteFile(p, []byte("# c\nzed:x:1:1::/:/bin/sh\n+nis\nann:x:2:2::/:/bin/sh\nann:x:2:2::/:/bin/sh\n"), 0644)
	if got := namesIn(p); len(got) != 2 || got[0] != "ann" || got[1] != "zed" {
		t.Errorf("namesIn = %v", got)
	}
}
