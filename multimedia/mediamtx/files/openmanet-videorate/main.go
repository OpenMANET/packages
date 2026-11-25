// Command uas-videorate sets the air node's video bitrate from the HaLow link's own
// counters and the viewers' queueing delay.
//
// It is the Go build of the harness's uas_harness/videorate.py: same flags, same rules,
// same status file and log lines. testdata/vectors.json, generated from the Python
// reference, checks that the two decide the same.
//
// Once a second it reads `iw dev <mesh> station dump`, takes the peer that carried the most
// traffic (the video path), and sets the bitrate: on uas-x264enc's local control port
// (`bitrate <kbit/s>`), or with -rpicamera on mediamtx's camera path (rpiCameraBitrate,
// changed in place without restarting the camera):
//
//   - down fast when the link fails frames (2 or more, over 0.5 %) or, with no viewer to
//     measure, retries heavily (over 30 % across 20 frames or more): to 70 %;
//   - down when the video's queue grows: each viewer is pinged once a second with the
//     video's own DSCP (AF21), so the echo waits in the radio queue the video waits in.
//     More than 150 ms over the lowest round trip of the last minute means the link carries
//     less than the camera sends: to 70 %, at most every 2 s so the queue can drain;
//   - retries alone count only when there is no viewer to measure: through walls minstrel
//     can run MCS7 at 50-60 % retries (2026-10-25), a working link, not a struggling one;
//   - up slowly: after 5 clean seconds, 50 kbit/s every 2 s, but for 30 s after a drop no
//     higher than 70 % of the rate that went bad, unless the link's expected throughput
//     grows by half (in a forced fade, 2026-11-23, climbing straight back re-queued the video);
//   - never above 35 % of the link's expected throughput (minstrel's estimate), so video
//     leaves room for C2 and RC on the same channel.
//
// With -low-size (ribbon camera only) it also changes the picture when the link cannot
// carry even the floor. The Pi camera's hardware encoder does not go much below 150-250
// kbit/s at 1280x720, 30 fps and a keyframe every 0.5 s, whatever bitrate is asked for; at
// 640x360, 15 fps and a keyframe every 2 s it holds what it is given. The switch restarts
// the camera in mediamtx, which drops the viewers while their players reconnect, so it is
// kept rare: low only after 4 s at the floor with the link still struggling; back to full
// only after 30 s in low and 10 s of a link that carries the full floor with half again to
// spare; never two switches within 30 s. Off unless asked for: on 2026-11-23 the air node
// rebooted about 2 s after a switch back to full, cause not yet known.
//
// It also watches the camera's path in mediamtx and sends `idr` when a viewer joins:
// mediamtx's SRT readers receive nothing until a keyframe. At most one request per 2 s.
//
// It only talks to the encoder on 127.0.0.1, mediamtx's local API and the station
// counters. It never touches MAVLink, RC or the radio's configuration. With no station
// data it holds the current bitrate; with -fixed it never changes it.
package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"math"
	"net"
	"net/url"
	"os"
	"os/exec"
	"os/signal"
	"strconv"
	"syscall"
	"time"
)

const apiTimeout = 2 * time.Second

