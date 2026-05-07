//go:build windows

package main

import (
	"fmt"
	"path/filepath"
	"syscall"
	"unsafe"
)

// Windows SHFileOperationW를 호출해 파일/폴더를 휴지통(Recycle Bin)으로 보냅니다. (Todo #57)
//
// 표준 라이브러리에 휴지통 API가 없어 shell32.dll을 직접 syscall로 호출합니다.
// pFrom은 더블-널-종단된 UTF-16 다중 경로 문자열이어야 합니다.

const (
	foDelete         = 0x0003
	fofAllowUndo     = 0x0040
	fofNoConfirmation = 0x0010
	fofNoErrorUI     = 0x0400
	fofSilent        = 0x0004
)

type shFileOpStructW struct {
	hwnd                  uintptr
	wFunc                 uint32
	pFrom                 *uint16
	pTo                   *uint16
	fFlags                uint16
	fAnyOperationsAborted uint32
	hNameMappings         uintptr
	lpszProgressTitle     *uint16
}

func trashItems(paths []string) error {
	if len(paths) == 0 {
		return nil
	}

	// 더블-널-종단 UTF-16 다중 경로 버퍼 구성. 각 경로는 절대 경로여야 휴지통이
	// 인식하므로 filepath.Abs로 정규화한다.
	var buf []uint16
	for _, p := range paths {
		abs, err := filepath.Abs(p)
		if err != nil {
			return fmt.Errorf("절대 경로 변환 실패 (%s): %w", p, err)
		}
		u, err := syscall.UTF16FromString(abs)
		if err != nil {
			return fmt.Errorf("UTF-16 변환 실패 (%s): %w", abs, err)
		}
		buf = append(buf, u...) // u는 이미 trailing NUL 포함
	}
	buf = append(buf, 0) // 마지막 경로의 NUL 다음에 한번 더 NUL → 더블 NUL 종단

	op := shFileOpStructW{
		wFunc:  foDelete,
		pFrom:  &buf[0],
		pTo:    nil,
		fFlags: fofAllowUndo | fofNoConfirmation | fofNoErrorUI | fofSilent,
	}

	shell32 := syscall.NewLazyDLL("shell32.dll")
	shFileOpW := shell32.NewProc("SHFileOperationW")
	ret, _, _ := shFileOpW.Call(uintptr(unsafe.Pointer(&op)))

	if ret != 0 {
		return fmt.Errorf("SHFileOperationW 반환 코드: 0x%X", ret)
	}
	if op.fAnyOperationsAborted != 0 {
		return fmt.Errorf("휴지통 이동이 사용자/시스템에 의해 중단되었습니다")
	}
	return nil
}
