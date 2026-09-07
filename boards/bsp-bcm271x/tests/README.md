# WM6108 SPI reset: no-flash verification

The helper supports Pi 3B, Zero 2W, CM4 and Pi 4B with the WM6108/WM1302 SPI
profile. MM8108 SPI, USB, SDIO and unmarked MM610x profiles are excluded.

The additional pulse ships **disabled** (`/etc/wm6108-spi-reset.conf` contains
`enabled=0`). The existing driver reset remains unchanged. Hardware validation
must establish a benefit before changing the file to exactly `enabled=1` plus
a newline for a subsequent boot. Do not manually delete the once-per-boot guard
or invoke the boot helper against a running radio. No flashing or GPIO access
is needed for the tests below.

## Local tests

From the packages repository, with the matching firmware build's target headers:

```sh
python3 boards/bsp-bcm271x/tests/test_spi_reset.py \
  --headers ../firmware/staging_dir/target-aarch64_cortex-a72_musl/usr/include \
  --sanitize
busybox ash -n boards/bsp-bcm271x/files/etc/init.d/wm6108-spi-reset
```

The test compiles the actual control/detection code with a test-only root and a
mock libgpiod implementation. The mock never opens a GPIO device or issues an
ioctl. Production builds contain no test-root override. Fixtures use real DTBs
compiled by `dtc`; `libfdt.so.1` and a C compiler must be available on the host.
Undefined-behavior sanitizer coverage applies to our code/mock, not the host's
prebuilt libfdt. These tests cannot prove electrical pulse shape or BCM GPIO
driver behavior.

For effective-DT checks, use `firmware/scripts/tests/test_wm6108_overlays.py`
with the four compiled base DTBs and Raspberry Pi utils `dtmerge`. Ordinary
`fdtoverlay` rejects the existing baseline overlay's labeled fragment root;
the Raspberry Pi merger handles that firmware-specific behavior. No overlay
normalization or pinctrl changes are needed to make this check pass.

## Packaging and boot safety

- Build both `bsp-bcm271x` and the patched `morse-bundle`. Firmware's mandatory
  common feed patch installs a vendor-owned no-op at the old reset path on
  bcm27xx; the BSP does not overwrite that file. Reinstalling the **patched**
  bundle must still install the no-op. An unpatched upstream bundle is not a
  supported substitute; include the feed patch in any standalone package build.
- The new S09 service has only a boot action; start/stop/restart do not pulse.
  S10boot loads normal modules. Check the final image's preinit, modules-boot.d
  and hotplug paths as well; numbering alone is not a proof of ordering.
- The helper refuses loaded/probing Morse drivers, acquires GPIO exclusively,
  and marks its attempt even when disabled or skipped. It never unloads a
  driver or unbinds a controller to make reset possible.
- GPIO requests are physical low then input using one libgpiod request. Input
  reconfiguration failure gets one same-request cleanup attempt, logs failure
  and never initiates bus recovery. SIGKILL, kernel faults and persistent GPIO
  reconfiguration failures cannot be made electrically safe by userspace
  cleanup alone; keep hardware validation and default-off policy explicit.
- Preserve the CM4 MM8108 USB no-overlay selection and onboard Wi-Fi. No
  openmanetd, wizard or non-Pi reset policy changes belong in this patch set.

The pre-probe window and radio reliability remain hardware-validation items.
No offline result should be reported as proof that a board boots successfully.