func main() {
	iface := flag.String("iface", "wlh0", "HaLow mesh interface (wlh0 on OpenMANET 1.8)")
	start := flag.Int("start", 500, "starting bitrate, kbit/s")
	minKbps := flag.Int("min", 250, "bitrate floor, kbit/s")
	maxKbps := flag.Int("max", 1500, "bitrate ceiling, kbit/s")
	share := flag.Float64("share", 0.35, "share of the link's expected throughput video may use")
	controlPort := flag.Int("control-port", 5601, "uas-x264enc's control port on 127.0.0.1")
	statusPath := flag.String("status", "/tmp/uas-videorate.json", "where the current state is written each second")
	interval := flag.Float64("interval", 1.0, "seconds between bitrate decisions")
	viewerPoll := flag.Float64("viewer-poll", 0.25, "seconds between looks at the path's viewers; a joining viewer waits up to this for its keyframe")
	path := flag.String("path", "cam", "mediamtx path of the camera")
	api := flag.String("api", "127.0.0.1:9997", "mediamtx API address")
	fixed := flag.Bool("fixed", false, "hold -start; only send keyframes to joining viewers")
	rpicamera := flag.Bool("rpicamera", false, "set the bitrate on mediamtx's camera path (source rpiCamera) instead of uas-x264enc; that camera makes its own keyframes, so none are requested")
	noQueueCheck := flag.Bool("no-queue-check", false, "judge the link by its station counters only")
	fullSize := flag.String("full-size", "1280x720", "ribbon camera picture normally (WxH)")
	fullFPS := flag.Int("full-fps", 30, "frame rate normally")
	fullGOP := flag.Int("full-gop", 15, "frames between keyframes normally")
	lowSize := flag.String("low-size", "", "with -rpicamera: the picture on a link too weak for -min (WxH, e.g. 640x360); empty never changes it")
	lowFPS := flag.Int("low-fps", 15, "frame rate in the low picture")
	lowGOP := flag.Int("low-gop", 30, "frames between keyframes in the low picture")
	lowMin := flag.Int("low-min", 100, "bitrate floor in the low picture, kbit/s")
	lowMax := flag.Int("low-max", 400, "bitrate ceiling in the low picture, kbit/s")
	videoStatus := flag.String("video-status", "/tmp/uas-video.json", "uas-video's description of the picture (read by uas-camera); updated on a switch")
	dryRun := flag.Bool("dry-run", false, "decide and log, but send nothing")
	managed := flag.Bool("managed-camera", false, "track the native camera configuration and restore its bitrate on shutdown")
	flag.Parse()
	if *minKbps < 1 || *minKbps > *maxKbps || *maxKbps > 100000 || (*managed && !*rpicamera) {
		fatal("invalid camera or bitrate limits")
	}

	apiHost, apiPortText, err := net.SplitHostPort(*api)
	apiPort, err2 := strconv.Atoi(apiPortText)
	if err != nil || err2 != nil {
		fatal("-api %q: want host:port", *api)
	}
	fw, fh, err := parseSize(*fullSize)
	if err != nil {
		fatal("-full-size: %v", err)
	}

	policy := NewPolicy(*minKbps, *maxKbps, *share)
	state := NewRateState(max(*minKbps, min(*maxKbps, *start)))
	full := Profile{fw, fh, *fullFPS, *fullGOP, *minKbps, *maxKbps}
	var low *Profile
	if *lowSize != "" && *rpicamera && !*fixed {
		lw, lh, err := parseSize(*lowSize)
		if err != nil {
			fatal("-low-size: %v", err)
		}
		low = &Profile{lw, lh, *lowFPS, *lowGOP, *lowMin, min(*lowMax, *maxKbps)}
	}
	fullPolicy, lowPolicy := policy, policy
	if low != nil {
		lowPolicy = NewPolicy(low.MinKbps, low.MaxKbps, *share)
	}
	pstate := NewProfileState()
	pp := NewProfilePolicy()

	t0 := time.Now()
	clock := func() float64 { return time.Since(t0).Seconds() }

	if low != nil {
		// A restart of this process must not forget that the camera is on the low picture.
		cur := apiGet(apiHost, apiPort, "/v3/config/paths/get/"+*path, apiTimeout)
		if isPicture(cur, *low) {
			pstate = ProfileState{Low: true, Since: clock()}
			policy = lowPolicy
			state = NewRateState(max(low.MinKbps, min(low.MaxKbps, state.Kbps)))
			writeVideoStatus(*videoStatus, *low, state.Kbps)
		}
	}
	nextProfileCheck := clock() + 10

	ctl, err := net.ListenUDP("udp4", nil)
	if err != nil {
		fatal("control socket: %v", err)
	}
	encoder := &net.UDPAddr{IP: net.IPv4(127, 0, 0, 1), Port: *controlPort}
	var sent *int
	var knownReaders idSet
	var lastIDR *float64
	idrTotal := 0
	prev := stationsByMAC(readStations(*iface))
	var pinger *Pinger
	if !*noQueueCheck {
		if pinger, err = newPinger(5); err != nil {
			say("no queue check (%v); station counters only", err)
			pinger = nil
		}
	}
	delays := NewDelayTracker()
	var queue *float64
	viewers := map[string]struct{}{}

	setBitrate := func(kbps int) bool {
		if *dryRun {
			return true
		}
		if *rpicamera {
			return apiPatch(apiHost, apiPort, "/v3/config/paths/patch/"+*path,
				map[string]any{"rpiCameraBitrate": kbps * 1000}, apiTimeout)
		}
		ctl.WriteToUDP([]byte("bitrate "+strconv.Itoa(kbps)), encoder)
		return true
	}

	mode := "fixed"
	if !*fixed {
		mode = fmt.Sprintf("%d-%d, share %s", *minKbps, *maxKbps, pct(*share, 0))
	}
	target := fmt.Sprintf("uas-x264enc :%d", *controlPort)
	if *rpicamera {
		target = fmt.Sprintf("mediamtx %s (rpiCamera)", *path)
	}
	check := "off"
	if pinger != nil {
		check = "on"
	}
	say("%s, %d kbit/s (%s) to %s; queue check %s", *iface, state.Kbps, mode, target, check)

	poll := time.Duration(*viewerPoll * float64(time.Second))
	nextRate := clock() + *interval
	var original int
	cameraConfig := "/v3/config/paths/get/" + url.PathEscape(*path)
	done, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	if *managed {
		defer func() {
			current := apiGet(apiHost, apiPort, cameraConfig, apiTimeout)
			if sent != nil && current["source"] == "rpiCamera" && current["rpiCameraBitrate"] == float64(*sent*1000) && original > 0 {
				apiPatch(apiHost, apiPort, "/v3/config/paths/patch/"+url.PathEscape(*path), map[string]any{"rpiCameraBitrate": original}, apiTimeout)
			}
			_ = os.Remove(*statusPath)
		}()
	}
	for {
		select {
		case <-done.Done():
			return
		case <-time.After(poll):
		}
		now := clock()
		if pinger != nil {
			for _, r := range pinger.collect(now) {
				delays.add(r.host, now, r.ms, true)
			}
			for _, host := range pinger.expire(now) {
				delays.add(host, now, 0, false)
			}
		}

		ids := readerIDs(apiGet(apiHost, apiPort, "/v3/paths/get/"+*path, apiTimeout))
		var wantIDR bool
		wantIDR, knownReaders = idrStep(knownReaders, ids, lastIDR, now, 2)
		if wantIDR && !*rpicamera {
			if !*dryRun {
				ctl.WriteToUDP([]byte("idr"), encoder)
			}
			t := now
			lastIDR = &t
			idrTotal++
			say("viewer joined %s (%d now); keyframe requested", *path, len(ids))
		}

		if now < nextRate {
			continue
		}
		nextRate = now + *interval
		if *managed {
			current := apiGet(apiHost, apiPort, cameraConfig, apiTimeout)
			bitrate, ok := current["rpiCameraBitrate"].(float64)
			if !ok || current["source"] != "rpiCamera" || bitrate <= 0 {
				continue
			}
			if sent == nil || int(bitrate) != *sent*1000 {
				original = int(bitrate)
				sent = nil
			}
		}
		if pinger != nil {
			connections := apiGet(apiHost, apiPort, "/v3/srtconns/list", apiTimeout)
			if *managed {
				viewers = cameraViewers(connections, *path, "/var/run/mediamtx-srt-push.json", time.Now())
			} else {
				viewers = readerHosts(connections, apiGet(apiHost, apiPort, "/v3/rtspsessions/list", apiTimeout))
			}
			delays.forgetExcept(viewers)
			queue = nil
			if len(viewers) > 0 {
				if q, ok := delays.queueMs(); ok {
					queue = &q
				}
			}
			for host := range viewers {
				pinger.send(host, now)
			}
		}
		nowStations := readStations(*iface)
		var sample *LinkSample
		if len(nowStations) > 0 {
			sample = busiestDelta(prev, nowStations)
			prev = stationsByMAC(nowStations)
		}
		if !*fixed {
			state = decide(state, sample, policy, now, queue)
		}
		if low != nil && now >= nextProfileCheck {
			// mediamtx forgets the low picture when it restarts (uas-video-watchdog puts the
			// full one back): follow the camera, not our memory of it.
			nextProfileCheck = now + 10
			cur := apiGet(apiHost, apiPort, "/v3/config/paths/get/"+*path, apiTimeout)
			if _, ok := cur["rpiCameraWidth"]; ok {
				if isLow := isPicture(cur, *low); isLow != pstate.Low {
					pstate = ProfileState{Low: isLow, Since: now}
					prof := full
					policy = fullPolicy
					if isLow {
						prof, policy = *low, lowPolicy
					}
					state = NewRateState(prof.MinKbps)
					state.LastReason = "camera picture changed outside: following it"
					state.LastDown = now
					sent = nil
					writeVideoStatus(*videoStatus, prof, state.Kbps)
					say("camera is on %dx%d; following it", prof.Width, prof.Height)
				}
			}
		}
		if low != nil {
			var why string
			pstate, why = profileStep(pstate, state, sample, policy, pp, full, now, queue)
			if why != "" {
				prof, kbps := full, full.MinKbps
				policy = fullPolicy
				if pstate.Low {
					prof, kbps, policy = *low, low.MinKbps, lowPolicy
				}
				state = NewRateState(kbps)
				state.LastReason = why
				state.LastDown = now
				ok := *dryRun || apiPatch(apiHost, apiPort, "/v3/config/paths/patch/"+*path, prof.cameraPatch(kbps), apiTimeout)
				sent = nil
				refused := ""
				if ok {
					k := kbps
					sent = &k
				} else { // the camera kept its picture: so does the controller
					pstate = ProfileState{Low: !pstate.Low, Since: now}
					policy = fullPolicy
					if pstate.Low {
						policy = lowPolicy
					}
					refused = "; mediamtx refused"
				}
				say("%dx%d@%d, keyframe every %d frames, %d kbit/s (%s)%s",
					prof.Width, prof.Height, prof.FPS, prof.GOP, kbps, why, refused)
				writeVideoStatus(*videoStatus, prof, kbps)
			}
		}
		if sent == nil || abs(state.Kbps-*sent) >= 25 {
			if setBitrate(state.Kbps) {
				if sent != nil {
					say("%d -> %d kbit/s (%s)", *sent, state.Kbps, state.LastReason)
				}
				k := state.Kbps
				sent = &k
			}
		}

		reason := state.LastReason
		if *fixed {
			reason = "fixed"
		}
		status := map[string]any{"t": float64(time.Now().UnixNano()) / 1e9, "kbps": state.Kbps,
			"reason": reason, "readers": nil, "idr_requests": idrTotal, "min_kbps": *minKbps,
			"max_kbps": *maxKbps, "viewers": len(viewers), "queue_ms": nil, "picture": nil}
		if knownReaders != nil {
			status["readers"] = len(knownReaders)
		}
		if queue != nil {
			status["queue_ms"] = roundHalfEven(*queue)
		}
		if low != nil {
			status["picture"] = "full"
			if pstate.Low {
				status["picture"] = "low"
			}
		}
		if sample != nil {
			status["tx_packets"] = sample.TxPackets
			status["retry_ratio"] = math.Round(sample.RetryRatio()*1000) / 1000
			status["fail_ratio"] = math.Round(sample.FailRatio()*10000) / 10000
			status["expected_kbps"] = nil
			if sample.ExpectedKbps != 0 {
				status["expected_kbps"] = sample.ExpectedKbps
			}
		}
		writeJSON(*statusPath, status)
	}
}

