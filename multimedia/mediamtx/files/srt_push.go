package main

import (
	"encoding/json"
	"errors"
	"net"
	"net/url"
	"os"
	"strconv"
	"time"

	srt "github.com/datarhei/gosrt"
)

const pushStatusFile = "/var/run/mediamtx-srt-push.json"

type pushStatus struct {
	State            string  `json:"state"`
	Updated          int64   `json:"updated"`
	Path             string  `json:"path,omitempty"`
	RemoteAddr       string  `json:"remoteAddr,omitempty"`
	RTTMillis        float64 `json:"rttMillis"`
	SendBufferMillis uint64  `json:"sendBufferMillis"`
	BytesSent        uint64  `json:"bytesSent"`
	Retransmissions  uint64  `json:"retransmissions"`
}

func writePushStatus(status pushStatus) {
	status.Updated = time.Now().Unix()
	data, err := json.Marshal(status)
	if err == nil && os.WriteFile(pushStatusFile+".tmp", data, 0600) == nil {
		_ = os.Rename(pushStatusFile+".tmp", pushStatusFile)
	}
}

// Clients paste FFmpeg URLs. gosrt takes milliseconds for the latency option.
func pushDestination(raw string) (string, srt.Config, error) {
	config := srt.DefaultConfig()
	config.IPTOS = 0x48 // AF21, matching the video queue probes.
	u, err := url.Parse(raw)
	if err != nil || u.Scheme != "srt" || u.Hostname() == "" || u.Port() == "" {
		return "", config, errors.New("enter an SRT destination with a host and port")
	}
	q, err := url.ParseQuery(u.RawQuery)
	if err != nil {
		return "", config, errors.New("invalid destination query")
	}
	if mode := q.Get("mode"); mode != "" && mode != "caller" {
		return "", config, errors.New("the destination must accept an SRT caller")
	}
	if q.Has("latency") {
		us, err := strconv.Atoi(q.Get("latency"))
		if err != nil || us < 1000 || us > 8000000 {
			return "", config, errors.New("destination latency must be 1000–8000000 microseconds")
		}
		q.Set("latency", strconv.Itoa((us+999)/1000))
	}
	u.RawQuery = q.Encode()
	address, err := config.UnmarshalURL(u.String())
	if err != nil || config.Validate() != nil {
		return "", config, errors.New("invalid SRT destination options")
	}
	return address, config, nil
}

func runSRTPush() (err error) {
	defer func() {
		if err != nil {
			writePushStatus(pushStatus{State: err.Error()})
		}
	}()
	address, config, err := pushDestination(os.Getenv("SRT_DESTINATION"))
	if err != nil {
		return err
	}

	local := srt.DefaultConfig()
	local.StreamId = "read:" + os.Getenv("SRT_PATH")
	local.ConnectionTimeout = 10 * time.Second // Allow a cold camera to start.
	host, port, err := net.SplitHostPort(os.Getenv("SRT_LISTENER"))
	if err != nil {
		return errors.New("invalid local SRT listener")
	}
	if host == "" || host == "0.0.0.0" {
		host = "127.0.0.1"
	} else if host == "::" {
		host = "::1"
	}
	writePushStatus(pushStatus{State: "Opening local stream"})
	source, err := srt.Dial("srt", net.JoinHostPort(host, port), local)
	if err != nil {
		return errors.New("local stream unavailable")
	}
	defer source.Close()
	writePushStatus(pushStatus{State: "Connecting to remote listener"})
	dest, err := srt.Dial("srt", address, config)
	if err != nil {
		return errors.New("remote listener rejected the connection or timed out")
	}
	defer dest.Close()

	var stats srt.Statistics
	var next time.Time
	buf := make([]byte, 1500)
	for {
		n, err := source.Read(buf)
		if err != nil {
			return errors.New("local stream disconnected")
		}
		if _, err = dest.Write(buf[:n]); err != nil {
			return errors.New("remote listener disconnected")
		}
		if now := time.Now(); !now.Before(next) {
			dest.Stats(&stats)
			writePushStatus(pushStatus{
				State: "Sending", Path: os.Getenv("SRT_PATH"), RemoteAddr: dest.RemoteAddr().String(),
				RTTMillis: stats.Instantaneous.MsRTT, SendBufferMillis: stats.Instantaneous.MsSendBuf,
				BytesSent: stats.Accumulated.ByteSent, Retransmissions: stats.Accumulated.PktRetrans,
			})
			next = now.Add(3 * time.Second)
		}
	}
}
