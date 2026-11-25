package main

import "encoding/binary"

// tosAF21 marks the echo as video (DSCP AF21, as uas-qos marks the stream), so it waits in
// the radio queue the video waits in.
const tosAF21 = 18 << 2

var echoPayload = []byte("uas-videorate")

// icmpChecksum is the Internet checksum (RFC 1071).
func icmpChecksum(b []byte) uint16 {
	var sum uint64
	for i := 0; i+1 < len(b); i += 2 {
		sum += uint64(b[i])<<8 | uint64(b[i+1])
	}
	if len(b)%2 == 1 {
		sum += uint64(b[len(b)-1]) << 8
	}
	for sum>>16 != 0 {
		sum = (sum >> 16) + (sum & 0xffff)
	}
	return ^uint16(sum)
}

// echoRequest is an ICMP echo request with our id and sequence number.
func echoRequest(ident, seq uint16) []byte {
	pkt := make([]byte, 8+len(echoPayload))
	pkt[0] = 8 // echo request, code 0
	binary.BigEndian.PutUint16(pkt[4:], ident)
	binary.BigEndian.PutUint16(pkt[6:], seq)
	copy(pkt[8:], echoPayload)
	binary.BigEndian.PutUint16(pkt[2:], icmpChecksum(pkt))
	return pkt
}

// parseEchoReply is the sequence number of our echo reply in a raw IPv4 packet; false for
// anything else.
func parseEchoReply(packet []byte, ident uint16) (uint16, bool) {
	if len(packet) < 20 {
		return 0, false
	}
	ihl := int(packet[0]&0x0f) * 4
	if len(packet) < ihl+8 {
		return 0, false
	}
	m := packet[ihl:]
	if m[0] != 0 || m[1] != 0 || binary.BigEndian.Uint16(m[4:]) != ident {
		return 0, false
	}
	return binary.BigEndian.Uint16(m[6:]), true
}
