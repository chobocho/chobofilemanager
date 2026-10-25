package main

// 사용자 단추 막대 (Todo #133-12, Total Commander의 button bar): 단추 = 이름 + 명령 + 인자 + 시작 폴더.
// %P %T %N %F %S 같은 자리 표시는 프론트가 바꿔서 넘김. "@"로 시작하는 명령은 앱 안의 기능(프론트가 처리)

import (
	"encoding/json"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"

	"totalcmd/internal/atomicfile"
)

type UserButton struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Command  string `json:"command"`
	Params   string `json:"params,omitempty"`
	StartDir string `json:"startDir,omitempty"`
	Icon     string `json:"icon,omitempty"`
}

func (a *App) userButtonsPath() (string, error) {
	dir, err := a.resolvedConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "buttonbar.json"), nil
}

func (a *App) GetUserButtons() []UserButton {
	p, err := a.userButtonsPath()
	if err != nil {
		return []UserButton{}
	}
	data, err := os.ReadFile(p)
	if err != nil {
		return []UserButton{}
	}
	var btns []UserButton
	if err := json.Unmarshal(data, &btns); err != nil {
		atomicfile.BackupCorrupt(p)
		return []UserButton{}
	}
	return btns
}

func (a *App) SaveUserButtons(btns []UserButton) error {
	p, err := a.userButtonsPath()
	if err != nil {
		return err
	}
	if btns == nil {
		btns = []UserButton{}
	}
	data, err := json.MarshalIndent(btns, "", "  ")
	if err != nil {
		return err
	}
	return atomicfile.WriteCreatingDir(p, data, 0644)
}

// RunUserCommand: 단추의 프로그램을 시작 (기다리지 않음). 시작 폴더가 이 PC의 폴더가 아니면 홈 폴더
func (a *App) RunUserCommand(command, params, dir string) error {
	command = strings.TrimSpace(command)
	if command == "" {
		return errors.New("실행할 명령이 없습니다")
	}
	if fi, err := os.Stat(dir); dir == "" || err != nil || !fi.IsDir() {
		dir = a.fileManager.GetHomeDirectory()
	}
	return runProgram(command, params, dir)
}

// runProgram: Windows는 ShellExecute(프로그램 · 문서 · URL 모두, 셸 구문 해석 없음), 그 밖에는 인자를 나눠 바로 실행.
// 테스트에서 바꿀 수 있게 변수
var runProgram = func(command, params, dir string) error {
	if runtime.GOOS == "windows" {
		return shellExecute(command, params, dir)
	}
	cmd := exec.Command(command, splitParams(params)...)
	cmd.Dir = dir
	return cmd.Start()
}

// splitParams: 공백으로 나누되 큰따옴표 안은 한 덩어리 (따옴표는 뺌)
func splitParams(s string) []string {
	var out []string
	var cur strings.Builder
	inQuote, has := false, false
	for _, r := range s {
		switch {
		case r == '"':
			inQuote = !inQuote
			has = true
		case (r == ' ' || r == '\t') && !inQuote:
			if has {
				out = append(out, cur.String())
				cur.Reset()
				has = false
			}
		default:
			cur.WriteRune(r)
			has = true
		}
	}
	if has {
		out = append(out, cur.String())
	}
	return out
}
