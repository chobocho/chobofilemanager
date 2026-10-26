// Package version is the version of this build.
package version

// Version is the version of Chobocho Commander: the window title, the terminal,
// the update check and the web server all use it. A build can set it with
//
//	-ldflags "-X totalcmd/internal/version.Version=0.2.14"
//
// It must equal wails.json info.productVersion and frontend/package.json
// version (src/version_test.go checks).
var Version = "0.2.14"
