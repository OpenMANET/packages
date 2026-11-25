//go:build linux

package main

import (
	"net"
	"os"
	"syscall"
)

// Pinger sends echo requests to the viewers on a raw socket (root on the air node), marked
// as video, and never blocks: send each interval, collect the answers, expire the ones that
// never came.
type Pinger struct {
	fd       int
	ident    uint16
	seq      uint16
	timeoutS float64
	pending  map[uint16]pendingEcho
}

type pendingEcho struct {
	host string
	sent float64
}

// echoResult is one answered echo.
type echoResult struct {
	host string
	ms   float64
}

// newPinger opens the raw ICMP socket; it needs CAP_NET_RAW.
func newPinger(timeoutS float64) (*Pinger, error) {
	fd, err := syscall.Socket(syscall.AF_INET, syscall.SOCK_RAW|syscall.SOCK_NONBLOCK|syscall.SOCK_CLOEXEC,
		syscall.IPPROTO_ICMP)
	if err != nil {
		return nil, err
	}
	if err := syscall.SetsockoptInt(fd, syscall.IPPROTO_IP, syscall.IP_TOS, tosAF21); err != nil {
		syscall.Close(fd)
		return nil, err
	}
	return &Pinger{fd: fd, ident: uint16(os.Getpid() & 0xffff), timeoutS: timeoutS,
		pending: map[uint16]pendingEcho{}}, nil
}

// send sends one echo to host (an IPv4 address).
func (p *Pinger) send(host string, now float64) {
	p.seq++
	ip := net.ParseIP(host).To4()
	if ip == nil {
		return
	}
	var to syscall.SockaddrInet4
	copy(to.Addr[:], ip)
	if syscall.Sendto(p.fd, echoRequest(p.ident, p.seq), 0, &to) == nil {
		p.pending[p.seq] = pendingEcho{host, now}
	}
}

// collect reads every answer that has arrived.
func (p *Pinger) collect(now float64) []echoResult {
	var out []echoResult
	buf := make([]byte, 2048)
	for {
		n, _, err := syscall.Recvfrom(p.fd, buf, 0)
		if err != nil { // EAGAIN: nothing more for now
			return out
		}
		seq, ok := parseEchoReply(buf[:n], p.ident)
		if !ok {
			continue
		}
		if e, ok := p.pending[seq]; ok {
			delete(p.pending, seq)
			out = append(out, echoResult{e.host, (now - e.sent) * 1000})
		}
	}
}

// expire gives up on echoes older than the timeout: the hosts they were sent to.
func (p *Pinger) expire(now float64) []string {
	var lost []string
	for seq, e := range p.pending {
		if now-e.sent > p.timeoutS {
			lost = append(lost, e.host)
			delete(p.pending, seq)
		}
	}
	return lost
}
