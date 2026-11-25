package main

import (
	"encoding/json"
	"net"
	"os"
	"time"
)

// The outbound caller reads the camera over loopback. Probe its actual
// destination alongside the remote SRT clients reading the selected path.
func cameraViewers(conns map[string]any, path, pushFile string, now time.Time) map[string]struct{} {
	hosts := make(map[string]struct{})
	add := func(address string) {
		host, _, err := net.SplitHostPort(address)
		ip := net.ParseIP(host)
		if err == nil && ip.To4() != nil && !ip.IsLoopback() {
			hosts[ip.String()] = struct{}{}
		}
	}
	items, _ := conns["items"].([]any)
	for _, item := range items {
		row, _ := item.(map[string]any)
		if row["path"] == path && row["state"] == "read" {
			address, _ := row["remoteAddr"].(string)
			add(address)
		}
	}
	var push struct {
		State, Path, RemoteAddr string
		Updated                 int64
	}
	data, err := os.ReadFile(pushFile)
	if err == nil && json.Unmarshal(data, &push) == nil && push.State == "Sending" && push.Path == path && now.Unix() >= push.Updated && now.Unix()-push.Updated < 15 {
		add(push.RemoteAddr)
	}
	return hosts
}
