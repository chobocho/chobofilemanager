//go:build windows

package main

import (
	"archive/tar"
	"archive/zip"
	"bytes"
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

// Todo #135: 압축 풀기가 도중에 실패해도(안전하지 않은 경로 항목 등) 이미 꺼낸 파일에는 표시를 붙임 —
// 위험한 압축 파일일수록 오류가 나므로, 오류 경로에서 표시가 빠지면 보호가 가장 필요한 파일이 맨몸으로 남음
func TestArchive_MarkOfTheWebOnPartialExtract(t *testing.T) {
	base := t.TempDir()
	zp := filepath.Join(base, "m.zip")
	zf, _ := os.Create(zp)
	w := zip.NewWriter(zf)
	fw, _ := w.Create("evil.exe")
	fw.Write([]byte("MZ"))
	fw, _ = w.Create("../escape.txt")
	fw.Write([]byte("x"))
	w.Close()
	zf.Close()
	zone := []byte("[ZoneTransfer]\r\nZoneId=3\r\n")
	if err := os.WriteFile(zp+":Zone.Identifier", zone, 0644); err != nil {
		t.Skipf("no alternate data streams here: %v", err)
	}
	out := t.TempDir()
	if err := newTestFM().ExtractArchive(zp, out); err == nil {
		t.Fatal("unsafe entry must be reported")
	}
	if b, err := os.ReadFile(filepath.Join(out, "m", "evil.exe") + ":Zone.Identifier"); err != nil || string(b) != string(zone) {
		t.Errorf("partially extracted file lost the mark: %q %v", b, err)
	}
}

// Todo #135: 압축 안에서 F5 복사(internal/archive, TAR) — 뒤 항목 쓰기가 실패해도 먼저 꺼낸 항목엔 표시
func TestArchive_MarkOfTheWebOnPartialCopyOut(t *testing.T) {
	base := t.TempDir()
	tp := filepath.Join(base, "t.tar")
	var buf bytes.Buffer
	tw := tar.NewWriter(&buf)
	for _, f := range []struct{ name, body string }{{"d/ok.txt", "fine"}, {"d/blocked.txt", "zz"}} {
		tw.WriteHeader(&tar.Header{Name: f.name, Mode: 0644, Size: int64(len(f.body)), Typeflag: tar.TypeReg})
		tw.Write([]byte(f.body))
	}
	tw.Close()
	os.WriteFile(tp, buf.Bytes(), 0644)
	zone := []byte("[ZoneTransfer]\r\nZoneId=3\r\n")
	if err := os.WriteFile(tp+":Zone.Identifier", zone, 0644); err != nil {
		t.Skipf("no alternate data streams here: %v", err)
	}
	dest := t.TempDir()
	os.MkdirAll(filepath.Join(dest, "d", "blocked.txt"), 0755) // 같은 이름의 폴더 → 이 파일 쓰기만 실패
	if err := newTestFM().CopyItems([]string{filepath.Join(tp, "d")}, dest); err == nil {
		t.Fatal("blocked entry must fail the copy")
	}
	if b, err := os.ReadFile(filepath.Join(dest, "d", "ok.txt") + ":Zone.Identifier"); err != nil || string(b) != string(zone) {
		t.Errorf("partially copied file lost the mark: %q %v", b, err)
	}
}
