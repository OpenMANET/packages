#!/usr/bin/env python3
"""Exercise the shipped init scripts with shell stubs; never access GPIO/UCI."""
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[2]
BCM = ROOT / 'boards/bsp-bcm271x/files/etc/init.d/gpsboard.init'
RAVEN = ROOT / 'boards/bsp-raven/files/etc/init.d/gpsboard.init'


def run(script, body):
    result = subprocess.run(['/bin/sh', '-c', '. "$1"\n' + body, 'probe', str(script)],
                            text=True, capture_output=True, check=True)
    return result.stdout.strip()


for bus, path, expected in [
    ('SPI', 'platform/soc/fe204000.spi/spi_master/spi0/spi0.0', 'initialized'),
    ('USB', 'platform/soc/fe980000.usb/usb1/1-1/1-1.2/1-1.2:1.0', ''),
    ('no Morse device', '', 'initialized'),
]:
    output = run(BCM, '''
logger() { :; }
get_gpsd_device() { echo /dev/ttyAMA0; }
config_load() { :; }
config_foreach() { [ -z "$DEVICE_PATH" ] || "$1" radio1 "$3"; }
uci() { case "$3" in *.type) echo morse;; *.path) echo "$DEVICE_PATH";; esac; }
init_gps_gpio() { echo initialized; }
DEVICE_PATH=''' + repr(path) + '\nboot\n')
    assert output == expected, (bus, output)
    print(f'{bus}: {output or "exited before GPS initialization"}')

for script in [BCM, RAVEN]:
    output = run(script, '''
logger() { :; }
sleep() { :; }
pkill() { return 127; } # command-not-found semantics on the image
# Emulate exclusive line requests, keeping successful requests held.
gpioset() {
    for arg in "$@"; do
        case "$arg" in
            12=*)
                [ -z "$wake" ] || { echo 'BUSY GPIO12'; return 1; }
                wake=${arg#*=}; echo "SET GPIO12=$wake";;
            25=*)
                [ -z "$reset" ] || { echo 'BUSY GPIO25'; return 1; }
                reset=${arg#*=}; echo "SET GPIO25=$reset";;
        esac
    done
}
gpioget() { return 1; }
init_gps_gpio
echo "FINAL wake=$wake reset=$reset"
''')
    assert output.count('BUSY GPIO25') == 2, output
    assert 'SET GPIO25=1' not in output, output
    assert 'FINAL wake=0 reset=0' in output, output
    print(f'{script.relative_to(ROOT)}: reset high never applied; two busy-line failures hidden')
