//go:build windows

package main

import (
	"syscall"
	"unsafe"
)

func getWindowsDrives() []DriveInfo {
	kernel32 := syscall.NewLazyDLL("kernel32.dll")
	getLogicalDrives := kernel32.NewProc("GetLogicalDrives")
	getDiskFreeSpaceEx := kernel32.NewProc("GetDiskFreeSpaceExW")

	ret, _, _ := getLogicalDrives.Call()
	drives := make([]DriveInfo, 0)

	for i := 0; i < 26; i++ {
		if ret&(1<<uint(i)) != 0 {
			driveLetter := string(rune('A'+i)) + ":\\"
			var freeBytesAvailable, totalBytes, totalFreeBytes int64
			ptr, _ := syscall.UTF16PtrFromString(driveLetter)
			getDiskFreeSpaceEx.Call(
				uintptr(unsafe.Pointer(ptr)),
				uintptr(unsafe.Pointer(&freeBytesAvailable)),
				uintptr(unsafe.Pointer(&totalBytes)),
				uintptr(unsafe.Pointer(&totalFreeBytes)),
			)
			drives = append(drives, DriveInfo{
				Name:       driveLetter,
				Path:       driveLetter,
				DriveType:  "local",
				TotalSpace: totalBytes,
				FreeSpace:  totalFreeBytes,
			})
		}
	}
	return drives
}

func getLinuxMounts() []DriveInfo {
	return []DriveInfo{}
}
