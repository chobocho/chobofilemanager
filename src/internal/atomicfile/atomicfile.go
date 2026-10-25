// Package atomicfile writes small settings files so a crash never leaves half
// a file, and keeps a file that can't be parsed instead of overwriting it.
package atomicfile

import (
	"fmt"
	"os"
	"path/filepath"
	"time"
)

// WriteCreatingDir is Write that first creates p's folder (settings files).
func WriteCreatingDir(p string, data []byte, perm os.FileMode) error {
	if err := os.MkdirAll(filepath.Dir(p), 0o700); err != nil {
		return err
	}
	return Write(p, data, perm)
}

// Write replaces p with data in one step: it writes a temp file in the same
// folder and renames it over p. A missing folder is an error (a user's file is
// never saved into a folder that was deleted meanwhile).
func Write(p string, data []byte, perm os.FileMode) error {
	tmp, err := os.CreateTemp(filepath.Dir(p), filepath.Base(p)+".*.tmp")
	if err != nil {
		return err
	}
	name := tmp.Name()
	_, err = tmp.Write(data)
	if err == nil {
		err = tmp.Sync()
	}
	if cerr := tmp.Close(); err == nil {
		err = cerr
	}
	if err == nil {
		err = os.Chmod(name, perm)
	}
	if err == nil {
		err = os.Rename(name, p)
	}
	if err != nil {
		os.Remove(name)
	}
	return err
}

// BackupCorrupt moves a file that can't be parsed to <p>.corrupt-<time> so the
// next save doesn't destroy what the user had. It returns the backup path.
func BackupCorrupt(p string) string {
	backup := fmt.Sprintf("%s.corrupt-%s", p, time.Now().Format("20060102-150405.000000000"))
	if os.Rename(p, backup) != nil {
		return ""
	}
	return backup
}
