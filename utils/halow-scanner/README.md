# HaLow scanner for OpenWrt

Packages [lmlsna/halow_scanner](https://github.com/lmlsna/halow_scanner) at commit
`e48bb8881d393738f17853b02a9c761fdd6d0ba0`, including its channel CSV. Select
`CONFIG_PACKAGE_halow-scanner=y`; this selects NumPy, pyrtlsdr and librtlsdr.
The pyrtlsdr binding is pinned to 0.3.0 for the firmware's librtlsdr 2.0.1 ABI;
newer bindings require symbols that this library does not provide.
A separate RTL-SDR USB receiver and suitable antenna are required. Another
program such as dump1090 must release that SDR before scanning.

```sh
halow-scanner --help
halow-scanner -r US -b 2
```

## Scan with local HaLow transmissions stopped

Find the HaLow `wifi-device` section in `/etc/config/wireless`: the MM6108 uses
`type 'morse'`; native S1G radios such as MM8108 use `band 's1g'`. From Ethernet
or a local console, run (replace `radio0` with that section's name):

```sh
halow-scanner --radio radio0 -r US -b 2
```

The wrapper validates the selected radio, records its runtime state, uses
`ubus call network.wireless down '{"device":"radio0"}'`, waits for shutdown,
and runs the scan. It restores a previously active radio with the matching
`up` call when the scan exits, fails, or receives INT, TERM or HUP. A radio that
was already down stays down. It does not change or commit UCI settings. Other
radios remain active; run without `--radio` to leave all radios alone.

Stopping the radio interrupts any mesh/management connection carried over it.
Use Ethernet or console; a lost SSH connection can terminate the scan. SIGKILL,
power loss, and a crashed netifd cannot be handled by cleanup. If restoration
fails, the wrapper reports an error; restore manually with `wifi up radio0`.
Concurrent wrapper scans are prevented by a process lock.

The upstream scanner samples at 2.4 MHz by default. Its 4/8 MHz options only
measure the portion within the sampled bandwidth, not the entire wide channel;
use 1/2 MHz scans for measurements within that sample rate. Results are relative
noise estimates, not calibrated RF power measurements. No automatic channel
change is performed.

Host lifecycle tests (mocked radio and SDR operations):

```sh
python3 -m unittest discover -s utils/halow-scanner/tests -v
```
