package main

// rtt is one echo: when it was recorded and its round trip (ok false: lost).
type rtt struct {
	t, ms float64
	ok    bool
}

// DelayTracker keeps each viewer's round trips over the last WindowS seconds.
//
// queueMs is the largest amount by which a viewer's latest round trip exceeds its lowest
// in the window: the queueing the video meets on the way, since the lowest is the path
// with nothing queued. A late echo counts at its real delay (the Pinger waits 5 s for it).
// A lost one counts only when LostRun in a row are lost, as LostMs: the tablet's own Wi-Fi
// drops 15-26 % of them at random (2026-10-25), which is not a queue.
type DelayTracker struct {
	WindowS float64
	LostMs  float64
	LostRun int
	samples map[string][]rtt
}

// NewDelayTracker is the standard tracker: one minute, three lost in a row = 1 s.
func NewDelayTracker() *DelayTracker {
	return &DelayTracker{WindowS: 60, LostMs: 1000, LostRun: 3, samples: map[string][]rtt{}}
}

// add records one echo for host; ok false means it was lost.
func (d *DelayTracker) add(host string, now, ms float64, ok bool) {
	q := append(d.samples[host], rtt{now, ms, ok})
	for len(q) > 0 && now-q[0].t > d.WindowS {
		q = q[1:]
	}
	d.samples[host] = q
}

// forgetExcept drops the viewers that are gone.
func (d *DelayTracker) forgetExcept(hosts map[string]struct{}) {
	for h := range d.samples {
		if _, keep := hosts[h]; !keep {
			delete(d.samples, h)
		}
	}
}

// queueMs is the worst viewer's queueing delay, or false when no viewer has enough echoes.
func (d *DelayTracker) queueMs() (float64, bool) {
	worst, have := 0.0, false
	for _, q := range d.samples {
		allLost := len(q) >= d.LostRun
		if allLost {
			for _, s := range q[len(q)-d.LostRun:] {
				if s.ok {
					allLost = false
					break
				}
			}
		}
		var extra float64
		if allLost {
			extra = d.LostMs
		} else {
			n, lowest, last := 0, 0.0, 0.0
			for _, s := range q {
				if s.ok {
					if n == 0 || s.ms < lowest {
						lowest = s.ms
					}
					last = s.ms
					n++
				}
			}
			if n < 2 {
				continue
			}
			extra = last - lowest
		}
		if !have || extra > worst {
			worst, have = extra, true
		}
	}
	return worst, have
}
