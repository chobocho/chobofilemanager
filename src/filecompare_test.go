package main

import (
	"os"
	"path/filepath"
	"testing"
)

// Todo #133-7: 파일 내용 비교 — 텍스트/바이너리 판별, 바이너리는 첫 차이 위치

func TestCompareFileBytes(t *testing.T) {
	d := t.TempDir()
	w := func(name string, b []byte) string {
		p := filepath.Join(d, name)
		os.WriteFile(p, b, 0644)
		return p
	}
	a := w("a.txt", []byte("hello\nworld\n"))
	b := w("b.txt", []byte("hello\nworld\n"))
	c := w("c.txt", []byte("hello\nWorld\n"))
	bin1 := w("x.bin", []byte{1, 2, 0, 4, 5})
	bin2 := w("y.bin", []byte{1, 2, 0, 9, 5, 6})
	fm := newTestFM()

	r, err := fm.CompareFileBytes(a, b)
	if err != nil || !r.Equal || r.Binary || r.FirstDiff != -1 {
		t.Fatalf("same text: %+v %v", r, err)
	}
	r, _ = fm.CompareFileBytes(a, c)
	if r.Equal || r.Binary || r.FirstDiff != 6 {
		t.Fatalf("different text: %+v", r)
	}
	r, _ = fm.CompareFileBytes(bin1, bin2)
	if r.Equal || !r.Binary || r.FirstDiff != 3 || r.SizeA != 5 || r.SizeB != 6 {
		t.Fatalf("binary: %+v", r)
	}
	r, _ = fm.CompareFileBytes(bin1, bin1)
	if !r.Equal || !r.Binary {
		t.Fatalf("same binary: %+v", r)
	}
	// 한쪽이 다른 쪽의 앞부분: 짧은 쪽 끝이 첫 차이
	short := w("s.bin", []byte{1, 2, 0})
	r, _ = fm.CompareFileBytes(short, bin1)
	if r.Equal || r.FirstDiff != 3 {
		t.Fatalf("prefix: %+v", r)
	}
	if _, err := fm.CompareFileBytes(a, filepath.Join(d, "nope")); err == nil {
		t.Fatal("missing: want error")
	}
}

func TestCompareFileBytes_InsideArchive(t *testing.T) {
	z := makeSampleZip(t, t.TempDir())
	local := filepath.Join(t.TempDir(), "top.txt")
	os.WriteFile(local, []byte("top"), 0644)
	r, err := newTestFM().CompareFileBytes(filepath.Join(z, "top.txt"), local)
	if err != nil || !r.Equal {
		t.Fatalf("archive vs local: %+v %v", r, err)
	}
}
