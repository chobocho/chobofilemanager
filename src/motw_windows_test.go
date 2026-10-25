//go:build windows

package main

import (
	"os"
	"path/filepath"
	"testing"
)

// Todo #134-2: 인터넷에서 받은 압축 파일(Zone.Identifier)에서 꺼낸 파일에도 같은 표시 — Office 보호된 보기 · SmartScreen이 그대로 동작
func TestArchive_PropagatesMarkOfTheWeb(t *testing.T) {
	dir := t.TempDir()
	z := makeSampleZip(t, dir)
	zone := []byte("[ZoneTransfer]\r\nZoneId=3\r\n")
	if err := os.WriteFile(z+":Zone.Identifier", zone, 0644); err != nil {
		t.Skipf("no alternate data streams here: %v", err)
	}
	fm := newTestFM()
	dest := t.TempDir()
	if err := fm.CopyItems([]string{filepath.Join(z, "top.txt"), filepath.Join(z, "docs")}, dest); err != nil {
		t.Fatal(err)
	}
	for _, p := range []string{filepath.Join(dest, "top.txt"), filepath.Join(dest, "docs", "img", "p.png")} {
		if b, err := os.ReadFile(p + ":Zone.Identifier"); err != nil || string(b) != string(zone) {
			t.Errorf("%s: zone = %q %v", p, b, err)
		}
	}
	opened, err := materializeArchiveFile(filepath.Join(z, "docs", "a.md"))
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(filepath.Dir(opened))
	if b, _ := os.ReadFile(opened + ":Zone.Identifier"); string(b) != string(zone) {
		t.Error("opened copy must carry the mark")
	}
	// 압축 풀기 단추(ZIP 경로)도
	out := t.TempDir()
	if err := fm.ExtractArchive(z, out); err != nil {
		t.Fatal(err)
	}
	if b, _ := os.ReadFile(filepath.Join(out, "s", "top.txt") + ":Zone.Identifier"); string(b) != string(zone) {
		t.Error("ExtractArchive must carry the mark")
	}
	// 표시 없는 압축 파일이면 아무것도 붙이지 않음
	z2 := filepath.Join(t.TempDir(), "plain.zip")
	b, _ := os.ReadFile(z)
	os.WriteFile(z2, b, 0644)
	dest2 := t.TempDir()
	fm.CopyItems([]string{filepath.Join(z2, "top.txt")}, dest2)
	if _, err := os.ReadFile(filepath.Join(dest2, "top.txt") + ":Zone.Identifier"); err == nil {
		t.Error("no mark on a local archive")
	}
}
