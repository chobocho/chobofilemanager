@echo off
chcp 65001 >nul
setlocal

rem ============================================================
rem  Chobocho Commander 빌드 스크립트 (Todo #125)
rem  테스트(Go·프론트) → wails build → release 폴더에 복사
rem  + 창 없는 터미널 웹 서버(chobocho-term-headless.exe)
rem ============================================================

cd /d "%~dp0src"

where wails >nul 2>nul
if errorlevel 1 (
    echo [오류] wails 명령을 찾을 수 없습니다.
    echo        go install github.com/wailsapp/wails/v2/cmd/wails@latest
    goto :fail
)

echo [1/5] 프론트 테스트...
pushd frontend
call npm test --silent
if errorlevel 1 (
    popd
    echo [오류] 프론트 테스트가 실패했습니다.
    goto :fail
)
popd

echo [2/5] Go 테스트...
go test ./...
if errorlevel 1 (
    echo [오류] Go 테스트가 실패했습니다.
    goto :fail
)

echo [3/5] 빌드 중 (wails build)...
call wails build -clean
if errorlevel 1 (
    echo [오류] 빌드가 실패했습니다.
    goto :fail
)

echo [4/5] release 폴더로 복사...
if not exist "%~dp0release" mkdir "%~dp0release"
copy /y "build\bin\chobocho-commander.exe" "%~dp0release\chobocho-commander.exe" >nul
if errorlevel 1 (
    echo [오류] 복사에 실패했습니다. chobocho-commander.exe 가 실행 중이면 종료하고 다시 시도하세요.
    goto :fail
)

rem 창 없이 터미널 웹 서버만 띄우는 콘솔 프로그램 (WebView2 불필요)
echo [5/5] chobocho-term-headless.exe 빌드...
go build -tags headless -trimpath -ldflags "-s -w" -o "%~dp0release\chobocho-term-headless.exe" ./cmd/chobocho-term
if errorlevel 1 (
    echo [오류] chobocho-term-headless.exe 빌드가 실패했습니다.
    goto :fail
)

echo.
echo 완료: %~dp0release\chobocho-commander.exe
echo       %~dp0release\chobocho-term-headless.exe
endlocal
exit /b 0

:fail
echo.
echo 빌드를 중단했습니다.
endlocal
exit /b 1
