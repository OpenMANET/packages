# EU mesh test build

These changes make EU mesh available through the normal LuCI country picker.
There is no separate permanent EU configuration and no hidden enable flag.
First-boot country, channel, power, and module defaults remain the original
normal defaults. The firmware files are labeled `1.8-eu` only to identify an
experimental build that should not be mistaken for a general release.

## Use the normal wizard

Back up configuration and use the image matching the exact hardware. Open the
normal LuCI setup wizard, select country **EU**, and configure the mesh as usual.
The country picker chooses a compatible 1 MHz channel/width pair. Set every peer
to the same country, channel, bandwidth, mesh ID, passphrase, and security mode.
No SSH commands or special enable flags are required.

With country EU or GB, netifd defaults omitted transmit power to 16 dBm and
limits higher retained values to 16 dBm. Lower integer settings remain allowed.
Automatic duty cycling must be enabled in the loaded driver in spread mode;
these are the driver's normal defaults. Missing parameters, disabled duty
cycling, SVT mode, or an incompatible bandwidth prevent mesh startup.
AP/adhoc behavior and non-EU behavior are otherwise unchanged.

The duty-cycled 863–868 MHz wideband-data limit is 25 mW ERP (about 16.13 dBm
EIRP). The configured power is still subject to BCF/driver limits, and antenna
gain minus cable loss must be included in the EIRP budget. Reduce conducted
power as necessary. This initialization work does not establish compliance of
a complete installation or mesh implementation.

Sources: [EU Decision 2025/105](https://eur-lex.europa.eu/eli/dec_impl/2025/105/oj/eng/pdf),
[Gateworks GW16167 guidance](https://trac.gateworks.com/wiki/expansion/gw16167),
[OpenMANET discussion 79](https://github.com/orgs/OpenMANET/discussions/79),
[Morse Micro engineering response](https://community.morsemicro.com/t/802-11s-mesh-for-eu-bands/1355/10).

## Hardware evidence and limits

On November 11, 2026, manet01 (CM4 / Gateworks MM8108 USB) was tested with driver
`2.2.3-g270da473`, firmware 2.2.3 and BCF `bcf_boardtype_0807.bin`.
An earlier explicit-enable version of the integration initialized EU mesh at
865.5 MHz / 1 MHz / 0 dBm, reached `MESH-GROUP-STARTED`, activated the BATMAN
interface, reported a 2.80% spread duty cycle with control responses included,
and passed firmware health checks. A radio down/up cycle repeated the result.
Both NL and EU driver initialization had already succeeded on this newer driver.

No second EU peer was available. Peer formation, forwarding, throughput,
independent power/airtime measurements, the final wizard flow on real hardware,
and EU mesh at 16 dBm remain unverified. The HaLowLink 2 image has not been
boot-tested here. Building/publishing these test images does not flash any node;
manet01 remains on its original US settings.

Verify a test node using `morse_cli -i wlh0 channel`,
`morse_cli -i wlh0 duty_cycle`, `morse_cli -i wlh0 health`, `iw dev wlh0 info`,
`batctl if`, and the `MESH-GROUP-STARTED` log. `iw` shows synthetic 802.11ac
channel mappings; `morse_cli channel` reports the actual HaLow RF frequency.
A firmware-configured duty cycle is not an independent airtime measurement.

## Source validation

```sh
python -m unittest discover -s morse-micro/netifd-morse/tests -v
node luci/luci-app-ekhwizards/tests/test_country_selection.js
node luci/luci-app-ekhwizards/tests/test_mesh_wizard_address_reservation.js
node luci/luci-app-morseconfig/tests/test_quick_config.js
node luci/luci-app-morseconfig/tests/test_batman_setup.js
sh -n morse-micro/netifd-morse/lib/netifd/wireless/morse.sh
git diff --check
```

Tests exercise real shell and wizard code with hardware/UI operations stubbed.
They cover EU/GB selection, normal US behavior, default and reduced power,
retained power above the EU ceiling, duty-cycle and bandwidth rejection, and
existing configuration preservation. Release CI separately inspects the actual
root filesystems of the HaLowLink 2 and Pi 4/CM4 MM8108 USB images.
