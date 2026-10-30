# Isolated RPi4 MM8108 USB 2.2 trial

Use with firmware's `rpi4-mm8108-2.2-trial` profile. This package builds one
`morse.ko` containing dot11ah and enables only USB. The separate MM6108 SPI
trial is opt-in; baseline MM6108 packages remain on 2.0.1.

Driver 2.2.3 and its rate-control submodule are pinned with a complete OpenWrt
archive hash. Five retained radio patches apply without fuzz. A sixth patch
allows the package version to appear in module metadata. The trial firmware
package contains the matching 2.2.3 binary and upstream 2.2 M20-US BCF.

After package preparation, run:

```sh
python3 tests/regdom.py /path/to/prepared/mm8108-trial-driver-2.2.3
```

The same test accepts prepared MM6108 2.2.2 trial sources. It compiles the actual
patched BCF selection code with synthetic ELF sections and bus stubs, exercising
direct selection, country fallbacks, discovery-only behavior and OTP cases.
This does not validate firmware command compatibility or RF behavior.
See firmware's `docs/MORSE_2.2_TRIAL.md` for image builds and hardware checks.
