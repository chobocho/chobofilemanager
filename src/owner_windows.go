package main

import "os"

// Windows: 소유자 열은 비움, 권한 · 소유자 바꾸기는 지원하지 않음 (Todo #137-2)

func fileOwner(os.FileInfo) (string, string) { return "", "" }

func lookupOwner(string, string) (int, int, error) { return -1, -1, errPermsUnsupported }

func ownerChoices() OwnerChoices { return OwnerChoices{Users: []string{}, Groups: []string{}} }
