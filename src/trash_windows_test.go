//go:build windows

package main

import "testing"

// ─── Todo #82: 휴지통이 없는 드라이브에서 조용히 영구 삭제되지 않도록 ─────────────

func TestTrashFlags_WarnBeforePermanentDelete(t *testing.T) {
	if trashFlags&fofWantNukeWarning == 0 {
		t.Error("FOF_WANTNUKEWARNING must be set so Windows asks before permanently deleting")
	}
	if trashFlags&fofAllowUndo == 0 {
		t.Error("FOF_ALLOWUNDO must be set to use the Recycle Bin")
	}
}
