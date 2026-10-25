package main

import (
	"bytes"
	"encoding/base64"
	"image"
	"image/color"
	"image/gif"
	"image/jpeg"
	"image/png"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// Todo #133-11: 썸네일 보기 — Go가 줄인 그림을 data URL로

func writeImage(t *testing.T, p string, w, h int, alpha bool) {
	t.Helper()
	img := image.NewNRGBA(image.Rect(0, 0, w, h))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			a := uint8(255)
			if alpha && x < w/2 {
				a = 0
			}
			img.Set(x, y, color.NRGBA{uint8(x), uint8(y), 128, a})
		}
	}
	var buf bytes.Buffer
	switch filepath.Ext(p) {
	case ".png":
		png.Encode(&buf, img)
	case ".jpg":
		jpeg.Encode(&buf, img, nil)
	case ".gif":
		gif.Encode(&buf, img, nil)
	}
	if err := os.WriteFile(p, buf.Bytes(), 0644); err != nil {
		t.Fatal(err)
	}
}

func decodeDataURL(t *testing.T, u string) (image.Image, string) {
	t.Helper()
	head, b64, ok := strings.Cut(u, ";base64,")
	if !ok {
		t.Fatalf("not a data URL: %.40s", u)
	}
	raw, err := base64.StdEncoding.DecodeString(b64)
	if err != nil {
		t.Fatal(err)
	}
	img, _, err := image.Decode(bytes.NewReader(raw))
	if err != nil {
		t.Fatalf("decode: %v", err)
	}
	return img, strings.TrimPrefix(head, "data:")
}

func TestReadThumbnail_ScalesKeepingAspect(t *testing.T) {
	d := t.TempDir()
	fm := newTestFM()
	cases := []struct {
		name         string
		w, h         int
		alpha        bool
		wantW, wantH int
		wantMime     string
	}{
		{"wide.jpg", 400, 200, false, 96, 48, "image/jpeg"},
		{"tall.png", 100, 300, false, 32, 96, "image/jpeg"},
		{"alpha.png", 200, 200, true, 96, 96, "image/png"}, // 투명하면 PNG
		{"small.gif", 40, 20, false, 40, 20, "image/jpeg"}, // 작은 그림은 키우지 않음
	}
	for _, c := range cases {
		p := filepath.Join(d, c.name)
		writeImage(t, p, c.w, c.h, c.alpha)
		u, err := fm.ReadThumbnail(p, 96)
		if err != nil {
			t.Fatalf("%s: %v", c.name, err)
		}
		img, mime := decodeDataURL(t, u)
		if b := img.Bounds(); b.Dx() != c.wantW || b.Dy() != c.wantH || mime != c.wantMime {
			t.Errorf("%s: %dx%d %s, want %dx%d %s", c.name, b.Dx(), b.Dy(), mime, c.wantW, c.wantH, c.wantMime)
		}
	}
}

func TestReadThumbnail_SVGAndErrors(t *testing.T) {
	d := t.TempDir()
	svg := filepath.Join(d, "a.svg")
	os.WriteFile(svg, []byte(`<svg xmlns="http://www.w3.org/2000/svg"/>`), 0644)
	u, err := newTestFM().ReadThumbnail(svg, 96)
	if err != nil || !strings.HasPrefix(u, "data:image/svg+xml;base64,") {
		t.Fatalf("svg = %.40s %v", u, err)
	}
	bad := filepath.Join(d, "x.png")
	os.WriteFile(bad, []byte("not an image"), 0644)
	if _, err := newTestFM().ReadThumbnail(bad, 96); err == nil {
		t.Fatal("broken image: want error")
	}
	if _, err := newTestFM().ReadThumbnail(filepath.Join(d, "nope.png"), 96); err == nil {
		t.Fatal("missing: want error")
	}
}

func TestReadThumbnail_CachesUntilFileChanges(t *testing.T) {
	p := filepath.Join(t.TempDir(), "c.png")
	writeImage(t, p, 200, 100, false)
	fm := newTestFM()
	a, _ := fm.ReadThumbnail(p, 64)
	b, _ := fm.ReadThumbnail(p, 64)
	if a != b {
		t.Fatal("same file: same thumbnail")
	}
	writeImage(t, p, 100, 200, false) // 크기가 달라짐 → 새로 만듦
	c, _ := fm.ReadThumbnail(p, 64)
	img, _ := decodeDataURL(t, c)
	if img.Bounds().Dy() != 64 || img.Bounds().Dx() != 32 {
		t.Fatalf("after change: %v", img.Bounds())
	}
}

func TestReadThumbnail_InsideArchive(t *testing.T) {
	d := t.TempDir()
	p := filepath.Join(d, "p.png")
	writeImage(t, p, 50, 50, false)
	z := filepath.Join(d, "imgs.zip")
	if err := newTestFM().CompressItems([]string{p}, z); err != nil {
		t.Fatal(err)
	}
	u, err := newTestFM().ReadThumbnail(filepath.Join(z, "p.png"), 32)
	if err != nil {
		t.Fatal(err)
	}
	if img, _ := decodeDataURL(t, u); img.Bounds().Dx() != 32 {
		t.Fatalf("bounds = %v", img.Bounds())
	}
}

// Todo #134-2: 픽셀 수가 너무 많은 그림은 풀기 전에 거부 (작은 파일이 거대한 크기를 선언하면 메모리 폭주)
func TestReadThumbnail_RejectsHugeDimensions(t *testing.T) {
	old := maxThumbPixels
	maxThumbPixels = 100
	defer func() { maxThumbPixels = old }()
	p := filepath.Join(t.TempDir(), "big.png")
	writeImage(t, p, 20, 20, false)
	if _, err := newTestFM().ReadThumbnail(p, 96); err == nil || !strings.Contains(err.Error(), "너무 큰") {
		t.Fatalf("want too-large error, got %v", err)
	}
}
