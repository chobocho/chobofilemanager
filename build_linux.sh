#!/usr/bin/env bash
# Chobocho Commander 리눅스 빌드 (Todo #125)
# 필요: Go, Node 22, wails, libgtk-3-dev, libwebkit2gtk-4.0-dev (Ubuntu 22.04 기준)
# 테스트(프론트·Go) → wails build → release/ 에 복사 + 창 없는 터미널 웹 서버
set -euo pipefail

cd "$(dirname "$0")/src"

if ! command -v wails >/dev/null 2>&1; then
    echo "[오류] wails 명령을 찾을 수 없습니다: go install github.com/wailsapp/wails/v2/cmd/wails@latest" >&2
    exit 1
fi

echo "[1/5] 프론트 테스트..."
(cd frontend && npm test --silent)

echo "[2/5] Go 테스트..."
go test ./...

echo "[3/5] 빌드 중 (wails build)..."
wails build -clean

echo "[4/5] release 폴더로 복사..."
mkdir -p ../release
cp -f build/bin/chobocho-commander ../release/chobocho-commander

# 창 없이 터미널 웹 서버만 (GTK·WebKit 불필요, cgo 없이)
echo "[5/5] chobocho-term-headless 빌드..."
CGO_ENABLED=0 go build -tags headless -trimpath -ldflags "-s -w" -o ../release/chobocho-term-headless ./cmd/chobocho-term

echo
echo "완료: release/chobocho-commander"
echo "      release/chobocho-term-headless"
