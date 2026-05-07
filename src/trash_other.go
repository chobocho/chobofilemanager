//go:build !windows

package main

import "fmt"

// 비-Windows 빌드에서는 휴지통(Recycle Bin) 이동을 지원하지 않습니다. (Todo #57)
// 실제 사용자가 Windows에서 동작하므로 stub만 제공.
func trashItems(paths []string) error {
	return fmt.Errorf("휴지통 이동은 현재 Windows에서만 지원됩니다")
}
