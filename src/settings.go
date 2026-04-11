package main

import (
	"encoding/json"
	"os"
	"path/filepath"
)

type AppSettings struct {
	LeftPath  string `json:"leftPath"`
	RightPath string `json:"rightPath"`
}

func settingsFilePath() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	configDir := filepath.Join(home, ".totalcmd")
	if err := os.MkdirAll(configDir, 0755); err != nil {
		return "", err
	}
	return filepath.Join(configDir, "settings.json"), nil
}

func (a *App) SavePanelPaths(leftPath, rightPath string) error {
	path, err := settingsFilePath()
	if err != nil {
		return err
	}
	settings := AppSettings{LeftPath: leftPath, RightPath: rightPath}
	data, err := json.Marshal(settings)
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0644)
}

func (a *App) LoadPanelPaths() AppSettings {
	path, err := settingsFilePath()
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
	// 저장된 경로가 실제로 존재하는지 확인
	if settings.LeftPath != "" {
		if _, err := os.Stat(settings.LeftPath); err != nil {
			settings.LeftPath = ""
		}
	}
	if settings.RightPath != "" {
		if _, err := os.Stat(settings.RightPath); err != nil {
			settings.RightPath = ""
		}
	}
	return settings
}
