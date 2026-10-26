//go:build !windows

package main

// 소유자 · 그룹 이름 (Todo #137-2)

import (
	"bufio"
	"fmt"
	"os"
	"os/user"
	"sort"
	"strconv"
	"strings"
	"sync"
	"syscall"
)

var (
	ownerMu    sync.Mutex
	userNames  = map[uint32]string{}
	groupNames = map[uint32]string{}
)

// fileOwner: 목록에 쓸 소유자 · 그룹 이름 (찾지 못하면 숫자). 같은 id는 한 번만 찾음
func fileOwner(info os.FileInfo) (string, string) {
	st, ok := info.Sys().(*syscall.Stat_t)
	if !ok {
		return "", ""
	}
	uid, gid := uint32(st.Uid), uint32(st.Gid)
	ownerMu.Lock()
	defer ownerMu.Unlock()
	u, ok := userNames[uid]
	if !ok {
		u = strconv.FormatUint(uint64(uid), 10)
		if x, err := user.LookupId(u); err == nil {
			u = x.Username
		}
		userNames[uid] = u
	}
	g, ok := groupNames[gid]
	if !ok {
		g = strconv.FormatUint(uint64(gid), 10)
		if x, err := user.LookupGroupId(g); err == nil {
			g = x.Name
		}
		groupNames[gid] = g
	}
	return u, g
}

// lookupOwner: 이름 또는 숫자 → id (빈 값은 -1 = 바꾸지 않음)
func lookupOwner(owner, group string) (int, int, error) {
	uid, gid := -1, -1
	if owner = strings.TrimSpace(owner); owner != "" {
		if n, err := strconv.Atoi(owner); err == nil && n >= 0 {
			uid = n
		} else if u, err := user.Lookup(owner); err == nil {
			uid, _ = strconv.Atoi(u.Uid)
		} else {
			return 0, 0, fmt.Errorf("없는 사용자: %s", owner)
		}
	}
	if group = strings.TrimSpace(group); group != "" {
		if n, err := strconv.Atoi(group); err == nil && n >= 0 {
			gid = n
		} else if g, err := user.LookupGroup(group); err == nil {
			gid, _ = strconv.Atoi(g.Gid)
		} else {
			return 0, 0, fmt.Errorf("없는 그룹: %s", group)
		}
	}
	return uid, gid, nil
}

func ownerChoices() OwnerChoices {
	return OwnerChoices{Users: namesIn("/etc/passwd"), Groups: namesIn("/etc/group")}
}

// namesIn: passwd · group 형식 파일의 첫 칸 (주석 · NIS 줄 제외)
func namesIn(path string) []string {
	f, err := os.Open(path)
	if err != nil {
		return []string{}
	}
	defer f.Close()
	seen := map[string]bool{}
	out := []string{}
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		line := sc.Text()
		if line == "" || line[0] == '#' || line[0] == '+' || line[0] == '-' {
			continue
		}
		name, _, _ := strings.Cut(line, ":")
		if name != "" && !seen[name] {
			seen[name] = true
			out = append(out, name)
		}
	}
	sort.Strings(out)
	return out
}
