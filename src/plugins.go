package main

// 플러그인 (Ctrl+Shift+X, Todo #133-13): ~/.chobocho-commander/plugins/*.star — Starlark 스크립트.
// Total Commander의 DLL 플러그인 대신, 패널 정보와 파일 함수를 받아 실행하는 사용자 스크립트.
//
//   panel_path · target_path · cursor(없으면 None) · selected(고른 파일) · targets(고른 파일, 없으면 커서 파일)
//   read_text · write_text · list_dir · exists · is_dir · file_size · join_path · basename · dirname · mkdir · rename
//
// 무한 반복은 실행 단계·시간 제한으로 멈춤. 파일을 바꾸는 함수를 쓰면 끝난 뒤 패널을 새로 고침.

import (
	"bufio"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"go.starlark.net/starlark"
	"go.starlark.net/syntax"
)

type PluginInfo struct {
	File        string `json:"file"`
	Name        string `json:"name"`
	Description string `json:"description"`
}

type PluginContext struct {
	PanelPath  string   `json:"panelPath"`
	TargetPath string   `json:"targetPath"`
	Cursor     string   `json:"cursor"`
	Selected   []string `json:"selected"`
}

type PluginResult struct {
	Output  string `json:"output"`
	Error   string `json:"error"`
	Refresh bool   `json:"refresh"` // 파일을 바꿨으면 패널 새로 고침
}

const (
	pluginMaxSteps = 20_000_000
	pluginTimeout  = 15 * time.Second
)

// openFolder: 탐색기로 폴더 열기 (테스트에서 바꿈)
var openFolder = func(p string) error { return NewFileManager().OpenFile(p) }

func (a *App) pluginsDir() (string, error) {
	dir, err := a.resolvedConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "plugins"), nil
}

func (a *App) ListPlugins() []PluginInfo {
	dir, err := a.pluginsDir()
	if err != nil {
		return []PluginInfo{}
	}
	es, err := os.ReadDir(dir)
	if err != nil {
		return []PluginInfo{}
	}
	out := []PluginInfo{}
	for _, e := range es {
		if e.IsDir() || !strings.EqualFold(filepath.Ext(e.Name()), ".star") {
			continue
		}
		info := PluginInfo{File: e.Name(), Name: strings.TrimSuffix(e.Name(), filepath.Ext(e.Name()))}
		if f, err := os.Open(filepath.Join(dir, e.Name())); err == nil {
			sc := bufio.NewScanner(f)
			for i := 0; i < 10 && sc.Scan(); i++ {
				line := strings.TrimSpace(sc.Text())
				if v, ok := strings.CutPrefix(line, "# name:"); ok {
					info.Name = strings.TrimSpace(v)
				} else if v, ok := strings.CutPrefix(line, "# description:"); ok {
					info.Description = strings.TrimSpace(v)
				}
			}
			f.Close()
		}
		out = append(out, info)
	}
	sort.Slice(out, func(i, j int) bool { return strings.ToLower(out[i].File) < strings.ToLower(out[j].File) })
	return out
}

// OpenPluginsFolder: 폴더를 (처음이면 예제와 함께) 만들고 탐색기로 엶
func (a *App) OpenPluginsFolder() error {
	dir, err := a.pluginsDir()
	if err != nil {
		return err
	}
	if _, err := os.Stat(dir); os.IsNotExist(err) {
		if err := os.MkdirAll(dir, 0755); err != nil {
			return err
		}
		for name, body := range examplePlugins {
			os.WriteFile(filepath.Join(dir, name), []byte(body), 0644)
		}
	}
	return openFolder(dir)
}

