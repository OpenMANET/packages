package main

import "testing"

func TestViewerMovesBetweenRadios(t *testing.T) {
	h := meshHop{"wlh0", "aa"}
	m := meshHop{"phy2-mesh0", "bb"}
	routes := map[string]meshHop{"viewer": h}
	table := map[string][]Station{h.Radio: {{MAC: "aa", Expected: "1 Mbps"}, {MAC: "unrelated"}}, m.Radio: {{MAC: "bb", Expected: "12 Mbps"}}}
	read := func(iface string) []Station { return table[iface] }
	prev, s := meshCounters(nil).sample(routes, read)
	if len(s) != 0 {
		t.Fatal("first observation has no delta")
	}
	table[h.Radio][0].TxPackets += 30
	table[h.Radio][1].TxPackets += 1000
	prev, s = prev.sample(routes, read)
	if len(s) != 1 || s[0].TxPackets != 30 {
		t.Fatalf("wrong first-hop delta: %v", s)
	}
	routes["viewer"] = m
	prev, s = prev.sample(routes, read)
	if len(s) != 0 {
		t.Fatal("old counters crossed radio change")
	}
	table[m.Radio][0].TxPackets = 10
	_, s = prev.sample(routes, read)
	if len(s) != 1 || s[0].TxPackets != 10 || s[0].ExpectedKbps != 12000 {
		t.Fatalf("missing new radio counters: %v", s)
	}
}
func TestSharedEncoderUsesLimitingViewer(t *testing.T) {
	slow := &LinkSample{TxPackets: 20, ExpectedKbps: 500}
	fast := &LinkSample{TxPackets: 60, ExpectedKbps: 12000}
	for _, s := range [][]*LinkSample{{fast, slow}, {slow, fast}} {
		if limitingSample(s, NewRateState(1100), NewPolicy(125, 1100, .35), 10, nil) != slow {
			t.Fatal("ignored weakest viewer")
		}
	}
}
