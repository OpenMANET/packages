package main

import (
	"strings"
	"testing"
)

// The decision rules: down fast on a struggling link, up slowly when clean, never above a
// share of the link's expected throughput. Ported case for case from the Python
// reference's tests (harness/tests/test_videorate.py).

var P = NewPolicy(250, 1500, 0.35)

func clean(expected float64) *LinkSample {
	return &LinkSample{TxPackets: 100, TxRetries: 5, TxFailed: 0, ExpectedKbps: expected}
}

func sample(tx, retries, failed int, expected float64) *LinkSample {
	return &LinkSample{tx, retries, failed, expected}
}

func q(ms float64) *float64 { return &ms }

func TestExpectedThroughputUnits(t *testing.T) {
	for text, want := range map[string]float64{"5.2Mbps": 5200, "650.0Kbps": 650, "5.2 Mbit/s": 5200,
		"7.52Mbps": 7520, "": 0, "garbage": 0} {
		if got := parseExpectedKbps(text); got != want {
			t.Errorf("parseExpectedKbps(%q) = %v, want %v", text, got, want)
		}
	}
}

func TestStrugglingLinkDropsTo70PercentButNotBelowMinimum(t *testing.T) {
	if s := decide(NewRateState(500), sample(100, 40, 0, 6000), P, 10, nil); s.Kbps != 350 {
		t.Errorf("40%% retries: %d, want 350", s.Kbps)
	}
	if s := decide(NewRateState(300), sample(100, 0, 2, 6000), P, 10, nil); s.Kbps != 250 {
		t.Errorf("2%% failed: %d, want 250 (floor)", s.Kbps)
	}
}

func TestClimbsOnlyAfterSettlingAndInSteps(t *testing.T) {
	s := NewRateState(500)
	for _, step := range []struct {
		now  float64
		want int
	}{{0, 500}, {4.9, 500}, {5.0, 550}, {6.0, 550}, {7.0, 600}} {
		s = decide(s, clean(6000), P, step.now, nil)
		if s.Kbps != step.want {
			t.Fatalf("at %v s: %d, want %d", step.now, s.Kbps, step.want)
		}
	}
}

func TestNeverExceedsShareOfExpectedThroughput(t *testing.T) {
	s := decide(NewRateState(1400), clean(2000), P, 100, nil)
	if s.Kbps != 700 || !strings.Contains(s.LastReason, "capped") {
		t.Errorf("got %d %q, want 700 capped (35 %% of 2 Mbit/s)", s.Kbps, s.LastReason)
	}
}

func TestModerateRetriesHoldAndNoTrafficHolds(t *testing.T) {
	if s := decide(NewRateState(600), sample(100, 20, 0, 6000), P, 10, nil); s.Kbps != 600 {
		t.Errorf("20%% retries: %d, want 600", s.Kbps)
	}
	s := decide(NewRateState(600), nil, P, 10, nil)
	if s.Kbps != 600 || !strings.Contains(s.LastReason, "holding") {
		t.Errorf("no traffic: %d %q", s.Kbps, s.LastReason)
	}
}

func TestBusiestPeerIsTheVideoPathAndCounterResetsAreIgnored(t *testing.T) {
	prev := map[string]Station{
		"aa": {MAC: "aa", TxPackets: 1000, TxRetries: 10},
		"bb": {MAC: "bb", TxPackets: 500},
	}
	now := []Station{
		{MAC: "aa", TxPackets: 1100, TxRetries: 40, TxFailed: 1, Expected: "4.0Mbps"},
		{MAC: "bb", TxPackets: 10}, // bb re-joined: counters reset
	}
	d := busiestDelta(prev, now)
	if d == nil || *d != (LinkSample{100, 30, 1, 4000}) {
		t.Errorf("got %+v", d)
	}
}

func TestStationDumpParse(t *testing.T) {
	dump := "Station 0c:bf:74:c7:0d:dc (on wlh0)\n" +
		"\tinactive time:\t30 ms\n\trx bytes:\t106421\n\trx packets:\t1084\n" +
		"\ttx bytes:\t20066\n\ttx packets:\t264\n\ttx retries:\t12\n\ttx failed:\t1\n" +
		"\tsignal:  \t-58 dBm\n\ttx bitrate:\t150.0 MBit/s VHT-MCS 7 40MHz short GI VHT-NSS 1\n" +
		"\texpected throughput:\t7.52Mbps\n\tmesh plink:\tESTAB\n" +
		"Station 0c:bf:74:00:00:01 (on wlh0)\n\ttx packets:\t5\n"
	got := parseStationDump(dump)
	want := []Station{{"0c:bf:74:c7:0d:dc", 264, 12, 1, "7.52Mbps"}, {"0c:bf:74:00:00:01", 5, 0, 0, ""}}
	if len(got) != 2 || got[0] != want[0] || got[1] != want[1] {
		t.Errorf("got %+v", got)
	}
}

