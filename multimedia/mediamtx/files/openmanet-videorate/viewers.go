package main

import (
	"fmt"
	"strings"
)

// idSet is a set of mediamtx reader ids. nil means "not known" (mediamtx gave no answer),
// which is not the same as an empty set.
type idSet map[string]struct{}

// readerIDs reads the reader ids from mediamtx's /v3/paths/get/<path>; nil when the
// answer had none to give.
func readerIDs(pathInfo map[string]any) idSet {
	if pathInfo == nil {
		return nil
	}
	readers, ok := pathInfo["readers"].([]any)
	if !ok {
		return nil
	}
	out := idSet{}
	for _, r := range readers {
		if m, ok := r.(map[string]any); ok {
			out[pyStr(m["type"])+":"+pyStr(m["id"])] = struct{}{}
		}
	}
	return out
}

// pyStr writes a JSON value the way the Python reference did (None for a missing one), so
// reader ids are the same in both builds.
func pyStr(v any) string {
	if v == nil {
		return "None"
	}
	return fmt.Sprint(v)
}

// idrStep says whether to request a keyframe now, and which readers to remember as served.
//
// A reader that appeared since the last look gets a keyframe, but no more often than every
// minGapS; one that joins inside that gap stays unserved, and is served once the gap has
// passed. The first answer (known nil) counts: a viewer that connected before this process
// started is waiting too. lastIDR is nil before the first request.
func idrStep(known, nowIDs idSet, lastIDR *float64, now, minGapS float64) (bool, idSet) {
	if nowIDs == nil { // mediamtx not answering: wait
		return false, known
	}
	joined := 0
	for id := range nowIDs {
		if _, ok := known[id]; !ok { // a nil known has nothing in it: all joined
			joined++
		}
	}
	if joined == 0 {
		return false, nowIDs
	}
	if lastIDR != nil && now-*lastIDR < minGapS {
		if known == nil {
			return false, nil
		}
		both := idSet{}
		for id := range known {
			if _, ok := nowIDs[id]; ok {
				both[id] = struct{}{}
			}
		}
		return false, both
	}
	return true, nowIDs
}

// readerHosts is the viewers' addresses from mediamtx's /v3/srtconns/list and
// /v3/rtspsessions/list, without this node's own (127.x: the camera's own stream check)
// and without IPv6 ones (the echo is IPv4).
func readerHosts(srt, rtsp map[string]any) map[string]struct{} {
	hosts := map[string]struct{}{}
	for _, doc := range []map[string]any{srt, rtsp} {
		items, _ := doc["items"].([]any)
		for _, item := range items {
			addr := ""
			if m, ok := item.(map[string]any); ok {
				addr, _ = m["remoteAddr"].(string)
			}
			host := ""
			if i := strings.LastIndex(addr, ":"); i >= 0 {
				host = strings.Trim(addr[:i], "[]")
			}
			if host != "" && !strings.HasPrefix(host, "127.") && !strings.Contains(host, ":") {
				hosts[host] = struct{}{}
			}
		}
	}
	return hosts
}
