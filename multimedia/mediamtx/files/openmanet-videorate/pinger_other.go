//go:build !linux

package main

import "errors"

// Pinger needs a Linux raw socket; elsewhere the queue check is off and the controller
// judges the link by its station counters only.
type Pinger struct{}

type echoResult struct {
	host string
	ms   float64
}

func newPinger(float64) (*Pinger, error) { return nil, errors.New("raw ICMP needs Linux") }

func (p *Pinger) send(string, float64)         {}
func (p *Pinger) collect(float64) []echoResult { return nil }
func (p *Pinger) expire(float64) []string      { return nil }
