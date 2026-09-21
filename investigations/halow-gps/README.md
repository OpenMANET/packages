# GPS investigation: report issues 2–4

Branch `investigate/halow-band-gps` is based on `feat/aiscot-halow-scanner` at dc866bd. No runtime changes. Issue 5 excluded.

## Confirmed findings

Run `python3 investigations/halow-gps/probe_gps.py`. This sources the actual board init scripts in child shells, stubbing every hardware/system command. It does not run host pkill or touch GPIO.

Observed:

- BCM271x + exact expected SPI path: initialization reached.
- BCM271x + reported USB path: script exits before initialization, status 0.
- BCM271x + no Morse device: initialization still runs. The current check is neither a reliable positive HAT detector nor a safe absence check.
- BCM271x and Raven, pkill unavailable: GPIO12=0 and GPIO25=0 are held; subsequent high and low reset requests both fail because GPIO25 is already held. No reset pulse occurs. The mock models exclusive requests, not electrical behavior.

Source: `boards/bsp-bcm271x/files/etc/init.d/gpsboard.init`, functions boot/check_morse_section/init_gps_gpio. Raven duplicates the pkill sequence in `boards/bsp-raven/files/etc/init.d/gpsboard.init`.

The local firmware `.config` has BUSYBOX_DEFAULT_PKILL disabled and no selected procps pkill package. This corroborates the reporter's command-not-found observation; no deployed rootfs was inspected. Both scripts suppress errors, and their gpioget diagnostics can also fail while gpioset exclusively holds a line.

## Proposed board-support MR: issues 2 and 3

1. Replace the Morse bus-path test with explicit GPS board identity/configuration independent of radio transport. Inspect a real WM1302 HAT's DT/EEPROM identity before choosing auto-detection; its availability is not established here. Provide an explicit WM1302 selection if positive detection is unavailable. Scope GPIO12/25 to the matching board; a UART path alone does not identify the HAT. Preserve a documented migration route for existing SPI installs. Raven already has a dedicated board package.
2. Own only this service's GPIO requests. Use tracked foreground gpioset child processes (no daemonize when tracking `$!`), or a small libgpiod helper holding the requests and changing reset in place. Prefer a single request owner to avoid release/reacquire glitches. Do not use global `killall gpioset`: it could terminate unrelated GPIO users, including reset helpers, and release WAKE.
3. Verify reset polarity and pulse timing against the actual carrier circuitry. Ensure WAKE remains active and reset is released throughout normal operation. Manage lifetime with procd/explicit stop cleanup and idempotent restarts; handle failed requests visibly and avoid leaving GPS asserted in reset. The local libgpiod is 2.1.3; validate its CLI semantics before using toggle/hold options.
4. Cover both BCM271x and Raven reset implementations, with board-specific polarity/consumer names intact. Declare any new runtime/build dependency, bump the affected BSP release(s), and retain unrelated line consumers.
5. Add tests for SPI/USB/no-radio with the correct board identity, missing/disabled GPS board, repeat start/stop, busy lines, missing command, and error propagation. Replace the current characterization expectations with corrected behavior.

Bench acceptance: reboot the reported CM4 + USB MM8108 + WM1302 configuration; confirm GPIO ownership and the electrical pulse with a logic analyzer, serial NMEA without manual intervention, and repeated restart behavior. Repeat with SPI HaLow, no HAT (no pin claiming), and Raven. Lack of pkill must not affect any case.

## Issue 4: controlled experiment before changing defaults

Status: hypothesis only. Local gpsd 3.25 sources contain active vendor probing (`drivers/drivers.c`, including UBX MON-VER/CFG-PRT) and u-blox configuration hooks (`drivers/driver_ubx.c`); read-only mode guards these paths. `utils/gpsd/files/gpsd.init` runs GPSD without -b, and has no validated UCI option to request it. The package version is 3.25, release 3.

1. Record module markings/firmware, antenna and supply configuration, and GPSD build. Stop GPSD and any other serial reader. Use a verified reset or power cycle to establish the same baseline before each arm; a reset may not clear retained configuration.
2. Capture raw /dev/ttyAMA0 at 9600 8N1, raw/no echo, with GPSD stopped. Save all bytes and timestamps; list sentence types, RMC validity, GGA fix quality and GSV satellite data. Keep antenna position, power and sky exposure constant. Use a fixed initial observation window (e.g. 15 minutes), extending for the receiver's documented cold-start conditions.
3. Reset to the same baseline, run GPSD with -b and matching baud, capture TPV/SKY plus raw/debug output. Only one process should own/read the UART at a time. GPSD documents -b as read-only mode: https://gpsd.io/gpsd.html .
4. Repeat from the same baseline with normal GPSD, capturing the outbound probes, response that selects u-blox, sentence changes, and time-to-fix. Repeated order-swapped runs help distinguish configuration effects from acquisition time.
5. If raw/read-only acquire but normal mode reproducibly alters sentences or prevents acquisition, add an optional validated UCI read-only flag translated to -b, with a default scoped to the confirmed module/board. Test enabled/disabled/default argument construction using the existing `utils/gpsd/test.sh` style, bump gpsd release, and check PPS/time operation plus normal u-blox receiver behavior.
6. If raw capture also lacks fix, investigate antenna power/RF path, supply, reset/standby state and retained receiver configuration. A GPSD driver label, parsed time or leapseconds is not enough to establish satellite reception or causality. Do not globally remove the u-blox driver.

## Integration

Land on top of the existing packages branch; firmware currently pins dc866bd in feeds.conf.default. Advance that pin only after the board changes are tested. The daemon stale-cache investigation and overall stack are documented in openmanetd/docs/halow-gps-investigation.md.

## Implementation (fix/halow-gps)

The BCM271x BSP now selects GPS GPIO initialization using `gpsd.core.board=wm1302`, independent of radio bus. Set `board=none` for carriers without that HAT; disabled GPS also skips GPIO initialization. The BSP supplies the WM1302 default and migrates old preserved GPS configs only when the board option is absent. A different UART or unknown board is rejected.

Per the user's choice, both BSPs explicitly depend on `procps-ng-pkill`; GPIO process ownership redesign is deferred. BCM271x also declares gpiod-tools, whose commands its init script uses. The safe GPIO probe now expects the reset sequence to succeed with pkill available and checks both dependencies.

GPSD validates optional `readonly=1` and appends `-b`. Default remains normal operation. To run the read-only arm of the issue 4 experiment:

```sh
uci set gpsd.core.readonly='1'
uci commit gpsd
/etc/init.d/gpsd restart
```

Return readonly to 0 after diagnosis if normal probing is desired. This enables the controlled experiment; it does not claim to fix receiver acquisition without hardware evidence. Run `python3 utils/gpsd/test-init.py` for default/off/on command checks.

The daemon package pins e639e9a7ed6c2d590059c723078217bc41fa23b6, uses a commit-specific source archive name, and includes the commit abbreviation in its version string. This makes the firmware build consume the stale-cache fix instead of a moving main branch.
