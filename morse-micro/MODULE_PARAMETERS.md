# Morse Micro Driver Module Parameters

Reference for every kernel module parameter exposed by the Morse Micro HaLow
drivers built from this feed:

| Package | Module | Upstream source |
|---|---|---|
| `kmod-mm6108` ([mm6108-driver](mm6108-driver/)) | `mm6108_sdio.ko` (renamed from `morse.ko` by patch 020) | [MorseMicro/morse_driver](https://github.com/MorseMicro/morse_driver) tag `mm6108-2.0.1` |
| `kmod-mm8108` ([mm8108-driver](mm8108-driver/)) | `morse.ko` | [MorseMicro/morse_driver](https://github.com/MorseMicro/morse_driver) tag `mm8108-2.0.0` |

Descriptions are taken from the `MODULE_PARM_DESC()` text in the driver source,
with enum values resolved from the corresponding headers. Except where noted in
[Differences between the two drivers](#differences-between-the-two-drivers),
the parameter set is identical for both modules.

The **Default** column is the value observed on boot of an OpenMANET build with
no UCI overrides (the driver logs this table itself because
`log_modparams_on_boot` defaults to on). Some defaults come from build-time
Kconfig (`CONFIG_MORSE_*`) and could differ in other builds.

## How parameters are set in OpenMANET

- Persistent options go in the module's `/etc/modules.d/` file (e.g.
  `options mm6108_sdio bcf=bcf_ekh01.bin`). The `netifd-morse` wireless
  handler discovers the installed module dynamically (morse-test-driver →
  morse → mm6108 → mm8108) and writes modparams there from UCI wireless
  config.
- Most parameters are `0644` and visible under
  `/sys/module/<module>/parameters/`, but the majority are only read at
  probe/interface-up, so changing them at runtime generally requires a module
  reload or interface bounce. `hw_scan_prim_deconstruct` is read-only (`0444`).
- **MM6108 boards must set `bcf` explicitly.** The MM610x family has no OTP
  board-type auto-detect, so the BCF filename has to be delivered via UCI →
  modparam. MM8108 auto-detects its BCF from OTP and needs no override.
  MM610x boards also rely on `enable_ext_xtal_init=1` (the default).

## Chip / firmware bring-up

| Parameter | Type | Default | Purpose |
|---|---|---|---|
| `bcf` | string | *(empty)* | Board Configuration File filename to load. Must be set on MM6108 (no auto-detect); leave empty on MM8108 (OTP auto-detect). |
| `fw_bin_file` | string | *(empty)* | Override the firmware binary filename (empty = chip default). |
| `serial` | string | `default` | Override the board ID read from the chip (affects BCF selection). |
| `enable_otp_check` | bool | Y | Validate the device OTP during probe. |
| `enable_ext_xtal_init` | bool | Y | Run the external-crystal init sequence required on MM610x parts. |
| `country` | string | US | ISO alpha-2 regulatory country code the device operates in. |
| `sdio_reset_time` | uint | 400 | Time in ms to wait after SDIO reset during firmware (re)load. |
| `macaddr_octet` | byte | 255 | Value for MAC octet 6 (`0xFF` = random); ignored when a hardware MAC exists. |
| `macaddr_suffix` | string | 00:00:00 | Value for MAC octets 4–6 (`00:00:00` = randomize); ignored when a hardware MAC exists. |
| `enable_hw_leds` | bool | Y | Enable hardware-attached LEDs. |
| `enable_4v3_fem` | bool | N | **OpenMANET/Gateworks patch (mm6108 only), not upstream** — drives the optional 4.3 V front-end-module GPIO at init for boards with a 4.3 V FEM ([015-4v3fem-gpio-support.patch](mm6108-driver/patches/015-4v3fem-gpio-support.patch)). |
| `test_mode` | uint | 0 | Enable test modes. Only registered when the driver is built with `CONFIG_MORSE_ENABLE_TEST_MODES`. |

## Bus (SPI / SDIO)

| Parameter | Type | Default | Purpose |
|---|---|---|---|
| `spi_clock_speed` | uint | 0 | SPI clock in Hz (0 = use device-tree/controller default). |
| `spi_use_edge_irq` | bool | N | Compatibility mode for SPI controllers that only support edge-triggered IRQs. |
| `spi_post_write_status_bytes` | uint | 4 | Status bytes appended after a byte-mode CMD53 write. |
| `spi_inter_block_delay_bytes` | uint | 0 | Inter-block delay on SPI, expressed in byte-times. |
| `sdio_clk_debugfs` | string | *(empty)* | Path to the SDIO clock in debugfs, used to automatically lower the SDIO clock during powersave. |

## Power save & duty cycle

| Parameter | Type | Default | Purpose |
|---|---|---|---|
| `enable_ps` | uint | 0 | Powersave mode: 0 = disabled, 1 = protocol PS only, 2 = fully enabled. |
| `enable_dynamic_ps_offload` | bool | Y | Offload dynamic power-save timing to firmware. |
| `enable_pre_assoc_ps` | bool | N | Allow STA interfaces to power-save before association. |
| `enable_auto_duty_cycle` | bool | Y | Automatically apply regulatory duty-cycle limits (relevant in EU S1G bands). |
| `duty_cycle_mode` | uint | 0 | How airtime budget is spent when duty cycling: 0 = SPREAD, 1 = BURST. |
| `duty_cycle_probe_retry_threshold` | uint | 2500 | Duty-cycle threshold (1/100 %) below which probe request/response retries are disabled. |
| `enable_auto_mpsw` | bool | Y | Automatic minimum packet spacing window per regulatory domain. |
| `slow_clock_mode` | uint | 0 | Sleep clock source selection (0 = auto). |
| `enable_twt` | bool | Y | Target Wake Time support. |

## Scanning

| Parameter | Type | Default | Purpose |
|---|---|---|---|
| `enable_hw_scan` | bool | Y | Firmware/hardware-driven scan instead of mac80211 software scan. |
| `enable_sched_scan` | bool | Y | Scheduled (background) scanning support. |
| `enable_1mhz_probes` | bool | Y | Send all probe requests at 1 MHz bandwidth (maximizes discovery range). |
| `enable_scan_result_cache` | bool | N | Cache scan results during a scan. |
| `hw_scan_replay_limit` | uint | 0 | Number of initial hardware scans that replay cached results before scanning live. |
| `hw_scan_prim_deconstruct` | uint | 0 | Limit HW-scan channel deconstruction to primary width (0 = both, 1, or 2). Read-only at runtime. |
| `enable_survey` | bool | Y | Channel survey (airtime/noise stats, e.g. `iw survey dump`). |

## Rate control & PHY

| Parameter | Type | Default | Purpose |
|---|---|---|---|
| `enable_fixed_rate` | bool | N | Force a fixed TX rate — the four `fixed_*` parameters below only apply when this is on. |
| `fixed_mcs` | int | 4 | Fixed MCS index. |
| `fixed_bw` | int | 2 | Fixed bandwidth. |
| `fixed_ss` | int | 1 | Fixed number of spatial streams. |
| `fixed_guard` | int | 0 | Fixed guard interval. |
| `mcs_mask` | uint | 1023 | Bitmask of allowed MCS (0x3FF = MCS0–9 all enabled). |
| `mcs10_mode` | uint | 0 | MCS10 (extra-robust 1 MHz mode): 0 = disabled, 1 = replaces MCS0, 2 = try MCS0 then MCS10. |
| `max_rates` | uint | 4 | Maximum number of rates in a retry chain. |
| `max_rate_tries` | uint | 1 | Maximum retries per rate in the chain. |
| `enable_sgi_rc` | bool | Y | Allow short guard interval in rate control decisions. |
| `enable_subbands` | uint | 2 | Sub-band transmission: 0 = disabled, 1 = management frames only, 2 = fully enabled (data follows rate-control sub-band signaling). |
| `enable_trav_pilot` | bool | Y | Travelling pilots (802.11ah PHY feature for mobility). |
| `tx_max_power_mbm` | int | 0 | Cap TX power in mBm (0 = no extra cap; chip maximum still applies). |
| `enable_airtime_fairness` | int | 0 | mac80211 pull interface for airtime fairness: -1 = disable, 0 = kernel-dependent, 1 = enable. |

## Protection & protocol features

| Parameter | Type | Default | Purpose |
|---|---|---|---|
| `enable_rts_8mhz` | bool | N | RTS/CTS protection for 8 MHz transmissions. |
| `enable_cts_to_self` | bool | N | Use CTS-to-self instead of RTS/CTS. |
| `enable_pv1` | bool | N | 802.11ah PV1 (short frame format) support — dev only. |
| `enable_page_slicing` | bool | N | Page slicing (S1G TIM segmentation for large STA counts). |
| `enable_cac` | bool | N | Centralized Authentication Control — throttles association floods (AP mode). |
| `enable_mbssid_ie` | bool | N | Multiple-BSSID IE in beacons and probe responses. |
| `rsn_beacon_mode` | uint | 0 | RSN IE in beacons: 0 = never, 1 = long beacons only, 2 = all beacons. |
| `enable_short_bcn_as_dtim_override` | int | -1 | Experimental override letting a short beacon serve as the DTIM beacon (-1 = no override). |
| `enable_bcn_change_seq_monitor` | bool | N | Monitor the Change Sequence field in S1G beacons (detects config changes without parsing full beacons). |
| `enable_ibss_probe_filtering` | bool | Y | Firmware-side probe-request filtering in IBSS/mesh. |
| `enable_mm_vendor_ie` | bool | Y | Allow insertion of Morse Micro vendor IEs. |
| `max_total_vendor_ie_bytes` | uint | 514 | Byte budget for runtime-configured vendor IEs. |

## Multicast & offloads

| Parameter | Type | Default | Purpose |
|---|---|---|---|
| `max_mc_frames` | int | -1 | Maximum multicast frames sent after DTIM (-1 = auto/dynamic, 0 = unlimited). |
| `enable_mcast_whitelist` | bool | Y | Multicast whitelisting (drop non-whitelisted multicast in firmware). |
| `enable_mcast_rate_control` | bool | N | Track multicast receivers to transmit multicast at the highest rate/bandwidth/GI all can hear. |
| `enable_arp_offload` | bool | N | Firmware answers ARP requests while the host sleeps. |
| `enable_dhcpc_offload` | bool | N | Firmware runs the DHCP client. |
| `dhcpc_lease_update_script` | string | /morse/scripts/dhcpc_update.sh | Script called when the offloaded DHCP client gets a lease update. |

## Queues, commands, reliability

| Parameter | Type | Default | Purpose |
|---|---|---|---|
| `max_txq_len` | uint | 32 | Maximum queued TX packets per queue. Patch `0001-SW-19969` in both packages reverts upstream's automatic overwrite of this value. |
| `skbq_refill_margin` | uint | 8 | Refill margin below `max_txq_len` before pulling more from mac80211. **mm6108 (2.0.1) only.** |
| `tx_queued_lifetime_ms` | uint | 1000 | Drop queued TX packets older than this. |
| `tx_status_lifetime_ms` | uint | 15000 | Consider a sent packet lost if no TX status arrives within this time. |
| `default_cmd_timeout_ms` | uint | 600 | Default timeout for host→firmware commands. |
| `enable_watchdog` | bool | Y | Driver watchdog that detects a hung chip. |
| `watchdog_interval_secs` | uint | 30 | Watchdog poll interval. |
| `hw_reload_after_stop` | int | 5 | Reload hardware after a firmware stop notification, but give up if stop events arrive less than this many seconds apart (-1 = disable). |
| `reattach_hw` | bool | N | Do not reset the chip on module exit; attempt to reattach to running hardware on next load (fast driver restarts). |

## Debug & diagnostics

| Parameter | Type | Default | Purpose |
|---|---|---|---|
| `debug_mask` | uint | 8 | Logging mask, bits 0–3 = debug/info/warn/error (8 = errors only). |
| `log_modparams_on_boot` | bool | Y | Print the full parameter table to dmesg at probe time. |
| `enable_coredump` | bool | Y | Create a coredump when the chip crashes. |
| `coredump_method` | uint | 1 | Coredump collection method: 0 = userspace script, 1 = read chip memory over the bus (SDIO/SPI). |
| `coredump_include` | ulong | 1 | Bitfield of optional memory regions to include (bus method only). |
| `no_hwcrypt` | bool | N | Disable on-chip hardware encryption (fall back to software crypto). |

## Architecture / test modes

| Parameter | Type | Default | Purpose |
|---|---|---|---|
| `enable_wiphy` | bool | N | FullMAC (wiphy) interface instead of the normal SoftMAC/mac80211 path. |
| `thin_lmac` | bool | N | Thin-LMAC split-MAC mode (more MAC logic on the host). |
| `virtual_sta_max` | uint | 0 | Virtual-STA test mode: maximum virtual stations, 0 = disabled. |
| `ocs_type` | uint | 1 | Off-Channel Sounding mechanism: 0 = QoS-Null frames, 1 = RAW. |
| `enable_mac80211_connection_monitor` | bool | N | Let mac80211 do beacon-loss/connection monitoring instead of firmware. |
| `max_aggregation_count` | uint | 0 | Maximum A-MPDU aggregation count advertised for RX (0 = default). |

## dot11ah.ko

The companion `dot11ah.ko` module (built by both driver packages) exposes one
parameter of its own:

| Parameter | Type | Default | Purpose |
|---|---|---|---|
| `channelization_scheme` | uint | 0 | Channelization scheme; affects the AU regulatory domain only. Read-only at runtime (`0444`). |

## Differences between the two drivers

| Parameter | mm6108 (2.0.1) | mm8108 (2.0.0) | Notes |
|---|---|---|---|
| `skbq_refill_margin` | yes | no | Removed upstream between the two tags. |
| `enable_amsdu_override` | no | yes | Override A-MSDU support: -1 = chip-dependent default, 0 = disable, 1 = enable. Requires airtime fairness (pull interface) to be active. |
| `enable_4v3_fem` | yes (OpenMANET patch) | no | Added by [015-4v3fem-gpio-support.patch](mm6108-driver/patches/015-4v3fem-gpio-support.patch); not upstream. |
