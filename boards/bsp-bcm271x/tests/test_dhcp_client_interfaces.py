#!/usr/bin/env python3
"""Ensure uplink migration preserves explicit and anonymous DHCP pools."""
from pathlib import Path
import subprocess

source = (Path(__file__).resolve().parents[1] /
          'files/uci-defaults/45_dhcp_client_interfaces').read_text()
source = source.replace('. /lib/functions.sh', '')
mock = r'''
config_load() { dataset="$1"; }
config_foreach() {
    if [ "$dataset" = dhcp ]; then
        "$1" custom_pool
    else
        "$1" lan
        "$1" upstream
        "$1" existing
        "$1" mesh
    fi
}
config_get() {
    case "$2.$3" in
        custom_pool.interface) value=lan;;
        lan.proto|upstream.proto|existing.proto) value=dhcp;;
        mesh.proto) value=static;;
        *) exit 2;;
    esac
    eval "$1=\$value"
}
uci() {
    if [ "$1" = -q ]; then
        [ "$3" = dhcp.existing ]; return $?
    fi
    printf '%s\n' "$*"
}
'''
result = subprocess.run(['sh', '-c', mock + source], text=True, capture_output=True, check=True)
assert result.stdout.splitlines() == [
    'set dhcp.upstream=dhcp',
    'set dhcp.upstream.interface=upstream',
    'set dhcp.upstream.ignore=1',
    'commit dhcp',
], result.stdout
print('PASS: excluded unconfigured DHCP client; preserved anonymous pool, named section and static mesh')
