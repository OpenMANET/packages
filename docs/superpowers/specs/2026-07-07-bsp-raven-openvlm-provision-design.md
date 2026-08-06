# bsp-raven: OpenVLM boot-time provisioning script

**Date:** 2026-07-07
**Status:** Approved

## Purpose

The Raven board has an OpenVLM USB audio device (CM108B, VID/PID `0x0D8C:0x0012`) soldered onto the PCB. Its EEPROM ships blank and must be provisioned once with the `openvlm` CLI's compiled-in defaults. This adds a boot-time init script to the `bsp-raven` package that provisions the device exactly once (idempotent), retries on failure, and never re-provisions a device that is already programmed.

## Requirements

- Runs at boot via procd init script; no hotplug handling (device is embedded, always present).
- Idempotent: a marker file on flash records successful provisioning.
- Marker survives sysupgrade (listed in package conffiles) so upgrades never trigger re-provisioning or wipe post-provision EEPROM tweaks.
- Provisioning uses `openvlm provision --force` with compiled-in defaults; no `--serial` override.
- Device absent or `openvlm` binary missing: log and exit 0 (clean boot, retry next boot since marker is not written).
- Provision failure: log error, exit without writing marker, so next boot retries.

## Design

### Files

- **New:** `boards/bsp-raven/files/etc/init.d/openvlm-provision.init`, installed as `/etc/init.d/openvlm-provision` (existing Makefile install rule copies all of `files/etc/init.d/*`).
- **Modified:** `boards/bsp-raven/Makefile`
  - `DEPENDS` gains `+openvlm`.
  - New `Package/bsp-raven/conffiles` block listing `/etc/openvlm/provisioned`.
  - `PKG_RELEASE` bumped.

### Script behavior

`USE_PROCD=1`, `START=25` (after `gpsboard.init` at 21), logic in `boot()` only:

1. If `/etc/openvlm/provisioned` exists → exit 0.
2. If `openvlm` binary not on PATH → log warning, exit 0.
3. Run `openvlm identify`:
   - **Exit 0** — GPIO1 strap high, device already provisioned (e.g. config was wiped but EEPROM intact). Touch marker, exit 0. Avoids a redundant EEPROM write.
   - **Exit 3** — strap low, fresh device. Run `openvlm provision --force`. On success touch marker; on failure log error and exit without marker (retry next boot).
   - **Other exit** — device absent or HID error. Log, exit 0.
4. All paths log via `logger -t openvlm-provision`, matching `gpsboard.init` style.
5. Marker directory `/etc/openvlm/` is created by the openvlm package; script runs `mkdir -p` anyway as a safety net.

### Marker file

- Path: `/etc/openvlm/provisioned`
- Written only after a confirmed-good state (identify exit 0, or provision exit 0).
- Kept across sysupgrade via conffiles.

## Error handling

| Condition | Action | Marker |
|---|---|---|
| Marker present | exit 0 immediately | kept |
| Binary missing | log warning, exit 0 | not written |
| Device absent / HID error | log, exit 0 | not written |
| identify exit 0 | touch marker | written |
| provision success | touch marker | written |
| provision failure | log error, exit | not written |

## Testing

- On target: first boot logs provision run; `openvlm identify` exits 0 afterward; marker exists.
- Second boot: script exits immediately, no EEPROM traffic (verify via logread).
- Remove marker, reboot: identify shortcut touches marker without provisioning.
- Sysupgrade with config keep: marker persists, no re-provision.

## Out of scope

- USB hotplug handling.
- Serial number assignment or YAML overrides.
- Changes to the openvlm package itself.
