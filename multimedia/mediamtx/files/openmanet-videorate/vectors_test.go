package main

import (
	"compress/gzip"
	"encoding/json"
	"math"
	"os"
	"reflect"
	"sort"
	"testing"
)

// testdata/vectors.json.gz holds random but repeatable sequences run through the Python
// reference (harness/tests/gen_videorate_vectors.py) with every output it gave. The Go
// build must give the same outputs, reason text included.

type vecSample []any // [tx, retries, failed, expected or null]

func (v vecSample) sample() *LinkSample {
	if v == nil {
		return nil
	}
	s := &LinkSample{TxPackets: int(v[0].(float64)), TxRetries: int(v[1].(float64)), TxFailed: int(v[2].(float64))}
	if e, ok := v[3].(float64); ok {
		s.ExpectedKbps = e
	}
	return s
}

type vectors struct {
	Decide []struct {
		Policy [3]float64 `json:"policy"`
		Start  int        `json:"start"`
		Steps  []struct {
			Now    float64   `json:"now"`
			Sample vecSample `json:"sample"`
			Queue  *float64  `json:"queue"`
			Out    struct {
				Kbps        int      `json:"kbps"`
				Reason      string   `json:"reason"`
				CleanSince  *float64 `json:"clean_since"`
				LastClimb   float64  `json:"last_climb"`
				LastDown    *float64 `json:"last_down"`
				BadKbps     *int     `json:"bad_kbps"`
				BadAt       *float64 `json:"bad_at"`
				BadExpected *float64 `json:"bad_expected"`
			} `json:"out"`
		} `json:"steps"`
	} `json:"decide"`
	Profile []struct {
		Start struct {
			Low   bool     `json:"low"`
			Since *float64 `json:"since"`
		} `json:"start"`
		Steps []struct {
			Now    float64   `json:"now"`
			Kbps   int       `json:"kbps"`
			Sample vecSample `json:"sample"`
			Queue  *float64  `json:"queue"`
			Out    struct {
				Low       bool     `json:"low"`
				Since     *float64 `json:"since"`
				BadSince  *float64 `json:"bad_since"`
				GoodSince *float64 `json:"good_since"`
				Reason    string   `json:"reason"`
			} `json:"out"`
		} `json:"steps"`
	} `json:"profile"`
	Delay [][]struct {
		Add    []any    `json:"add"`
		Forget []string `json:"forget"`
		Q      *float64 `json:"q"`
	} `json:"delay"`
	IDR []struct {
		Known   []string `json:"known"`
		NowIDs  []string `json:"now_ids"`
		LastIDR *float64 `json:"last_idr"`
		Now     float64  `json:"now"`
		Want    bool     `json:"want"`
		Out     []string `json:"out"`
	} `json:"idr"`
	Expected [][2]any `json:"expected"`
	Stations []struct {
		Dump     string `json:"dump"`
		Stations []struct {
			MAC       string `json:"mac"`
			TxPackets int    `json:"tx_packets"`
			TxRetries int    `json:"tx_retries"`
			TxFailed  int    `json:"tx_failed"`
			Expected  string `json:"expected"`
		} `json:"stations"`
	} `json:"stations"`
}

func loadVectors(t *testing.T) *vectors {
	t.Helper()
	f, err := os.Open("testdata/vectors.json.gz")
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	zr, err := gzip.NewReader(f)
	if err != nil {
		t.Fatal(err)
	}
	var v vectors
	if err := json.NewDecoder(zr).Decode(&v); err != nil {
		t.Fatal(err)
	}
	return &v
}

// orNever reads a JSON time where null means -Inf (never).
func orNever(p *float64) float64 {
	if p == nil {
		return math.Inf(-1)
	}
	return *p
}

func idSetOf(ids []string) idSet {
	if ids == nil {
		return nil
	}
	return set(ids...)
}

