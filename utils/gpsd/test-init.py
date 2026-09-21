#!/usr/bin/env python3
"""Check gpsd command construction without launching a daemon or using GPIO."""
from pathlib import Path
import subprocess

script = Path(__file__).resolve().parent / 'files/gpsd.init'
for setting in ['', '0', '1']:
    result = subprocess.run(['/bin/sh', '-c', '''
. "$1"
chgrp() { :; }
chmod() { :; }
procd_open_instance() { :; }
procd_close_instance() { :; }
procd_set_param() { echo "set $*"; }
procd_append_param() { echo "append $*"; }
enabled=1
listen_globally=0
port=2947
device=/dev/ttyAMA0
readonly="$2"
gpsd_instance core 0
''', 'test', str(script), setting], capture_output=True, text=True, check=True)
    assert ('append command -b' in result.stdout) == (setting == '1'), result.stdout
    assert 'set command /usr/sbin/gpsd -N -n -F /var/run/gpsd.sock' in result.stdout
    assert 'append command /dev/ttyAMA0' in result.stdout
    print(f'readonly={setting or "unset"}: correct command')
assert "'readonly:bool:0'" in script.read_text()
