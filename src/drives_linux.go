//go:build !windows

package main

import (
	"bufio"
	"os"
	"strings"
	"syscall"
)

func getLinuxMounts() []DriveInfo {
	file, err := os.Open("/proc/mounts")
	if err != nil {
		return []DriveInfo{{Name: "Root", Path: "/", DriveType: "local"}}
	}
	defer file.Close()

	var drives []DriveInfo
	seen := make(map[string]bool)
	scanner := bufio.NewScanner(file)

	for scanner.Scan() {
		line := scanner.Text()
		fields := strings.Fields(line)
		if len(fields) < 3 {
			continue
		}
		device := fields[0]
		mountPoint := fields[1]
		fsType := fields[2]

		skip := []string{"proc", "sysfs", "devpts", "tmpfs", "cgroup", "pstore", "debugfs", "securityfs", "fusectl", "hugetlbfs", "mqueue", "udev", "devtmpfs", "binfmt_misc", "configfs", "autofs"}
		shouldSkip := false
		for _, s := range skip {
			if fsType == s || strings.HasPrefix(device, "none") {
				shouldSkip = true
				break
			}
		}
		if shouldSkip {
			continue
		}

		if seen[mountPoint] {
			continue
		}
		seen[mountPoint] = true

		var stat syscall.Statfs_t
		var total, free int64
		if err := syscall.Statfs(mountPoint, &stat); err == nil {
			total = int64(stat.Blocks) * int64(stat.Bsize)
			free = int64(stat.Bfree) * int64(stat.Bsize)
		}

		drives = append(drives, DriveInfo{
			Name:       mountPoint,
			Path:       mountPoint,
			DriveType:  fsType,
			TotalSpace: total,
			FreeSpace:  free,
		})
	}

	if len(drives) == 0 {
		drives = append(drives, DriveInfo{Name: "Root", Path: "/", DriveType: "local"})
	}
	return drives
}

func getWindowsDrives() []DriveInfo {
	return []DriveInfo{}
}
