package main

import (
	"bytes"
	"os"
	"testing"
)

// cmd.exe misparses LF-only batch files containing UTF-8 text: lines get
// split mid-command and goto labels are not found. build.bat must be CRLF.
func TestBuildBatUsesCRLF(t *testing.T) {
	data, err := os.ReadFile("../build.bat")
	if err != nil {
		t.Fatalf("read build.bat: %v", err)
	}
	lines := bytes.Split(data, []byte("\n"))
	for i, line := range lines[:len(lines)-1] {
		if !bytes.HasSuffix(line, []byte("\r")) {
			t.Fatalf("build.bat line %d ends with LF only; expected CRLF", i+1)
		}
	}
}
