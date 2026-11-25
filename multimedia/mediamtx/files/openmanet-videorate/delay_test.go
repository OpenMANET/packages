package main

import "testing"

func TestDelayTrackerMeasuresAboveEachViewersLowest(t *testing.T) {
	d := NewDelayTracker()
	expect := func(name string, want float64, wantOK bool) {
		t.Helper()
		if got, ok := d.queueMs(); ok != wantOK || (ok && got != want) {
			t.Errorf("%s: got %v %v, want %v %v", name, got, ok, want, wantOK)
		}
	}
	expect("nothing yet", 0, false)
	d.add("10.41.0.113", 0, 30, true)
	expect("one sample: no lowest yet", 0, false)
	d.add("10.41.0.113", 1, 230, true)
	d.add("10.41.0.120", 1, 15, true)
	d.add("10.41.0.120", 2, 20, true)
	expect("the worse viewer counts", 200, true)
	d.add("10.41.0.113", 2, 0, false) // one lost echo: Wi-Fi, not a queue
	d.add("10.41.0.113", 3, 0, false)
	expect("two lost", 200, true)
	d.add("10.41.0.113", 4, 0, false) // three in a row: nothing gets through
	expect("three lost", 1000, true)
	d.add("10.41.0.113", 9, 4030, true) // a late echo counts at its real delay
	expect("late echo", 4000, true)
	d.forgetExcept(map[string]struct{}{"10.41.0.120": {}})
	expect("viewer gone", 5, true)
	d.add("10.41.0.120", 100, 500, true) // the old lows have aged out
	expect("aged out", 0, false)
	d.add("10.41.0.120", 101, 520, true)
	expect("new lowest", 20, true)
}
