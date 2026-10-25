package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// Todo #133-13: 플러그인 — ~/.chobocho-commander/plugins/*.star (Starlark)

func writePlugin(t *testing.T, a *App, name, body string) {
	t.Helper()
	dir, err := a.pluginsDir()
	if err != nil {
		t.Fatal(err)
	}
	os.MkdirAll(dir, 0755)
	if err := os.WriteFile(filepath.Join(dir, name), []byte(body), 0644); err != nil {
		t.Fatal(err)
	}
}

func TestListPlugins_ReadsHeader(t *testing.T) {
	a := newTestApp(t)
	writePlugin(t, a, "count.star", "# name: 줄 수 세기\n# description: 고른 파일의 줄 수\nprint(1)\n")
	writePlugin(t, a, "plain.star", "print(2)\n")
	writePlugin(t, a, "notes.txt", "not a plugin")
	got := a.ListPlugins()
	if len(got) != 2 {
		t.Fatalf("got %+v", got)
	}
	if got[0].File != "count.star" || got[0].Name != "줄 수 세기" || got[0].Description != "고른 파일의 줄 수" {
		t.Fatalf("header: %+v", got[0])
	}
	if got[1].Name != "plain" || got[1].Description != "" {
		t.Fatalf("defaults: %+v", got[1])
	}
}

func TestRunPlugin_ContextAndBuiltins(t *testing.T) {
	a := newTestApp(t)
	work := t.TempDir()
	os.WriteFile(filepath.Join(work, "a.txt"), []byte("1\n2\n3\n"), 0644)
	os.Mkdir(filepath.Join(work, "sub"), 0755)
	writePlugin(t, a, "p.star", `
print("panel", basename(panel_path) != "")
for p in targets:
    print(basename(p), len(read_text(p).splitlines()))
names = sorted([e["name"] + ("/" if e["is_dir"] else "") for e in list_dir(panel_path)])
print(",".join(names))
out = join_path(panel_path, "out.txt")
write_text(out, "made")
print(exists(out), is_dir(join_path(panel_path, "sub")), file_size(out), dirname(out) == panel_path)
mkdir(join_path(panel_path, "newdir"))
rename(out, join_path(panel_path, "renamed.txt"))
`)
	res, err := a.RunPlugin("p.star", PluginContext{
		PanelPath: work, TargetPath: t.TempDir(), Cursor: filepath.Join(work, "a.txt"),
	})
	if err != nil {
		t.Fatal(err)
	}
	if res.Error != "" {
		t.Fatalf("plugin error: %s\n%s", res.Error, res.Output)
	}
	want := []string{"panel True", "a.txt 3", "a.txt,sub/", "True True 4 True"}
	for _, w := range want {
		if !strings.Contains(res.Output, w) {
			t.Fatalf("output missing %q:\n%s", w, res.Output)
		}
	}
	if !res.Refresh {
		t.Fatal("write_text / mkdir / rename → refresh")
	}
	if _, err := os.Stat(filepath.Join(work, "renamed.txt")); err != nil {
		t.Fatal("rename")
	}
	if fi, err := os.Stat(filepath.Join(work, "newdir")); err != nil || !fi.IsDir() {
		t.Fatal("mkdir")
	}
}

func TestRunPlugin_ErrorsAndLimits(t *testing.T) {
	a := newTestApp(t)
	work := t.TempDir()
	writePlugin(t, a, "bad.star", "print('before')\nfail('boom')\n")
	res, err := a.RunPlugin("bad.star", PluginContext{PanelPath: work})
	if err != nil || !strings.Contains(res.Error, "boom") || !strings.Contains(res.Output, "before") || res.Refresh {
		t.Fatalf("script error: %+v %v", res, err)
	}
	writePlugin(t, a, "loop.star", "while True:\n    pass\n")
	start := time.Now()
	res, _ = a.RunPlugin("loop.star", PluginContext{PanelPath: work})
	if res.Error == "" || time.Since(start) > 40*time.Second {
		t.Fatalf("endless loop must stop: %+v", res)
	}
	for _, f := range []string{"../x.star", `..\x.star`, "nope.star", "a/b.star"} {
		if _, err := a.RunPlugin(f, PluginContext{PanelPath: work}); err == nil {
			t.Errorf("%s: want error", f)
		}
	}
}

func TestPluginsFolder_ExamplesOnce(t *testing.T) {
	a := newTestApp(t)
	old := openFolder
	var opened string
	openFolder = func(p string) error { opened = p; return nil }
	defer func() { openFolder = old }()
	if err := a.OpenPluginsFolder(); err != nil {
		t.Fatal(err)
	}
	dir, _ := a.pluginsDir()
	if opened != dir {
		t.Fatalf("opened %q, want %q", opened, dir)
	}
	n := len(a.ListPlugins())
	if n < 2 {
		t.Fatalf("examples = %d", n)
	}
	os.Remove(filepath.Join(dir, a.ListPlugins()[0].File))
	a.OpenPluginsFolder() // 다시 열어도 지운 예제를 되살리지 않음
	if len(a.ListPlugins()) != n-1 {
		t.Fatal("examples are written only when the folder is created")
	}
	// 예제는 실행해도 오류가 없어야 함
	work := t.TempDir()
	os.WriteFile(filepath.Join(work, "a.txt"), []byte("x\ny\n"), 0644)
	for _, p := range a.ListPlugins() {
		res, err := a.RunPlugin(p.File, PluginContext{PanelPath: work, Cursor: filepath.Join(work, "a.txt")})
		if err != nil || res.Error != "" {
			t.Fatalf("example %s: %v %s", p.File, err, res.Error)
		}
	}
}