func (a *App) RunPlugin(file string, ctx PluginContext) (PluginResult, error) {
	if file == "" || file != filepath.Base(file) || strings.ContainsAny(file, `/\`) || strings.Contains(file, "..") {
		return PluginResult{}, fmt.Errorf("잘못된 플러그인 이름: %q", file)
	}
	dir, err := a.pluginsDir()
	if err != nil {
		return PluginResult{}, err
	}
	p := filepath.Join(dir, file)
	src, err := os.ReadFile(p)
	if err != nil {
		return PluginResult{}, err
	}

	var res PluginResult
	var out strings.Builder
	thread := &starlark.Thread{
		Name:  file,
		Print: func(_ *starlark.Thread, msg string) { out.WriteString(msg); out.WriteByte('\n') },
	}
	thread.SetMaxExecutionSteps(pluginMaxSteps)
	timer := time.AfterFunc(pluginTimeout, func() { thread.Cancel("시간 초과") })
	defer timer.Stop()

	// 플러그인은 함수 없이 바로 쓰는 짧은 스크립트가 많아 맨 위의 for · while · if와 전역 다시 대입을 허용
	opts := &syntax.FileOptions{While: true, Recursion: true, TopLevelControl: true, GlobalReassign: true}
	_, execErr := starlark.ExecFileOptions(opts, thread, p, src, a.pluginGlobals(ctx, &res))
	res.Output = out.String()
	if execErr != nil {
		var evalErr *starlark.EvalError
		if errors.As(execErr, &evalErr) {
			res.Error = evalErr.Backtrace()
		} else {
			res.Error = execErr.Error()
		}
	}
	return res, nil
}

func (a *App) pluginGlobals(ctx PluginContext, res *PluginResult) starlark.StringDict {
	fm := a.fileManager
	strList := func(xs []string) *starlark.List {
		vs := make([]starlark.Value, len(xs))
		for i, x := range xs {
			vs[i] = starlark.String(x)
		}
		return starlark.NewList(vs)
	}
	targets := ctx.Selected
	if len(targets) == 0 && ctx.Cursor != "" {
		targets = []string{ctx.Cursor}
	}
	var cursor starlark.Value = starlark.None
	if ctx.Cursor != "" {
		cursor = starlark.String(ctx.Cursor)
	}
	str1 := func(name string, fn func(string) (starlark.Value, error)) *starlark.Builtin {
		return starlark.NewBuiltin(name, func(th *starlark.Thread, b *starlark.Builtin, args starlark.Tuple, kw []starlark.Tuple) (starlark.Value, error) {
			var s string
			if err := starlark.UnpackPositionalArgs(name, args, kw, 1, &s); err != nil {
				return nil, err
			}
			return fn(s)
		})
	}
	str2 := func(name string, changes bool, fn func(a, b string) error) *starlark.Builtin {
		return starlark.NewBuiltin(name, func(th *starlark.Thread, b *starlark.Builtin, args starlark.Tuple, kw []starlark.Tuple) (starlark.Value, error) {
			var x, y string
			if err := starlark.UnpackPositionalArgs(name, args, kw, 2, &x, &y); err != nil {
				return nil, err
			}
			if err := fn(x, y); err != nil {
				return nil, err
			}
			if changes {
				res.Refresh = true
			}
			return starlark.None, nil
		})
	}
	return starlark.StringDict{
		"panel_path":  starlark.String(ctx.PanelPath),
		"target_path": starlark.String(ctx.TargetPath),
		"cursor":      cursor,
		"selected":    strList(ctx.Selected),
		"targets":     strList(targets),
		"read_text": str1("read_text", func(p string) (starlark.Value, error) {
			s, err := fm.ReadTextFile(p)
			return starlark.String(s), err
		}),
		"write_text": str2("write_text", true, func(p, text string) error {
			return fm.WriteTextFileWithEncoding(p, text, "auto")
		}),
		"rename": str2("rename", true, func(o, n string) error { return fm.RenameItem(o, n) }),
		"mkdir": str1("mkdir", func(p string) (starlark.Value, error) {
			if err := fm.CreateDirectory(p); err != nil {
				return nil, err
			}
			res.Refresh = true
			return starlark.None, nil
		}),
		"list_dir": str1("list_dir", func(p string) (starlark.Value, error) {
			l, err := fm.ListDirectory(p)
			if err != nil {
				return nil, err
			}
			vs := make([]starlark.Value, 0, len(l.Files))
			for _, f := range l.Files {
				d := starlark.NewDict(4)
				d.SetKey(starlark.String("name"), starlark.String(f.Name))
				d.SetKey(starlark.String("path"), starlark.String(f.Path))
				d.SetKey(starlark.String("is_dir"), starlark.Bool(f.IsDir))
				d.SetKey(starlark.String("size"), starlark.MakeInt64(f.Size))
				vs = append(vs, d)
			}
			return starlark.NewList(vs), nil
		}),
		"exists": str1("exists", func(p string) (starlark.Value, error) {
			_, err := os.Stat(p)
			return starlark.Bool(err == nil), nil
		}),
		"is_dir": str1("is_dir", func(p string) (starlark.Value, error) {
			fi, err := os.Stat(p)
			return starlark.Bool(err == nil && fi.IsDir()), nil
		}),
		"file_size": str1("file_size", func(p string) (starlark.Value, error) {
			fi, err := os.Stat(p)
			if err != nil {
				return nil, err
			}
			return starlark.MakeInt64(fi.Size()), nil
		}),
		"basename": str1("basename", func(p string) (starlark.Value, error) { return starlark.String(filepath.Base(p)), nil }),
		"dirname":  str1("dirname", func(p string) (starlark.Value, error) { return starlark.String(filepath.Dir(p)), nil }),
		"join_path": starlark.NewBuiltin("join_path", func(th *starlark.Thread, b *starlark.Builtin, args starlark.Tuple, kw []starlark.Tuple) (starlark.Value, error) {
			parts := make([]string, len(args))
			for i, v := range args {
				s, ok := starlark.AsString(v)
				if !ok {
					return nil, fmt.Errorf("join_path: 글자만 받습니다")
				}
				parts[i] = s
			}
			return starlark.String(filepath.Join(parts...)), nil
		}),
	}
}

var examplePlugins = map[string]string{
	"line_count.star": `# name: 줄 수 세기
# description: 고른 파일(없으면 커서 파일)의 줄 수와 크기
total = 0
for p in targets:
    if is_dir(p):
        continue
    n = len(read_text(p).splitlines())
    total += n
    print("%s: %d 줄, %d 바이트" % (basename(p), n, file_size(p)))
print("합계 %d 줄" % total)
`,
	"file_list.star": `# name: 파일 목록 만들기
# description: 지금 폴더의 이름 목록을 filelist.txt로 저장
names = sorted([e["name"] + ("/" if e["is_dir"] else "") for e in list_dir(panel_path)])
out = join_path(panel_path, "filelist.txt")
write_text(out, "\n".join(names) + "\n")
print("%d개 → %s" % (len(names), out))
`,
}
