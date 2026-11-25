package main

import (
	"encoding/json"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strconv"
	"strings"
	"testing"
	"time"
)

func set(ids ...string) idSet {
	s := idSet{}
	for _, id := range ids {
		s[id] = struct{}{}
	}
	return s
}

func at(v float64) *float64 { return &v }

func TestReaderIDsFromMediamtxPath(t *testing.T) {
	var info map[string]any
	json.Unmarshal([]byte(`{"name":"cam","ready":true,"readers":[{"type":"rtspSession","id":"a"},{"type":"srtConn","id":"b"}]}`), &info)
	if got := readerIDs(info); !reflect.DeepEqual(got, set("rtspSession:a", "srtConn:b")) {
		t.Errorf("got %v", got)
	}
	if got := readerIDs(map[string]any{"name": "cam", "readers": []any{}}); got == nil || len(got) != 0 {
		t.Errorf("no readers: %v, want an empty set", got)
	}
	if readerIDs(nil) != nil || readerIDs(map[string]any{"error": "path not found"}) != nil {
		t.Error("an error answer gave readers")
	}
}

func TestKeyframeForEachJoiningViewer(t *testing.T) {
	check := func(name string, wantIDR bool, wantKnown idSet, gotIDR bool, gotKnown idSet) {
		t.Helper()
		if gotIDR != wantIDR || !reflect.DeepEqual(gotKnown, wantKnown) {
			t.Errorf("%s: got %v %v, want %v %v", name, gotIDR, gotKnown, wantIDR, wantKnown)
		}
	}
	// First answer: viewers already waiting get one; an empty path does not.
	w, k := idrStep(nil, set("srt:a"), nil, 0, 2)
	check("waiting at start", true, set("srt:a"), w, k)
	w, k = idrStep(nil, set(), nil, 0, 2)
	check("empty at start", false, set(), w, k)
	// A new viewer gets one; a viewer leaving does not.
	w, k = idrStep(set("srt:a"), set("srt:a", "rtsp:b"), at(0), 10, 2)
	check("joined", true, set("srt:a", "rtsp:b"), w, k)
	w, k = idrStep(set("srt:a", "rtsp:b"), set("srt:a"), at(0), 10, 2)
	check("left", false, set("srt:a"), w, k)
	// mediamtx not answering: remember what we knew, ask for nothing.
	w, k = idrStep(set("srt:a"), nil, at(0), 10, 2)
	check("no answer", false, set("srt:a"), w, k)
}

func TestJoinInsideTheGapWaitsThenIsServed(t *testing.T) {
	want, known := idrStep(set("srt:a"), set("srt:a", "srt:b"), at(9.5), 10, 2)
	if want || !reflect.DeepEqual(known, set("srt:a")) { // b stays unserved...
		t.Fatalf("inside the gap: %v %v", want, known)
	}
	want, known = idrStep(known, set("srt:a", "srt:b"), at(9.5), 11.6, 2)
	if !want || !reflect.DeepEqual(known, set("srt:a", "srt:b")) { // ...and is served once it has passed
		t.Fatalf("after the gap: %v %v", want, known)
	}
	// A viewer that joins and leaves inside the gap is simply forgotten.
	_, known = idrStep(set("srt:a"), set("srt:a", "srt:c"), at(9.5), 10, 2)
	if want, known = idrStep(known, set("srt:a"), at(9.5), 12, 2); want || !reflect.DeepEqual(known, set("srt:a")) {
		t.Errorf("joined and left: %v %v", want, known)
	}
}

func TestReaderHostsAreTheViewersNotThisNode(t *testing.T) {
	var srt, rtsp map[string]any
	json.Unmarshal([]byte(`{"items":[{"remoteAddr":"10.41.0.113:35136"},{"remoteAddr":"127.0.0.1:5000"}]}`), &srt)
	json.Unmarshal([]byte(`{"items":[{"remoteAddr":"10.41.0.120:40000"},{"remoteAddr":"[fe80::1]:554"}]}`), &rtsp)
	want := map[string]struct{}{"10.41.0.113": {}, "10.41.0.120": {}}
	if got := readerHosts(srt, rtsp); !reflect.DeepEqual(got, want) {
		t.Errorf("got %v", got)
	}
	if got := readerHosts(nil, map[string]any{"error": "x"}); len(got) != 0 {
		t.Errorf("error answers gave %v", got)
	}
}

func TestAPIGetReadsJSONAndRejectsErrors(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.URL.Path == "/v3/paths/get/cam" {
			io.WriteString(w, `{"name":"cam","readers":[{"type":"srtConn","id":"x"}]}`)
			return
		}
		w.WriteHeader(http.StatusNotFound)
		io.WriteString(w, `{"error":"path not found"}`)
	}))
	defer srv.Close()
	host, port := hostPort(t, srv.URL)
	if got := readerIDs(apiGet(host, port, "/v3/paths/get/cam", time.Second)); !reflect.DeepEqual(got, set("srtConn:x")) {
		t.Errorf("got %v", got)
	}
	if apiGet(host, port, "/v3/paths/get/other", time.Second) != nil {
		t.Error("a 404 gave a document")
	}
	if apiGet("127.0.0.1", 9, "/v3/paths/get/cam", 500*time.Millisecond) != nil { // nothing listening
		t.Error("nothing listening gave a document")
	}
}

func TestAPIPatchSendsJSONAndReportsTheAnswer(t *testing.T) {
	var gotPath string
	var gotBody map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPatch || r.Header.Get("Content-Type") != "application/json" {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		gotPath = r.URL.Path
		json.NewDecoder(r.Body).Decode(&gotBody)
		if r.URL.Path != "/v3/config/paths/patch/cam" {
			w.WriteHeader(http.StatusBadRequest)
		}
	}))
	defer srv.Close()
	host, port := hostPort(t, srv.URL)
	if !apiPatch(host, port, "/v3/config/paths/patch/cam", map[string]any{"rpiCameraBitrate": 700000}, time.Second) {
		t.Error("200 reported as refused")
	}
	if gotPath != "/v3/config/paths/patch/cam" || gotBody["rpiCameraBitrate"] != float64(700000) {
		t.Errorf("sent %s %v", gotPath, gotBody)
	}
	if apiPatch(host, port, "/v3/config/paths/patch/other", map[string]any{"x": 1}, time.Second) {
		t.Error("400 reported as accepted")
	}
	if apiPatch("127.0.0.1", 9, "/v3/config/paths/patch/cam", map[string]any{}, 500*time.Millisecond) {
		t.Error("nothing listening reported as accepted")
	}
}

func hostPort(t *testing.T, url string) (string, int) {
	t.Helper()
	host, portText, err := net.SplitHostPort(strings.TrimPrefix(url, "http://"))
	port, err2 := strconv.Atoi(portText)
	if err != nil || err2 != nil {
		t.Fatalf("test server address %q", url)
	}
	return host, port
}
