# EU mesh initialization experiment

This branch adds an explicit `enable_eu_mesh` wifi-device option for low-power
bench testing with the Morse 2.2 stack. Normal configurations retain the existing
EU/GB mesh restriction. This is an initialization experiment, not a claim of
regulatory certification or usable mesh throughput.

The option permits a mesh interface only with:

- Country `EU` or `GB` and a valid fixed channel.
- `s1g_chanbw=1` and `txpower=0` (0 dBm, nominally 1 mW).
- `svt_restricted_mode` unset or disabled.
- The loaded driver reporting `enable_auto_duty_cycle=Y` and `duty_cycle_mode=0`
  (spread). Missing driver parameters fail the check.

AP and adhoc behavior is unchanged. This option does not enable DCS or change
regulatory tables, BCF contents, firmware, or duty-cycle values. It deliberately
requires the explicit `EU`/`GB` country rather than relying on how older drivers
handle country aliases such as `NL`.

## Configure a prepared test node

Preserve a backup and use a management link independent of the HaLow radio.
Install this branch's `netifd-morse` script/package first. For manet01's existing
`radio1` and mesh interface:

```sh
uci set wireless.radio1.country=EU
uci set wireless.radio1.channel=5
uci set wireless.radio1.s1g_chanbw=1
uci set wireless.radio1.txpower=0
uci set wireless.radio1.enable_eu_mesh=1
uci set wireless.radio1.enable_auto_duty_cycle=1
uci set wireless.radio1.duty_cycle_mode=0
uci set wireless.radio1.svt_restricted_mode=0
uci commit wireless
```

When first adding the option, restart netifd through `/etc/init.d/network restart`
to load the updated driver schema; this briefly interrupts management networking.
Subsequent `wifi down radio1; wifi up radio1` cycles use the loaded schema.

Verify the actual radio, not just UCI:

```sh
cat /sys/module/morse/parameters/country
iw dev wlh0 info
morse_cli -i wlh0 channel
morse_cli -i wlh0 duty_cycle
morse_cli -i wlh0 health
batctl if
logread | grep MESH-GROUP-STARTED
```

`iw` displays synthetic 802.11ac channel mappings for HaLow. Use `morse_cli
channel` to establish the actual RF frequency and bandwidth.

## manet01 validation, November 11, 2026

- CM4, Gateworks MM8108 USB, driver `2.2.3-g270da473`, firmware package 2.2.3,
  BCF `bcf_boardtype_0807.bin`.
- Applied only the changed netifd script and explicit UCI settings, with an
  independent rollback watchdog. No firmware image was flashed.
- The installed script matched this branch's script byte for byte.
- EU mesh reached `MESH-GROUP-STARTED`; `batctl if` reported `wlh0: active`.
- `morse_cli channel`: 865500 kHz, operating/primary bandwidth 1 MHz.
- `iw`: 0.00 dBm. Requests of -1 mBm and -1000 mBm were rejected by this stack;
  0 dBm is its lowest accepted setting through `iw`.
- `morse_cli duty_cycle`: spread, configured duty cycle 2.80%, control responses
  included in the budget. This queries firmware configuration; it does not
  independently measure transmitted airtime.
- Firmware health check succeeded. No second EU peer was configured, so peer
  formation, forwarding, throughput, and independently measured RF power/airtime
  remain unverified.
- A subsequent radio down/up cycle again reached `MESH-GROUP-STARTED` with the
  same frequency, bandwidth, power, duty-cycle configuration, and healthy firmware.

The requested EU/1 MHz/0 dBm configuration is left on manet01. Backups and the
US-at-0-dBm rollback script are in `/root/eu-mesh-trial-20261111/` on the node.
Run `sh /root/eu-mesh-trial-20261111/restore.sh` from an independent management
link to restore the prior script/configuration while retaining low power.

## Validation commands

```sh
python -m unittest discover -s morse-micro/netifd-morse/tests -v
sh -n morse-micro/netifd-morse/lib/netifd/wireless/morse.sh
git diff --check
```

The shell tests run the real interface-creation logic with interface operations
stubbed. They cover explicit opt-in, missing/disabled duty cycling, burst mode,
wrong country/power/bandwidth, automatic or invalid channels, firmware mode
restrictions, and preservation of existing US/AP/adhoc behavior.

## Background

- [OpenMANET discussion 79](https://github.com/orgs/OpenMANET/discussions/79)
  reports older-driver `NL` initialization failures.
- [Morse Micro engineering response](https://community.morsemicro.com/t/802-11s-mesh-for-eu-bands/1355/10)
  distinguishes the `NL` versus `EU` driver issue from mesh restrictions and
  describes fixed-channel operation with duty cycling and poor expected EU mesh
  performance.

On this node's newer driver, both `NL` and `EU` already initialize. The change
here addresses the remaining explicit netifd mesh restriction in a constrained,
opt-in configuration.
