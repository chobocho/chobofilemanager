//go:build !windows

package main

// copyMarkOfTheWeb: Windows의 Zone.Identifier 전달 — 다른 OS에는 해당 없음 (Todo #134-2)
func copyMarkOfTheWeb(archivePath string, extracted ...string) {}
