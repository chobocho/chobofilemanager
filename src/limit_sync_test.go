package main

import (
	"os"
	"regexp"
	"testing"
)

// ─── Todo #114: 백엔드/프론트 뷰어 크기 제한 일치 (32MB) ──────────────────────

func TestViewerLimit_Is32MBAndMatchesFrontend(t *testing.T) {
	if maxViewerFileSize != 32*1024*1024 {
		t.Errorf("maxViewerFileSize = %d, want 32MB", maxViewerFileSize)
	}
	src, err := os.ReadFile("frontend/src/utils/fileTypes.js")
	if err != nil {
		t.Fatal(err)
	}
	if !regexp.MustCompile(`MAX_VIEWER_FILE_SIZE = 32 \* 1024 \* 1024`).Match(src) {
		t.Error("frontend MAX_VIEWER_FILE_SIZE must also be 32MB")
	}
}
