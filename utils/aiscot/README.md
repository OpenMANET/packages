# AISCOT for OpenWrt

Packages [snstac/aiscot](https://github.com/snstac/aiscot) at commit
`729f548311e660633f88e8e42ce53e51d2e7f5be` (7.3.2), with separately packaged
PyTAK 7.6.1 and the OpenWrt aiohttp dependencies. All new source
archives are SHA-256 verified; dependencies are built for the target architecture.

Select `CONFIG_PACKAGE_aiscot=y` to include it in firmware. Edit
`/etc/aiscot/aiscot.ini` with your AIS input and TAK destination, then run:

```sh
uci set aiscot.main.enabled='1'
uci commit aiscot
/etc/init.d/aiscot enable
/etc/init.d/aiscot start
```

The default input is UDP NMEA AIS on `127.0.0.1:10110`. It requires a separate
AIS receiver/feed; AISCOT itself does not tune or decode RF. To receive from
another host, change `LISTEN_HOST` and configure firewall access as appropriate.
The example output is TAK multicast `239.2.3.1:6969`. The service is opt-in;
installing the package alone does not start forwarding traffic.

`aiscot -c /etc/aiscot/aiscot.ini` runs it in the foreground. Logs from the
service are available through `logread`. Both configuration files survive upgrades.

AISCOT and ADSBCOT share separately packaged PyTAK and aiohttp libraries and
can be included in the same firmware image. ADSBCOT pins its required
`websockets < 11` dependency as `python3-websockets10`; this conflicts with
the standard feed's newer `python3-websockets` package.

UDP/TCP and TLS with PEM certificates use the standard Python TLS support.
Optional PyTAK certificate enrollment and PKCS#12 handling additionally require
`python3-cryptography`; install/select it separately if those features are needed.
Upstream PyTAK emits an optional-dependency warning when it is absent.
