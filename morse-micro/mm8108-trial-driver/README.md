# Isolated RPi4 MM8108 USB trial

Use only with firmware's `rpi4-mm8108-2.1-trial` board and configuration gate.
This package owns experimental `morse.ko` and `dot11ah.ko` together. It does
not replace or provide baseline `kmod-dot11ah`; MM6108 continues to use 2.0.
Do not publish these packages to production feeds or mix modules across builds.

Sources are exact 2.1 commits with generated OpenWrt tar.zst SHA256 values.
Only USB is compiled. The two `0001-*` baseline patches are already upstream.
Five remaining patches apply with `patch --fuzz=0`; patch 016 is adapted for
2.1's valid BCF country fallbacks and keeps unsupported-region VIF blocking.

After OpenWrt package preparation, run:

```sh
python3 tests/regdom.py /path/to/prepared/mm8108-trial-driver-2.1.0
```

The test compiles actual patched BCF selection code with synthetic ELF sections
and bus stubs. It covers direct selection, four country fallbacks, unavailable
fallback, unsupported country, absent regdom, and OTP behavior. It is not a
hardware test. Existing userspace and board calibration are deliberately held
constant; compatibility and RF performance require the firmware hardware plan.
