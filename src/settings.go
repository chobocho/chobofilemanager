package main

import (
	"encoding/json"
	"os"
	"path/filepath"
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

func defaultConfigDir() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, ".chobocho-commander"), nil
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

	if leftActiveIdx >= len(leftTabs) {
		leftActiveIdx = 0
	}
	if rightActiveIdx >= len(rightTabs) {
		rightActiveIdx = 0
	}

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
	return os.WriteFile(path, data, 0644)
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
		settings.LeftTabs.Paths = filterValidPaths(settings.LeftTabs.Paths)
		if settings.LeftTabs.ActiveIdx >= len(settings.LeftTabs.Paths) {
			settings.LeftTabs.ActiveIdx = 0
		}
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
		settings.RightTabs.Paths = filterValidPaths(settings.RightTabs.Paths)
		if settings.RightTabs.ActiveIdx >= len(settings.RightTabs.Paths) {
			settings.RightTabs.ActiveIdx = 0
		}
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
