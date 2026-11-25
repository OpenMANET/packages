package main

import "testing"

func TestEchoRequestAndReply(t *testing.T) {
	pkt := echoRequest(0x1234, 7)
	if icmpChecksum(pkt) != 0 {
		t.Error("checksum does not cover the whole message")
	}
	ipHeader := append([]byte{0x45}, make([]byte, 19)...)
	reply := append(append(append([]byte{}, ipHeader...), 0, 0), pkt[2:]...) // type 0: a reply
	if seq, ok := parseEchoReply(reply, 0x1234); !ok || seq != 7 {
		t.Errorf("our reply: %d %v", seq, ok)
	}
	if _, ok := parseEchoReply(reply, 0x9999); ok {
		t.Error("someone else's ping taken as ours")
	}
	if _, ok := parseEchoReply(append(append([]byte{}, ipHeader...), pkt...), 0x1234); ok {
		t.Error("a request taken as a reply")
	}
	if _, ok := parseEchoReply([]byte{0x45, 0, 0}, 0x1234); ok {
		t.Error("a short packet parsed")
	}
}
