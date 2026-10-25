//go:build windows

package main

import (
	"io/fs"
	"os"
	"path/filepath"
)

// copyMarkOfTheWeb: 인터넷에서 받은 압축 파일의 Zone.Identifier(ADS)를 꺼낸 파일들에도 붙임 —
// Office 보호된 보기 · SmartScreen이 압축을 거쳐도 동작하도록 (Todo #134-2, 7-Zip · WinRAR와 같은 처리)
func copyMarkOfTheWeb(archivePath string, extracted ...string) {
	zone, err := os.ReadFile(archivePath + ":Zone.Identifier")
	if err != nil || len(zone) == 0 {
		return
	}
	for _, top := range extracted {
		filepath.WalkDir(top, func(p string, d fs.DirEntry, err error) error {
			if err == nil && !d.IsDir() {
				os.WriteFile(p+":Zone.Identifier", zone, 0644)
			}
			return nil
		})
	}
}
