# ADSBCOT for OpenWrt

`adsbtocot` installs the pinned, SHA-256 verified ADSBCOT 9.0.1 release with the
existing dump1090 configuration, procd service and first-boot defaults.
Select `CONFIG_PACKAGE_adsbtocot=y` to include it in firmware.

PyTAK, aiohttp and AirCoT are separate packages. This lets ADSBCOT coexist with
AISCOT without installing duplicate files into Python's global module directory.
The source version matches the previously vendored ADSBCOT version; the package
version now tracks that upstream version rather than `1`.

ADSBCOT requires `websockets < 11`, so `python3-websockets10` pins 10.4 and
conflicts with the standard feed's newer `python3-websockets` package. NumPy and
optional pyModeS are not needed for the configured dump1090 JSON input.

Input and output settings remain in `/etc/adsbcot/adsbcot.ini`. The existing
first-boot defaults enable dump1090 and ADSBCOT. When using the same RTL-SDR for
HaLow scanning, stop dump1090 before the scan and restart it afterward:

```sh
/etc/init.d/dump1090 stop
halow-scanner --radio radio0 -r US -b 2
/etc/init.d/dump1090 start
```

Use the actual HaLow radio section name, and connect over Ethernet or console.
The scanner restores the selected HaLow radio; it does not manage dump1090.
