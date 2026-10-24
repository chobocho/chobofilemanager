package main

// Version: 앱 버전의 단일 출처 (Todo #102).
// wails.json의 info.productVersion, frontend/package.json의 version과 같아야 하며 version_test.go가 검사합니다.
// 빌드 시 덮어쓰기: wails build -ldflags "-X main.Version=0.2.13"
var Version = "0.2.12"

// AppTitle: 창 제목
func AppTitle() string {
	return "Chobocho Commander V" + Version
}
