// Package appdir is where Chobocho Commander keeps its settings: one folder
// for the window app (main) and the headless terminal (cmd/chobocho-term).
package appdir

import (
	"os"
	"path/filepath"
)

// Dir is ~/.chobocho-commander.
func Dir() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, ".chobocho-commander"), nil
}

// TermDir is the terminal's folder inside Dir (settings, sessions, history).
func TermDir() (string, error) {
	d, err := Dir()
	if err != nil {
		return "", err
	}
	return filepath.Join(d, "term"), nil
}
