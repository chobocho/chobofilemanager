//go:build !windows

package main

import "fmt"

// Windows 외 플랫폼은 buildOpenCmd(xdg-open)를 사용합니다.
var shellOpen = func(file, dir string) error {
	return fmt.Errorf("shellOpen은 Windows에서만 지원됩니다")
}

func shellExecute(file, params, dir string) error {
	return fmt.Errorf("shellExecute는 Windows에서만 지원됩니다")
}
