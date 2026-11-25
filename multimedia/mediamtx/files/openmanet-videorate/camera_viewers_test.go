package main

import (
	"os"
	"path/filepath"
	"reflect"
	"testing"
	"time"
)

func TestCameraViewers(t *testing.T) {
	file := filepath.Join(t.TempDir(), "push")
	if err := os.WriteFile(file, []byte(`{"path":"cam","state":"Sending","remoteAddr":"10.0.0.9:8890","updated":100}`), 0600); err != nil {
		t.Fatal(err)
	}
	conns := map[string]any{"items": []any{
		map[string]any{"remoteAddr": "10.0.0.8:321", "path": "cam", "state": "read"},
		map[string]any{"remoteAddr": "10.0.0.7:321", "path": "other", "state": "read"},
		map[string]any{"remoteAddr": "10.0.0.6:321", "path": "cam", "state": "publish"},
		map[string]any{"remoteAddr": "127.0.0.1:321", "path": "cam", "state": "read"},
	}}
	for _, tc := range []struct {
		now  int64
		want map[string]struct{}
	}{
		{110, map[string]struct{}{"10.0.0.8": {}, "10.0.0.9": {}}},
		{120, map[string]struct{}{"10.0.0.8": {}}},
	} {
		if got := cameraViewers(conns, "cam", file, time.Unix(tc.now, 0)); !reflect.DeepEqual(got, tc.want) {
			t.Fatalf("viewers = %v; want %v", got, tc.want)
		}
	}
}
