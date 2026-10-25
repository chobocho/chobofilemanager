//go:build windows

package localshell

import (
	"strings"
	"testing"
)

// ─── Todo #122/#124: local shells for the terminal dock ───────────────────────

func TestCmdReportsItsFolder(t *testing.T) {
	t.Setenv("PROMPT", "")
	cmd, ok := CommandIn("cmd", "")
	if !ok || !strings.HasSuffix(cmd, ` /k prompt $E]9;9;$P$E\$P$G`) {
		t.Fatalf("cmd = %q: it should report its folder (OSC 9;9) so the dock can follow it", cmd)
	}
}

func TestCmdKeepsTheUsersPrompt(t *testing.T) {
	t.Setenv("PROMPT", "$T $P$G")
	if cmd, _ := CommandIn("cmd", ""); strings.Contains(cmd, "prompt") {
		t.Fatalf("cmd = %q: a PROMPT the user set must stay", cmd)
	}
	t.Setenv("PROMPT", "")
	if cmd, _ := CommandIn("cmd /q", ""); strings.Contains(cmd, "prompt") {
		t.Fatalf("cmd = %q: arguments typed in the Host field replace the default ones", cmd)
	}
}

func TestWslStartsInTheGivenFolder(t *testing.T) {
	if cmd, _ := CommandIn("wsl", `C:\work`); strings.Contains(cmd, "--cd") {
		t.Fatalf("wsl with a folder = %q: it must start there, not in ~", cmd)
	}
	if cmd, _ := CommandIn("wsl", ""); !strings.HasSuffix(cmd, "--cd ~") {
		t.Fatalf("wsl without a folder = %q: it starts in ~ as before", cmd)
	}
	if cmd, _ := Command("powershell"); !strings.HasSuffix(cmd, "-NoLogo") {
		t.Fatalf("powershell = %q", cmd)
	}
}
