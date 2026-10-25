// Package localshell runs a shell of this PC (cmd, PowerShell, WSL, bash...)
// in a pseudo console.
package localshell

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// LocalShell is a program on this PC that can run in a tab instead of a connection.
type LocalShell struct {
	Name  string `json:"name"`  // what goes in the Host field: "cmd", "powershell", "wsl", "bash"...
	Label string `json:"label"` // for the list: "명령 프롬프트 (cmd)"...
}

// Command returns the command line for a local shell named in the Host
// field ("cmd", "powershell", "wsl", "wsl -d Ubuntu", "pwsh.exe"...), or ok=false
// for anything else (a server).
func Command(host string) (cmdline string, ok bool) {
	return CommandIn(host, "")
}

// cmdPrompt is cmd's usual prompt ($P$G) that also reports the folder with
// OSC 9;9, as Windows Terminal suggests, so the terminal dock can open it in
// the file panel. A PROMPT the user set is kept.
const cmdPrompt = `/k prompt $E]9;9;$P$E\$P$G`

// CommandIn is Command for a shell started in dir ("" = home): WSL then
// starts there (in its Windows folder) instead of in ~.
func CommandIn(host, dir string) (cmdline string, ok bool) {
	name, args, _ := strings.Cut(strings.TrimSpace(host), " ")
	name = strings.TrimSuffix(strings.ToLower(name), ".exe")
	for _, s := range Shells {
		if s.Name != name {
			continue
		}
		exe := s.Exe
		if p, err := exec.LookPath(s.Exe); err == nil {
			exe = p
		}
		cmd := quoteArg(exe)
		if args = strings.TrimSpace(args); args == "" {
			args = s.args
			switch {
			case s.Name == "wsl" && dir != "":
				args = ""
			case s.Name == "cmd" && os.Getenv("PROMPT") == "":
				args = cmdPrompt
			}
		}
		if args != "" {
			cmd += " " + args
		}
		return cmd, true
	}
	return "", false
}

// Home is the folder local shells start in.
func Home() string {
	if home, err := os.UserHomeDir(); err == nil {
		return filepath.Clean(home)
	}
	return ""
}
