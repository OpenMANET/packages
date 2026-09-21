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


for bus, board, enabled, device, expected in [
    ('SPI', 'wm1302', '1', '/dev/ttyAMA0', 'initialized'),
    ('USB', 'wm1302', '1', '/dev/ttyAMA0', 'initialized'),
    ('no Morse device', 'wm1302', '1', '/dev/ttyAMA0', 'initialized'),
    ('USB', 'none', '1', '/dev/ttyAMA0', ''),
    ('USB', '', '1', '/dev/ttyAMA0', ''),
    ('USB', 'wm1302', '0', '/dev/ttyAMA0', ''),
]:
    output = run(BCM, '''
logger() { :; }
get_gpsd_device() { echo "$DEVICE"; }
uci() { case "$3" in gpsd.core.board) echo "$BOARD";; gpsd.core.enabled) echo "$ENABLED";; *) exit 99;; esac; }
init_gps_gpio() { echo initialized; }
''' + f"BOARD={board!r}\nENABLED={enabled!r}\nDEVICE={device!r}\nboot\n")
    assert output == expected, (bus, board, output)
    print(f'{bus}, board={board or "unset"}, enabled={enabled}: {output or "skipped"}')

for script in [BCM, RAVEN]:
    output = run(script, '''
logger() { :; }
sleep() { :; }
pkill() {
    case "$2" in *25=*) reset=;; *12=*) wake=;; *) return 1;; esac
} # model the now-required procps-ng-pkill releasing the requests
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
    assert 'BUSY' not in output, output
    assert 'SET GPIO25=1' in output, output
    assert 'FINAL wake=0 reset=0' in output, output
    print(f'{script.relative_to(ROOT)}: reset pulse applied and released')

for board in ['bcm271x', 'raven']:
    makefile = (ROOT / f'boards/bsp-{board}/Makefile').read_text()
    assert '+procps-ng-pkill' in makefile, board
print('Both BSPs declare procps-ng-pkill')
