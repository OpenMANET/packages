package main

import (
	"math"
	"regexp"
	"strconv"
	"strings"
)

// LinkSample is the busiest peer's counters over one interval.
type LinkSample struct {
	TxPackets    int
	TxRetries    int
	TxFailed     int
	ExpectedKbps float64 // minstrel's expected throughput; 0 when iw gave none
}

// RetryRatio is retries per frame sent.
func (s LinkSample) RetryRatio() float64 {
	if s.TxPackets > 0 {
		return float64(s.TxRetries) / float64(s.TxPackets)
	}
	return 0
}

// FailRatio is the share of frames that failed after all their retries.
func (s LinkSample) FailRatio() float64 {
	sent := s.TxPackets + s.TxFailed
	if sent > 0 {
		return float64(s.TxFailed) / float64(sent)
	}
	return 0
}

// Policy holds the controller's limits and thresholds.
type Policy struct {
	MinKbps         int
	MaxKbps         int
	Share           float64 // of the link's expected throughput
	StepKbps        int
	SettleS         float64 // clean time before climbing
	ClimbEveryS     float64
	Decrease        float64
	RetryBad        float64 // retry ratio that counts as a struggling link
	RetryGood       float64
	FailBad         float64 // 0.5 % of frames failing after all retries...
	FailMin         int     // ...and at least this many: one lost frame in 48 is not a trend
	DelayBadMs      float64 // viewer round trip over its recent lowest: the queue is growing
	DelayGoodMs     float64
	DownEveryS      float64 // between drops for a growing queue, so it can drain first
	MemoryS         float64 // after a drop, stay under the rate that went bad for this long...
	MemoryClear     float64 // ...unless the link's expected throughput grows by this factor
	RetryMinPackets int     // retries over fewer frames are noise: with no viewer, a few
	// beacons gave "retries 600%" and false drops (2026-11-23)
}

// NewPolicy is the standard policy between minKbps and maxKbps.
func NewPolicy(minKbps, maxKbps int, share float64) Policy {
	return Policy{MinKbps: minKbps, MaxKbps: maxKbps, Share: share, StepKbps: 50, SettleS: 5,
		ClimbEveryS: 2, Decrease: 0.7, RetryBad: 0.30, RetryGood: 0.15, FailBad: 0.005, FailMin: 2,
		DelayBadMs: 150, DelayGoodMs: 50, DownEveryS: 2, MemoryS: 30, MemoryClear: 1.5,
		RetryMinPackets: 20}
}

// RateState is what the controller remembers between steps.
type RateState struct {
	Kbps       int
	Clean      bool // the link has been clean since CleanSince
	CleanSince float64
	LastClimb  float64
	LastReason string
	LastDown   float64
	// The last drop: the rate that went bad, when, and the link's expected throughput then
	// (0: unknown). Climbing straight back to it re-queued the video in a fade (2026-11-23).
	Bad         bool
	BadKbps     int
	BadAt       float64
	BadExpected float64
}

// NewRateState starts at kbps with no history.
func NewRateState(kbps int) RateState {
	return RateState{Kbps: kbps, LastReason: "start", LastDown: math.Inf(-1), BadAt: math.Inf(-1)}
}

var expectedRe = regexp.MustCompile(`^\s*([\d.]+)\s*([kKmMgG]?)(?:bit/s|bps|b/s)`)

// parseExpectedKbps reads iw's "expected throughput" ("5.2Mbps", "650.0Kbps",
// "5.2 Mbit/s") in kbit/s; 0 when there is none.
func parseExpectedKbps(text string) float64 {
	m := expectedRe.FindStringSubmatch(text)
	if m == nil {
		return 0
	}
	v, err := strconv.ParseFloat(m[1], 64)
	if err != nil {
		return 0
	}
	switch strings.ToLower(m[2]) {
	case "k":
		return v
	case "m":
		return v * 1000
	case "g":
		return v * 1_000_000
	default:
		return v * 0.001
	}
}

// Station is one peer from `iw dev <mesh> station dump`, the fields the controller uses.
type Station struct {
	MAC       string
	TxPackets int
	TxRetries int
	TxFailed  int
	Expected  string // "expected throughput" as iw prints it
}

var stationRe = regexp.MustCompile(`^Station ([0-9a-f:]{17})`)

// parseStationDump reads `iw dev <mesh> station dump`, in the order iw lists the peers.
func parseStationDump(text string) []Station {
	var out []Station
	for _, line := range strings.Split(text, "\n") {
		line = strings.TrimRight(line, "\r")
		if m := stationRe.FindStringSubmatch(line); m != nil {
			out = append(out, Station{MAC: m[1]})
			continue
		}
		if len(out) == 0 || !strings.Contains(line, ":") {
			continue
		}
		key, val, _ := strings.Cut(strings.TrimSpace(line), ":")
		key, val = strings.TrimSpace(key), strings.TrimSpace(val)
		st := &out[len(out)-1]
		switch key {
		case "tx packets":
			st.TxPackets, _ = strconv.Atoi(val)
		case "tx retries":
			st.TxRetries, _ = strconv.Atoi(val)
		case "tx failed":
			st.TxFailed, _ = strconv.Atoi(val)
		case "expected throughput":
			st.Expected = val
		}
	}
	return out
}

