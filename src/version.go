package main

import "totalcmd/internal/version"

// AppTitle: 창 제목. 버전은 internal/version 한 곳 (Todo #102, #126) —
// 빌드 시 덮어쓰기: wails build -ldflags "-X totalcmd/internal/version.Version=0.2.13"
func AppTitle() string {
	return "Chobocho Commander V" + version.Version
}