func TestGrowingQueueDropsEvenWhenTheCountersLookFine(t *testing.T) {
	// 2026-10-25: 17 % retries and 0.3 % failed sat inside the counters' hold band while
	// the video queued 5-10 s deep. The queue check catches it.
	jammed := sample(100, 17, 0, 6000)
	if s := decide(NewRateState(1000), jammed, P, 10, nil); s.Kbps != 1000 || !strings.Contains(s.LastReason, "holding") {
		t.Errorf("counters alone: %d %q, want hold", s.Kbps, s.LastReason)
	}
	if s := decide(NewRateState(1000), jammed, P, 10, q(4000)); s.Kbps != 700 || !strings.Contains(s.LastReason, "queue") {
		t.Errorf("with the queue: %d %q, want 700", s.Kbps, s.LastReason)
	}
}

func TestQueueDropsWaitForTheQueueToDrain(t *testing.T) {
	s := decide(NewRateState(1000), clean(6000), P, 10, q(400))
	if s.Kbps != 700 {
		t.Fatalf("first drop: %d", s.Kbps)
	}
	s = decide(s, clean(6000), P, 11, q(380)) // still draining: no second drop yet
	if s.Kbps != 700 || !strings.Contains(s.LastReason, "draining") {
		t.Fatalf("draining: %d %q", s.Kbps, s.LastReason)
	}
	if s = decide(s, clean(6000), P, 12, q(300)); s.Kbps != 490 {
		t.Fatalf("second drop: %d, want 490", s.Kbps)
	}
	if s = decide(NewRateState(260), clean(6000), P, 99, q(900)); s.Kbps != 250 {
		t.Errorf("floor: %d", s.Kbps)
	}
}

func TestClimbingNeedsAShortQueueToo(t *testing.T) {
	s := NewRateState(500)
	for now := 0; now < 8; now++ {
		s = decide(s, clean(6000), P, float64(now), q(80)) // between good and bad: hold
	}
	if s.Kbps != 500 || !strings.Contains(s.LastReason, "holding") {
		t.Fatalf("80 ms: %d %q", s.Kbps, s.LastReason)
	}
	for now := 8; now < 14; now++ {
		s = decide(s, clean(6000), P, float64(now), q(10))
	}
	if s.Kbps != 550 {
		t.Errorf("10 ms: %d, want 550", s.Kbps)
	}
}

func TestWithAViewerMeasuredRetriesAloneDontDropOrBlockClimbing(t *testing.T) {
	// Minstrel at MCS7 through walls: 60 % retries, the video's queue short.
	busy := sample(100, 60, 0, 6000)
	s := decide(NewRateState(500), busy, P, 0, q(5))
	if s.Kbps != 500 {
		t.Fatalf("got %d", s.Kbps)
	}
	for now := 1; now < 8; now++ {
		s = decide(s, busy, P, float64(now), q(5))
	}
	if s.Kbps <= 500 {
		t.Errorf("did not climb: %d", s.Kbps)
	}
	// Without a viewer to measure, the same retries still count.
	if s := decide(NewRateState(500), busy, P, 0, nil); s.Kbps != 350 {
		t.Errorf("no viewer: %d, want 350", s.Kbps)
	}
}

func TestOneFailedFrameIsNotATrend(t *testing.T) {
	if s := decide(NewRateState(500), sample(48, 25, 1, 6000), P, 0, q(0)); s.Kbps != 500 {
		t.Errorf("1 failed: %d", s.Kbps)
	}
	if s := decide(NewRateState(500), sample(48, 25, 2, 6000), P, 0, q(0)); s.Kbps != 350 {
		t.Errorf("2 failed: %d", s.Kbps)
	}
}

func TestRetriesOverAHandfulOfFramesAreNotAStrugglingLink(t *testing.T) {
	// No viewer, link idle: 6 retries on 1 frame is a beacon, not a trend (2026-11-23 log).
	if s := decide(NewRateState(500), sample(1, 6, 0, 6000), P, 10, nil); s.Kbps != 500 || s.LastReason != "clean" {
		t.Errorf("1 frame: %d %q", s.Kbps, s.LastReason)
	}
	if s := decide(NewRateState(500), sample(20, 8, 0, 6000), P, 10, nil); s.Kbps != 350 {
		t.Errorf("40%% over 20 frames: %d, want 350", s.Kbps)
	}
}

func TestAfterAQueueDropItDoesNotClimbBackToTheRateThatQueued(t *testing.T) {
	p := NewPolicy(100, 1500, 0.35)
	s := decide(NewRateState(200), clean(705), p, 0, q(400))
	if s.Kbps != 140 {
		t.Fatalf("drop: %d", s.Kbps)
	}
	for now := 1; now < 29; now++ {
		s = decide(s, clean(705), p, float64(now), q(5))
	}
	if s.Kbps != 140 || !strings.Contains(s.LastReason, "which queued") {
		t.Fatalf("held: %d %q, want 140 (70 %% of 200)", s.Kbps, s.LastReason)
	}
	for now := 29; now < 40; now++ {
		s = decide(s, clean(705), p, float64(now), q(5))
	}
	if s.Kbps <= 140 {
		t.Errorf("memory did not expire after 30 s: %d", s.Kbps)
	}
}

func TestAStrongerLinkClearsTheMemoryAtOnce(t *testing.T) {
	p := NewPolicy(100, 1500, 0.35)
	s := decide(NewRateState(200), clean(705), p, 0, q(400))
	for now := 1; now < 10; now++ {
		s = decide(s, clean(7520), p, float64(now), q(5))
	}
	if s.Kbps <= 140 || s.Bad {
		t.Errorf("got %d bad=%v", s.Kbps, s.Bad)
	}
}
