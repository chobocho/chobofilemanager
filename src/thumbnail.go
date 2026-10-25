package main

// 썸네일 (Ctrl+Shift+F1 보기, Todo #133-11): 그림을 size×size 안으로 줄여 data URL로.
// 투명한 그림은 PNG, 나머지는 JPEG. 같은 파일(크기·시각)은 최근 것을 기억

import (
	"bytes"
	"encoding/base64"
	"fmt"
	"image"
	"image/jpeg"
	"image/png"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	_ "image/gif"

	"golang.org/x/image/draw"

	_ "golang.org/x/image/bmp"
	_ "golang.org/x/image/webp"
)

const thumbCacheMax = 300

type thumbKey struct {
	path string
	size int
	mod  time.Time
	len  int64
}

var (
	thumbMu    sync.Mutex
	thumbCache = map[thumbKey]string{}
	thumbOrder []thumbKey
)

func (fm *FileManager) ReadThumbnail(p string, size int) (string, error) {
	if size <= 0 || size > 512 {
		size = 96
	}
	key := thumbKey{path: p, size: size}
	if fi, err := os.Stat(p); err == nil {
		key.mod, key.len = fi.ModTime(), fi.Size()
	}
	thumbMu.Lock()
	if u, ok := thumbCache[key]; ok {
		thumbMu.Unlock()
		return u, nil
	}
	thumbMu.Unlock()

	data, err := readLimited(p) // 보통 파일 · 압축 파일 안 (32MB 제한)
	if err != nil {
		return "", err
	}
	var u string
	if strings.EqualFold(filepath.Ext(p), ".svg") {
		u = "data:image/svg+xml;base64," + base64.StdEncoding.EncodeToString(data)
	} else if u, err = thumbnailOf(data, size); err != nil {
		return "", fmt.Errorf("%s: %w", filepath.Base(p), err)
	}

	thumbMu.Lock()
	if len(thumbOrder) >= thumbCacheMax {
		delete(thumbCache, thumbOrder[0])
		thumbOrder = thumbOrder[1:]
	}
	thumbCache[key] = u
	thumbOrder = append(thumbOrder, key)
	thumbMu.Unlock()
	return u, nil
}

func thumbnailOf(data []byte, size int) (string, error) {
	src, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return "", err
	}
	b := src.Bounds()
	w, h := b.Dx(), b.Dy()
	if w == 0 || h == 0 {
		return "", fmt.Errorf("빈 그림")
	}
	// 긴 쪽을 size로 (작은 그림은 그대로)
	tw, th := w, h
	if w > size || h > size {
		if w >= h {
			tw, th = size, max(1, h*size/w)
		} else {
			tw, th = max(1, w*size/h), size
		}
	}
	dst := image.NewNRGBA(image.Rect(0, 0, tw, th))
	draw.CatmullRom.Scale(dst, dst.Bounds(), src, b, draw.Src, nil)

	var buf bytes.Buffer
	if hasAlpha(dst) {
		if err := png.Encode(&buf, dst); err != nil {
			return "", err
		}
		return "data:image/png;base64," + base64.StdEncoding.EncodeToString(buf.Bytes()), nil
	}
	if err := jpeg.Encode(&buf, dst, &jpeg.Options{Quality: 82}); err != nil {
		return "", err
	}
	return "data:image/jpeg;base64," + base64.StdEncoding.EncodeToString(buf.Bytes()), nil
}

func hasAlpha(img *image.NRGBA) bool {
	for i := 3; i < len(img.Pix); i += 4 {
		if img.Pix[i] != 0xff {
			return true
		}
	}
	return false
}
