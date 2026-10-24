//go:build !windows

package osutil

import (
	"totalcmd/internal/config"
)

const WindowClass = "ChobochoCommanderWindow"

func CurrentWindowState() (config.WindowState, bool) { return config.WindowState{}, false }

func RestoreWindowBounds(config.WindowState) bool { return false }
