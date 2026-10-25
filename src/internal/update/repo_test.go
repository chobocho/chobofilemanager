package update

import (
	"strings"
	"testing"
)

// Todo #124: the update check looks for releases of Chobocho Commander (the
// terminal's version is the app's), not of the standalone choboterm.
func TestLatestReleaseIsThisApp(t *testing.T) {
	if !strings.Contains(LatestReleaseURL, "/repos/chobocho/chobofilemanager/releases/latest") {
		t.Fatalf("LatestReleaseURL = %q", LatestReleaseURL)
	}
}
