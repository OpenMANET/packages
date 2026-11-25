package main

import (
	"reflect"
	"strings"
	"testing"
)

var (
	FULL = Profile{1280, 720, 30, 15, 250, 1500}
	PP   = NewProfilePolicy()
)

// runProfile steps the picture switch once a second from t0 to t1, stopping at a switch.
func runProfile(ps ProfileState, kbps int, expected float64, queue *float64, t0, t1 int, p Policy) (ProfileState, string, int) {
	for now := t0; now < t1; now++ {
		var why string
		ps, why = profileStep(ps, NewRateState(kbps), clean(expected), p, PP, FULL, float64(now), queue)
		if why != "" {
			return ps, why, now
		}
	}
	return ps, "", -1
}

func TestLowPictureOnlyAfterFourSecondsAtTheFloorWithTheLinkStruggling(t *testing.T) {
	ps, why, at := runProfile(NewProfileState(), 250, 705, q(1500), 100, 110, P)
	if !ps.Low || at != 104 || !strings.Contains(why, "smaller picture") {
		t.Errorf("got low=%v at %d %q", ps.Low, at, why)
	}
	// Struggling but not at the floor yet: the bitrate goes down first.
	if ps, why, _ := runProfile(NewProfileState(), 400, 705, q(1500), 100, 130, P); ps.Low || why != "" {
		t.Errorf("above the floor switched: %q", why)
	}
	// At the floor on a clean link: nothing to fix.
	if ps, _, _ := runProfile(NewProfileState(), 250, 7520, q(3), 100, 130, P); ps.Low {
		t.Error("clean link switched")
	}
}

func TestALinkTooThinForTheFloorCountsWithoutAViewer(t *testing.T) {
	ps, why, _ := runProfile(NewProfileState(), 250, 325, nil, 100, 110, P)
	if !ps.Low || !strings.Contains(why, "expected 325") {
		t.Errorf("got low=%v %q", ps.Low, why)
	}
}

func TestBackToFullOnlyAfterHoldingLowAndTenStrongSeconds(t *testing.T) {
	lowp := NewPolicy(100, 400, 0.35)
	// Strong from t=1, but 30 s in low comes first.
	ps, why, at := runProfile(ProfileState{Low: true, Since: 0}, 100, 7520, q(3), 1, 60, lowp)
	if ps.Low || at != 30 || !strings.Contains(why, "full picture") {
		t.Errorf("got low=%v at %d %q", ps.Low, at, why)
	}
	// 705 kbit/s x 35 % does not carry 250 x 1.5: stays low.
	if ps, why, _ := runProfile(ProfileState{Low: true, Since: 0}, 100, 705, q(3), 1, 200, lowp); !ps.Low || why != "" {
		t.Errorf("left low on a weak link: %q", why)
	}
}

func TestAStrongSpellMustBeUnbroken(t *testing.T) {
	lowp := NewPolicy(100, 400, 0.35)
	ps := ProfileState{Low: true, Since: 0}
	ps, _, _ = runProfile(ps, 100, 7520, q(3), 40, 49, lowp) // 9 s strong
	ps, _, _ = runProfile(ps, 100, 705, q(3), 49, 50, lowp)  // one weak second
	if _, _, at := runProfile(ps, 100, 7520, q(3), 50, 70, lowp); at != 60 {
		t.Errorf("switched at %d, want 60 (10 s from 50)", at)
	}
}

func TestNoTwoSwitchesWithinThirtySeconds(t *testing.T) {
	ps := NewProfileState()
	ps.Since = 100 // just came back to full
	if _, _, at := runProfile(ps, 250, 325, nil, 101, 140, P); at != 130 {
		t.Errorf("switched at %d, want 130", at)
	}
}

func TestCameraPatchAndSize(t *testing.T) {
	if w, h, err := parseSize("640x360"); w != 640 || h != 360 || err != nil {
		t.Errorf("parseSize: %d %d %v", w, h, err)
	}
	if _, _, err := parseSize("640"); err == nil {
		t.Error("parseSize accepted 640")
	}
	low := Profile{640, 360, 15, 30, 100, 400}
	want := map[string]any{"rpiCameraWidth": 640, "rpiCameraHeight": 360, "rpiCameraFPS": 15,
		"rpiCameraIDRPeriod": 30, "rpiCameraBitrate": 150000}
	if got := low.cameraPatch(150); !reflect.DeepEqual(got, want) {
		t.Errorf("cameraPatch: %v", got)
	}
}
