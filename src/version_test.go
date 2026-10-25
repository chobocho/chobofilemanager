package main

import (
	"encoding/json"
	"os"
	"testing"

	"totalcmd/internal/version"
)

// ─── Todo #102: 버전 단일화 ───────────────────────────────────────────────────

func TestVersion_MatchesWailsAndPackageJSON(t *testing.T) {
	var wails struct {
		Info struct {
			ProductVersion string `json:"productVersion"`
		} `json:"info"`
	}
	data, err := os.ReadFile("wails.json")
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(data, &wails); err != nil {
		t.Fatal(err)
	}
	if wails.Info.ProductVersion != version.Version {
		t.Errorf("wails.json info.productVersion = %q, Version = %q", wails.Info.ProductVersion, version.Version)
	}

	var pkg struct {
		Version string `json:"version"`
	}
	data, err = os.ReadFile("frontend/package.json")
	if err != nil {
		t.Fatal(err)
	}
	json.Unmarshal(data, &pkg)
	if pkg.Version != version.Version {
		t.Errorf("frontend/package.json version = %q, Version = %q", pkg.Version, version.Version)
	}
}

func TestAppTitle_ContainsVersion(t *testing.T) {
	if got := AppTitle(); got != "Chobocho Commander V"+version.Version {
		t.Errorf("AppTitle = %q", got)
	}
}
