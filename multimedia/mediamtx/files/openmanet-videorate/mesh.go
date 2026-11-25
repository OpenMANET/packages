package main

import (
	"context"
	"encoding/json"
	"net"
	"os"
	"os/exec"
	"sort"
	"strconv"
	"strings"
	"time"
)

type meshHop struct {
	Radio string `json:"hard_ifname"`
	Peer  string `json:"neigh_address"`
}
type meshRow struct {
	meshHop
	Origin string `json:"orig_address"`
	Best   bool   `json:"best"`
}

func query(ctx context.Context, name string, args ...string) string {
	out, err := exec.CommandContext(ctx, name, args...).Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(out))
}

// A viewer beyond the mesh gateway shares the gateway's first hop.
func meshRoutes(viewers map[string]struct{}) map[string]meshHop {
	result := make(map[string]meshHop)
	if len(viewers) == 0 {
		return result
	}
	ctx, cancel := context.WithTimeout(context.Background(), 800*time.Millisecond)
	defer cancel()
	var rows []meshRow
	if json.Unmarshal([]byte(query(ctx, "batctl", "meshif", "bat0", "oj")), &rows) != nil {
		return result
	}
	best := make(map[string]meshHop)
	for _, r := range rows {
		if r.Best && r.Radio != "" && r.Peer != "" {
			best[strings.ToLower(r.Origin)] = r.meshHop
		}
	}
	arp, err := os.ReadFile("/proc/net/arp")
	if err != nil {
		return result
	}
	macs := make(map[[2]string]string)
	for _, line := range strings.Split(string(arp), "\n") {
		f := strings.Fields(line)
		if len(f) != 6 {
			continue
		}
		flags, _ := strconv.ParseUint(f[2], 0, 32)
		if flags&2 != 0 {
			macs[[2]string{f[0], f[5]}] = f[3]
		}
	}
	for ip := range viewers {
		if net.ParseIP(ip).To4() == nil {
			continue
		}
		dest, dev := ip, ""
		fields := strings.Fields(query(ctx, "ip", "-4", "route", "get", ip))
		for i := 0; i+1 < len(fields); i++ {
			switch fields[i] {
			case "via":
				dest = fields[i+1]
			case "dev":
				dev = fields[i+1]
			}
		}
		mac := macs[[2]string{dest, dev}]
		if mac == "" {
			continue
		}
		if dev != "bat0" {
			if _, err := os.Stat("/sys/class/net/" + dev + "/brif/bat0"); err != nil {
				continue
			}
		}
		orig := strings.ToLower(query(ctx, "batctl", "meshif", "bat0", "translate", mac))
		if hop, ok := best[orig]; ok {
			result[ip] = hop
		}
	}
	return result
}

type meshCounters map[meshHop]Station

// Only compare counters from consecutive observations of the same radio and peer.
// Several viewers behind one relay share one station sample.
func (prev meshCounters) sample(routes map[string]meshHop, read func(string) []Station) (meshCounters, []*LinkSample) {
	next := make(meshCounters)
	dumps := make(map[string]map[string]Station)
	var samples []*LinkSample
	hosts := make([]string, 0, len(routes))
	for host := range routes {
		hosts = append(hosts, host)
	}
	sort.Strings(hosts)
	for _, host := range hosts {
		hop := routes[host]
		if _, seen := next[hop]; seen {
			continue
		}
		if _, readAlready := dumps[hop.Radio]; !readAlready {
			dumps[hop.Radio] = stationsByMAC(read(hop.Radio))
		}
		cur, ok := dumps[hop.Radio][hop.Peer]
		if !ok {
			continue
		}
		next[hop] = cur
		if old, ok := prev[hop]; ok {
			s := busiestDelta(map[string]Station{hop.Peer: old}, []Station{cur})
			if s != nil && s.TxPackets > 0 {
				samples = append(samples, s)
			}
		}
	}
	return next, samples
}

// A shared encoder must respect the most restrictive active first hop.
func limitingSample(samples []*LinkSample, state RateState, policy Policy, now float64, queue *float64) *LinkSample {
	var chosen *LinkSample
	lowest := 0
	for _, s := range samples {
		kbps := decide(state, s, policy, now, queue).Kbps
		if chosen == nil || kbps < lowest {
			chosen, lowest = s, kbps
		}
	}
	return chosen
}
