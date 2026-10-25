package main

import (
	"encoding/json"
	"os"
	"path/filepath"

	"totalcmd/internal/appdir"
	"totalcmd/internal/atomicfile"
)

type PanelTabsState struct {
	Paths     []string `json:"paths"`
	ActiveIdx int      `json:"activeIdx"`
}

type AppSettings struct {
	LeftPath  string          `json:"leftPath"`  // 이전 버전 호환용
	RightPath string          `json:"rightPath"` // 이전 버전 호환용
	LeftTabs  *PanelTabsState `json:"leftTabs,omitempty"`
	RightTabs *PanelTabsState `json:"rightTabs,omitempty"`
}

// 설정 폴더 (~/.chobocho-commander) — 헤드리스 터미널(cmd/chobocho-term)과 같은 곳 (internal/appdir)
func defaultConfigDir() (string, error) {
	return appdir.Dir()
}

func (a *App) resolvedConfigDir() (string, error) {
	if a.configDir != "" {
		return a.configDir, nil
	}
	return defaultConfigDir()
}

func (a *App) settingsFilePath() (string, error) {
	dir, err := a.resolvedConfigDir()
	if err != nil {
		return "", err
	}
	if err := os.MkdirAll(dir, 0755); err != nil {
		return "", err
	}
	return filepath.Join(dir, "settings.json"), nil
}

// SavePanelPaths는 이전 버전 호환용으로 유지. 내부적으로 단일 탭 세션으로 저장.
func (a *App) SavePanelPaths(leftPath, rightPath string) error {
	return a.SaveSessionState([]string{leftPath}, 0, []string{rightPath}, 0)
}

// SaveSessionState는 양쪽 패널의 모든 탭 경로와 활성 탭 인덱스를 저장합니다.
func (a *App) SaveSessionState(leftTabs []string, leftActiveIdx int, rightTabs []string, rightActiveIdx int) error {
	path, err := a.settingsFilePath()
	if err != nil {
		return err
	}

	leftActiveIdx = clampTabIdx(leftActiveIdx, len(leftTabs))
	rightActiveIdx = clampTabIdx(rightActiveIdx, len(rightTabs))

	leftPath := ""
	if len(leftTabs) > 0 {
		leftPath = leftTabs[leftActiveIdx]
	}
	rightPath := ""
	if len(rightTabs) > 0 {
		rightPath = rightTabs[rightActiveIdx]
	}

	settings := AppSettings{
		LeftPath:  leftPath,
		RightPath: rightPath,
		LeftTabs:  &PanelTabsState{Paths: leftTabs, ActiveIdx: leftActiveIdx},
		RightTabs: &PanelTabsState{Paths: rightTabs, ActiveIdx: rightActiveIdx},
	}
	data, err := json.Marshal(settings)
	if err != nil {
		return err
	}
	return atomicfile.Write(path, data, 0644)
}

// LoadPanelPaths는 저장된 세션 정보를 불러옵니다.
// 각 탭 경로 중 존재하지 않는 경로는 필터링됩니다.
func (a *App) LoadPanelPaths() AppSettings {
	path, err := a.settingsFilePath()
	if err != nil {
		return AppSettings{}
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return AppSettings{}
	}
	var settings AppSettings
	if err := json.Unmarshal(data, &settings); err != nil {
		return AppSettings{}
	}

	// 탭 정보가 있으면 각 경로 검증
	if settings.LeftTabs != nil {
		normalizeTabs(settings.LeftTabs)
		// 이전 버전 호환: LeftPath도 검증된 활성 탭 경로로 갱신
		if len(settings.LeftTabs.Paths) > 0 {
			settings.LeftPath = settings.LeftTabs.Paths[settings.LeftTabs.ActiveIdx]
		} else {
			settings.LeftPath = ""
		}
	} else {
		// 구버전 settings.json: leftPath만 있는 경우
		if settings.LeftPath != "" {
			if _, err := os.Stat(settings.LeftPath); err != nil {
				settings.LeftPath = ""
			}
		}
	}

	if settings.RightTabs != nil {
		normalizeTabs(settings.RightTabs)
		if len(settings.RightTabs.Paths) > 0 {
			settings.RightPath = settings.RightTabs.Paths[settings.RightTabs.ActiveIdx]
		} else {
			settings.RightPath = ""
		}
	} else {
		if settings.RightPath != "" {
			if _, err := os.Stat(settings.RightPath); err != nil {
				settings.RightPath = ""
			}
		}
	}

	return settings
}

func filterValidPaths(paths []string) []string {
	var valid []string
	for _, p := range paths {
		if p != "" {
			if _, err := os.Stat(p); err == nil {
				valid = append(valid, p)
			}
		}
	}
	return valid
}

// clampTabIdx: 범위 밖(음수 포함) 인덱스는 0으로 (Todo #88 — 손상된 settings.json으로 인한 panic 방지)
func clampTabIdx(idx, n int) int {
	if idx < 0 || idx >= n {
		return 0
	}
	return idx
}

// normalizeTabs: 존재하지 않는 경로를 제거하면서 원래 활성 탭을 계속 가리키도록 인덱스를 보정합니다.
func normalizeTabs(t *PanelTabsState) {
	idx := clampTabIdx(t.ActiveIdx, len(t.Paths))
	active := ""
	if idx < len(t.Paths) {
		active = t.Paths[idx]
	}
	t.Paths = filterValidPaths(t.Paths)
	t.ActiveIdx = 0
	for i, p := range t.Paths {
		if p == active {
			t.ActiveIdx = i
			break
		}
	}
}
