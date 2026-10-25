//go:build windows

package main

import (
	"fmt"
	"syscall"
	"unsafe"
)

// Todo #72: cmd /c start는 파일명의 &, |, ^, %를 셸 구문으로 해석해 임의 명령이 실행될 수 있어
// ShellExecuteW를 직접 호출합니다. 작업 폴더(lpDirectory)는 파일이 있는 폴더로 지정합니다.
const swShowNormal = 1

// 테스트에서 대체할 수 있도록 변수로 둡니다.
var shellOpen = func(file, dir string) error {
	return shellExecute(file, "", dir)
}

// shellExecute: ShellExecuteW(file, 인자, 작업 폴더). 사용자 단추(Todo #133-12)도 같은 경로로 실행
func shellExecute(file, params, dir string) error {
	filePtr, err := syscall.UTF16PtrFromString(file)
	if err != nil {
		return err
	}
	dirPtr, err := syscall.UTF16PtrFromString(dir)
	if err != nil {
		return err
	}
	var paramsPtr uintptr
	if params != "" {
		pp, err := syscall.UTF16PtrFromString(params)
		if err != nil {
			return err
		}
		paramsPtr = uintptr(unsafe.Pointer(pp))
	}
	shellExecuteW := syscall.NewLazyDLL("shell32.dll").NewProc("ShellExecuteW")
	// lpOperation=NULL → 기본 동작(verb) 사용
	ret, _, _ := shellExecuteW.Call(
		0, 0,
		uintptr(unsafe.Pointer(filePtr)),
		paramsPtr,
		uintptr(unsafe.Pointer(dirPtr)),
		swShowNormal,
	)
	// 반환값이 32 이하이면 실패 (SE_ERR_*)
	if ret <= 32 {
		return fmt.Errorf("파일 열기 실패 (ShellExecute 코드 %d)", ret)
	}
	return nil
}
