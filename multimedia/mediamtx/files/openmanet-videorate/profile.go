package main

import (
	"fmt"
	"math"
	"strconv"
	"strings"
)

// Profile is a camera picture: what the encoder is asked for.
type Profile struct {
	Width, Height int
	FPS           int
	GOP           int // frames between keyframes
	MinKbps       int
	MaxKbps       int
}

// cameraPatch is the mediamtx path change that puts the ribbon camera on this picture.
func (p Profile) cameraPatch(kbps int) map[string]any {
	return map[string]any{"rpiCameraWidth": p.Width, "rpiCameraHeight": p.Height,
		"rpiCameraFPS": p.FPS, "rpiCameraIDRPeriod": p.GOP, "rpiCameraBitrate": kbps * 1000}
}

// ProfilePolicy says when the picture changes. Each change restarts the camera and drops
// the viewers (their players reconnect), so it is kept rare.
type ProfilePolicy struct {
	EnterAfterS float64 // at the floor and still struggling this long: go low
	HoldLowS    float64 // at least this long in low before going back
	LeaveAfterS float64 // link good enough this long: go back to full
	LeaveMargin float64 // expected throughput x share must reach the full floor x this
	MinGapS     float64 // between any two switches
}

// NewProfilePolicy is the standard switching policy.
func NewProfilePolicy() ProfilePolicy {
	return ProfilePolicy{EnterAfterS: 4, HoldLowS: 30, LeaveAfterS: 10, LeaveMargin: 1.5, MinGapS: 30}
}

// ProfileState is which picture is on, and since when.
type ProfileState struct {
	Low       bool
	Since     float64 // the last switch (-Inf: none yet)
	Bad       bool    // full picture: at the floor and struggling since BadSince
	BadSince  float64
	Good      bool // low picture: strong enough for full since GoodSince
	GoodSince float64
}

// NewProfileState is the full picture, never switched.
func NewProfileState() ProfileState { return ProfileState{Since: math.Inf(-1)} }

// profileStep says whether to change the picture: the new state and, when it switches, why
// ("" otherwise). Pure. rate is the bitrate decision just made; p is the policy in force
// (the current picture's floor).
func profileStep(ps ProfileState, rate RateState, sample *LinkSample, p Policy, pp ProfilePolicy,
	full Profile, now float64, queue *float64) (ProfileState, string) {
	if sample == nil || sample.TxPackets == 0 {
		return ps, ""
	}
	if !ps.Low {
		atFloor := rate.Kbps <= p.MinKbps
		queueing := queue != nil && *queue > p.DelayBadMs
		failing := sample.TxFailed >= p.FailMin && sample.FailRatio() > p.FailBad
		tooThin := sample.ExpectedKbps != 0 && sample.ExpectedKbps*p.Share < float64(p.MinKbps)
		bad, badSince := ps.Bad, ps.BadSince
		if atFloor && (queueing || failing || tooThin) {
			if !bad {
				bad, badSince = true, now
			}
		} else {
			bad = false
		}
		if bad && now-badSince >= pp.EnterAfterS && now-ps.Since >= pp.MinGapS {
			var what string
			switch {
			case queueing:
				what = "queue +" + strconv.FormatFloat(*queue, 'f', 0, 64) + " ms"
			case failing:
				what = "frames failing"
			default:
				what = "expected " + strconv.FormatFloat(sample.ExpectedKbps, 'f', 0, 64) + " kbit/s"
			}
			return ProfileState{Low: true, Since: now},
				fmt.Sprintf("link too weak for %d kbit/s (%s): smaller picture", p.MinKbps, what)
		}
		return ProfileState{Low: false, Since: ps.Since, Bad: bad, BadSince: badSince}, ""
	}
	strong := sample.ExpectedKbps != 0 && sample.ExpectedKbps*p.Share >= float64(full.MinKbps)*pp.LeaveMargin
	clean := queue == nil || *queue <= p.DelayGoodMs
	good, goodSince := ps.Good, ps.GoodSince
	if strong && clean {
		if !good {
			good, goodSince = true, now
		}
	} else {
		good = false
	}
	if good && now-goodSince >= pp.LeaveAfterS && now-ps.Since >= math.Max(pp.HoldLowS, pp.MinGapS) {
		return ProfileState{Low: false, Since: now},
			"link carries " + strconv.FormatFloat(sample.ExpectedKbps, 'f', 0, 64) + " kbit/s again: full picture"
	}
	return ProfileState{Low: true, Since: ps.Since, Good: good, GoodSince: goodSince}, ""
}

// parseSize reads "640x360".
func parseSize(text string) (int, int, error) {
	w, h, ok := strings.Cut(strings.ToLower(text), "x")
	if !ok {
		return 0, 0, fmt.Errorf("picture size %q: want WxH", text)
	}
	wi, err1 := strconv.Atoi(w)
	hi, err2 := strconv.Atoi(h)
	if err1 != nil || err2 != nil {
		return 0, 0, fmt.Errorf("picture size %q: want WxH", text)
	}
	return wi, hi, nil
}