func TestVectorsDecide(t *testing.T) {
	v := loadVectors(t)
	steps := 0
	for i, seq := range v.Decide {
		p := NewPolicy(int(seq.Policy[0]), int(seq.Policy[1]), seq.Policy[2])
		st := NewRateState(seq.Start)
		for j, s := range seq.Steps {
			steps++
			st = decide(st, s.Sample.sample(), p, s.Now, s.Queue)
			o := s.Out
			ok := st.Kbps == o.Kbps && st.LastReason == o.Reason && st.LastClimb == o.LastClimb &&
				st.LastDown == orNever(o.LastDown) && st.BadAt == orNever(o.BadAt) &&
				st.Clean == (o.CleanSince != nil) && (o.CleanSince == nil || st.CleanSince == *o.CleanSince) &&
				st.Bad == (o.BadKbps != nil) && (o.BadKbps == nil || st.BadKbps == *o.BadKbps)
			wantExp := 0.0
			if o.BadExpected != nil {
				wantExp = *o.BadExpected
			}
			if st.Bad && st.BadExpected != wantExp {
				ok = false
			}
			if !ok {
				t.Fatalf("sequence %d step %d (now %v, sample %v, queue %v):\n  go     %+v\n  python %+v",
					i, j, s.Now, s.Sample, s.Queue, st, o)
			}
		}
	}
	t.Logf("%d decide steps match", steps)
}

func TestVectorsProfile(t *testing.T) {
	v := loadVectors(t)
	full, fullP, lowP, pp := FULL, NewPolicy(250, 1500, 0.35), NewPolicy(100, 400, 0.35), NewProfilePolicy()
	steps := 0
	for i, seq := range v.Profile {
		ps := ProfileState{Low: seq.Start.Low, Since: orNever(seq.Start.Since)}
		for j, s := range seq.Steps {
			steps++
			p := fullP
			if ps.Low {
				p = lowP
			}
			var why string
			ps, why = profileStep(ps, NewRateState(s.Kbps), s.Sample.sample(), p, pp, full, s.Now, s.Queue)
			o := s.Out
			ok := ps.Low == o.Low && ps.Since == orNever(o.Since) && why == o.Reason &&
				ps.Bad == (o.BadSince != nil) && (o.BadSince == nil || ps.BadSince == *o.BadSince) &&
				ps.Good == (o.GoodSince != nil) && (o.GoodSince == nil || ps.GoodSince == *o.GoodSince)
			if !ok {
				t.Fatalf("sequence %d step %d (now %v kbps %d sample %v queue %v):\n  go     %+v %q\n  python %+v",
					i, j, s.Now, s.Kbps, s.Sample, s.Queue, ps, why, o)
			}
		}
	}
	t.Logf("%d profile steps match", steps)
}

func TestVectorsDelayTracker(t *testing.T) {
	v := loadVectors(t)
	for i, ops := range v.Delay {
		d := NewDelayTracker()
		for j, op := range ops {
			if op.Add != nil {
				ms, ok := op.Add[2].(float64)
				d.add(op.Add[0].(string), op.Add[1].(float64), ms, ok)
			} else {
				d.forgetExcept(map[string]struct{}(set(op.Forget...)))
			}
			got, ok := d.queueMs()
			if ok != (op.Q != nil) || (ok && got != *op.Q) {
				t.Fatalf("sequence %d op %d: go %v %v, python %v", i, j, got, ok, op.Q)
			}
		}
	}
}

func TestVectorsIDR(t *testing.T) {
	v := loadVectors(t)
	for i, c := range v.IDR {
		want, kept := idrStep(idSetOf(c.Known), idSetOf(c.NowIDs), c.LastIDR, c.Now, 2)
		var keptList []string
		if kept != nil {
			keptList = []string{}
			for id := range kept {
				keptList = append(keptList, id)
			}
			sort.Strings(keptList)
		}
		if want != c.Want || !reflect.DeepEqual(keptList, c.Out) {
			t.Fatalf("case %d %+v: go %v %v", i, c, want, keptList)
		}
	}
}

func TestVectorsParsing(t *testing.T) {
	v := loadVectors(t)
	for _, e := range v.Expected {
		want, _ := e[1].(float64) // null: none, which the Go build reads as 0
		if got := parseExpectedKbps(e[0].(string)); got != want {
			t.Errorf("parseExpectedKbps(%q) = %v, python %v", e[0], got, e[1])
		}
	}
	for _, c := range v.Stations {
		got := parseStationDump(c.Dump)
		if len(got) != len(c.Stations) {
			t.Fatalf("stations: go %d, python %d", len(got), len(c.Stations))
		}
		for i, w := range c.Stations {
			if got[i] != (Station{w.MAC, w.TxPackets, w.TxRetries, w.TxFailed, w.Expected}) {
				t.Errorf("station %d: go %+v, python %+v", i, got[i], w)
			}
		}
	}
}
