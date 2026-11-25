package main

import (
	"bytes"
	"encoding/json"
	"io"
	"net"
	"strconv"
	"time"
)

// mediamtx's API is on 127.0.0.1, and these are its only calls, so a plain HTTP/1.0
// exchange is enough: the server answers with a whole body and closes. (net/http would
// more than double the binary for this.)

// apiExchange sends one HTTP/1.0 request and returns the status line and body; ok false on
// any network error.
func apiExchange(host string, port int, method, path string, body []byte, timeout time.Duration) (status, respBody []byte, ok bool) {
	conn, err := net.DialTimeout("tcp", net.JoinHostPort(host, strconv.Itoa(port)), timeout)
	if err != nil {
		return nil, nil, false
	}
	defer conn.Close()
	conn.SetDeadline(time.Now().Add(timeout))
	var req bytes.Buffer
	req.WriteString(method + " " + path + " HTTP/1.0\r\nHost: " + host + "\r\n")
	if body != nil {
		req.WriteString("Content-Type: application/json\r\nContent-Length: " + strconv.Itoa(len(body)) + "\r\n")
	}
	req.WriteString("\r\n")
	req.Write(body)
	if _, err := conn.Write(req.Bytes()); err != nil {
		return nil, nil, false
	}
	data, err := io.ReadAll(io.LimitReader(conn, 1_000_000))
	if err != nil && len(data) == 0 {
		return nil, nil, false
	}
	head, rest, _ := bytes.Cut(data, []byte("\r\n\r\n"))
	status, _, _ = bytes.Cut(head, []byte("\r\n"))
	return status, rest, true
}

func statusOK(status []byte) bool {
	return bytes.HasPrefix(status, []byte("HTTP/1.")) && bytes.Contains(status, []byte(" 200 "))
}

// apiGet reads a JSON object from mediamtx's API; nil on any error or a non-200 answer.
func apiGet(host string, port int, path string, timeout time.Duration) map[string]any {
	status, body, ok := apiExchange(host, port, "GET", path, nil, timeout)
	if !ok || !statusOK(status) {
		return nil
	}
	var doc map[string]any
	if json.Unmarshal(body, &doc) != nil {
		return nil
	}
	return doc
}

// apiPatch sends a JSON body to mediamtx's API; true on 200.
func apiPatch(host string, port int, path string, body map[string]any, timeout time.Duration) bool {
	data, err := json.Marshal(body)
	if err != nil {
		return false
	}
	status, _, ok := apiExchange(host, port, "PATCH", path, data, timeout)
	return ok && statusOK(status)
}