// busiestDelta is the peer with the most transmitted packets since the last sample (the
// video path), or nil. A peer whose counters went backwards re-joined and is skipped.
func busiestDelta(prev map[string]Station, now []Station) *LinkSample {
	var best *LinkSample
	for _, cur := range now {
		old, ok := prev[cur.MAC]
		if !ok {
			continue
		}
		dTx := cur.TxPackets - old.TxPackets
		if dTx < 0 {
			continue
		}
		s := LinkSample{
			TxPackets:    dTx,
			TxRetries:    max(0, cur.TxRetries-old.TxRetries),
			TxFailed:     max(0, cur.TxFailed-old.TxFailed),
			ExpectedKbps: parseExpectedKbps(cur.Expected),
		}
		if best == nil || s.TxPackets > best.TxPackets {
			best = &s
		}
	}
	return best
}

// roundHalfEven rounds like the Python reference's round(), so the two builds pick the
// same bitrates.
func roundHalfEven(x float64) int { return int(math.RoundToEven(x)) }

// pct formats a ratio as a percentage with the given decimals ("40%", "2.6%").
func pct(x float64, decimals int) string {
	return strconv.FormatFloat(x*100, 'f', decimals, 64) + "%"
}

// decide is one step of the controller. Pure: it returns the new state.
//
// queue is how far the viewers' round trip sits above its recent lowest (DelayTracker),
// in ms, or nil when there is no viewer to measure.
func decide(st RateState, sample *LinkSample, p Policy, now float64, queue *float64) RateState {
	if sample == nil || sample.TxPackets == 0 {
		st.Clean = false
		st.LastReason = "no traffic to judge; holding"
		return st
	}
	kbps := st.Kbps
	clean, cleanSince := st.Clean, st.CleanSince
	lastClimb, lastDown := st.LastClimb, st.LastDown
	bad, badKbps, badAt, badExpected := st.Bad, st.BadKbps, st.BadAt, st.BadExpected
	wentBad := func() { bad, badKbps, badAt, badExpected = true, kbps, now, sample.ExpectedKbps }

	ceiling := p.MaxKbps
	if sample.ExpectedKbps != 0 {
		ceiling = min(ceiling, int(sample.ExpectedKbps*p.Share))
	}
	ceiling = max(p.MinKbps, ceiling)

	measured := queue != nil
	queueing := measured && *queue > p.DelayBadMs
	failing := sample.TxFailed >= p.FailMin && sample.FailRatio() > p.FailBad
	enough := sample.TxPackets >= p.RetryMinPackets
	var reason string
	switch {
	case failing || (!measured && enough && sample.RetryRatio() > p.RetryBad):
		wentBad()
		kbps = max(p.MinKbps, roundHalfEven(float64(kbps)*p.Decrease))
		reason = "link struggling (retries " + pct(sample.RetryRatio(), 0) + ", failed " + pct(sample.FailRatio(), 1) + "): down"
		clean = false
		lastDown = now
	case queueing:
		clean = false
		if now-lastDown >= p.DownEveryS {
			wentBad()
			kbps = max(p.MinKbps, roundHalfEven(float64(kbps)*p.Decrease))
			lastDown = now
			reason = "video queue growing (+" + strconv.FormatFloat(*queue, 'f', 0, 64) + " ms): down"
		} else {
			reason = "video queue growing (+" + strconv.FormatFloat(*queue, 'f', 0, 64) + " ms): draining"
		}
	case measured && *queue > p.DelayGoodMs:
		clean = false
		reason = "video queue +" + strconv.FormatFloat(*queue, 'f', 0, 64) + " ms: holding"
	case (measured || !enough || sample.RetryRatio() <= p.RetryGood) && sample.TxFailed < p.FailMin:
		if !clean {
			clean, cleanSince = true, now
		}
		reason = "clean"
		limit := ceiling
		if bad {
			improved := sample.ExpectedKbps != 0 && badExpected != 0 && sample.ExpectedKbps >= badExpected*p.MemoryClear
			if now-badAt >= p.MemoryS || improved {
				bad, badKbps, badExpected = false, 0, 0
			} else {
				limit = min(limit, max(p.MinKbps, roundHalfEven(float64(badKbps)*p.Decrease)))
			}
		}
		if now-cleanSince >= p.SettleS && now-lastClimb >= p.ClimbEveryS && kbps < limit {
			kbps = min(limit, kbps+p.StepKbps)
			lastClimb = now
			reason = "clean: up"
		} else if limit < ceiling && kbps >= limit {
			reason = "clean; holding under " + strconv.Itoa(badKbps) + " kbit/s, which queued"
		}
	default:
		clean = false
		reason = "retries " + pct(sample.RetryRatio(), 0) + ": holding"
	}

	if kbps > ceiling {
		kbps = ceiling
		reason += "; capped at " + pct(p.Share, 0) + " of expected throughput"
	}
	return RateState{Kbps: kbps, Clean: clean, CleanSince: cleanSince, LastClimb: lastClimb,
		LastReason: reason, LastDown: lastDown, Bad: bad, BadKbps: badKbps, BadAt: badAt,
		BadExpected: badExpected}
}
