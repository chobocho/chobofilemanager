package main

// 연결 프로그램으로 열기, 셸 명령, 명령 창 (Todo #132-3)

import (
	"fmt"
	"os/exec"
	"path/filepath"
	"runtime"
)

// buildOpenCmd: Linux용 열기 명령. Windows는 셸 구문 해석을 피하기 위해 ShellExecuteW 사용 (Todo #72).
func buildOpenCmd(path string) (*exec.Cmd, error) {
	dir := filepath.Dir(path)
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "linux":
		cmd = exec.Command("xdg-open", path)
	default:
		return nil, fmt.Errorf("unsupported OS")
	}
	cmd.Dir = dir
	return cmd, nil
}

func (fm *FileManager) OpenFile(path string) error {
	// 압축 파일 안의 파일은 임시 폴더로 풀어서 연다 (Todo #133-5)
	path, err := materializeArchiveFile(path)
	if err != nil {
		return err
	}
	if runtime.GOOS == "windows" {
		return shellOpen(path, filepath.Dir(path))
	}
	cmd, err := buildOpenCmd(path)
	if err != nil {
		return err
	}
	return cmd.Start()
}

func (fm *FileManager) RunShellCommand(command, workDir string) (string, error) {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		cmd = exec.Command("cmd", "/c", command)
	default:
		cmd = exec.Command("bash", "-c", command)
	}
	cmd.Dir = workDir
	output, err := cmd.CombinedOutput()
	return decodeShellOutput(output), err
}

func (fm *FileManager) OpenCmdWindow(workDir string) error {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		cmd = exec.Command("cmd", "/c", "start", "cmd.exe")
	default:
		cmd = exec.Command("x-terminal-emulator")
	}
	cmd.Dir = workDir
	return cmd.Start()
}