// isPicture says whether mediamtx's path configuration has the camera on this picture.
func isPicture(conf map[string]any, p Profile) bool {
	w, _ := conf["rpiCameraWidth"].(float64)
	h, _ := conf["rpiCameraHeight"].(float64)
	return w == float64(p.Width) && h == float64(p.Height)
}

// readStations runs `iw dev <iface> station dump`; nil if it fails.
func readStations(iface string) []Station {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	out, err := exec.CommandContext(ctx, "iw", "dev", iface, "station", "dump").Output()
	if err != nil {
		return nil
	}
	return parseStationDump(string(out))
}

func stationsByMAC(list []Station) map[string]Station {
	m := make(map[string]Station, len(list))
	for _, s := range list {
		m[s.MAC] = s
	}
	return m
}

// writeVideoStatus keeps uas-video's description of the picture (uas-camera announces it)
// true after a switch.
func writeVideoStatus(path string, p Profile, kbps int) {
	data, err := os.ReadFile(path)
	if err != nil {
		return
	}
	var doc map[string]any
	if json.Unmarshal(data, &doc) != nil || doc == nil {
		return
	}
	doc["width"], doc["height"], doc["fps"], doc["kbps"] = p.Width, p.Height, p.FPS, kbps
	writeJSON(path, doc)
}

// writeJSON replaces path in one step, so readers never see half a file.
func writeJSON(path string, v any) {
	data, err := json.Marshal(v)
	if err != nil {
		return
	}
	if os.WriteFile(path+".tmp", data, 0o644) == nil {
		os.Rename(path+".tmp", path)
	}
}

func say(format string, a ...any) { fmt.Printf("uas-videorate: "+format+"\n", a...) }

func fatal(format string, a ...any) {
	fmt.Fprintf(os.Stderr, "uas-videorate: "+format+"\n", a...)
	os.Exit(2)
}

func abs(x int) int {
	if x < 0 {
		return -x
	}
	return x
}
