#!/usr/bin/env python3
"""Replay discovery plus InterfacesAdded against the real adapter constructor.

Usage: test_adapter_registration.py BLUEALSA_4_3_1_TARBALL
Tests the pristine source and the packaged patch with stub D-Bus registration.
"""
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile

HARNESS = r'''
#include <stdio.h>
#include <stdlib.h>
#define ENABLE_MIDI 0
typedef void *GDestroyNotify;
struct ba_adapter { struct { int dev_id; } hci; int refs; };
struct bluez_adapter { struct ba_adapter *adapter; void *device_sep_configs_map; };
static struct bluez_adapter bluez_adapters[1];
static struct { struct { int hfp_ag, hfp_hf, hsp_ag, hsp_hs, a2dp_source, a2dp_sink; } profile; } config;
static int registrations;
void ba_adapter_unref(struct ba_adapter *a) { --a->refs; }
static void bluez_register_battery_provider(struct bluez_adapter *a) { (void)a; ++registrations; }
static void bluez_register_media_application(struct bluez_adapter *a) { (void)a; }
static void bluez_register_a2dp_all(struct ba_adapter *a) { (void)a; }
static void *g_hash_table_new_full(void *h, void *e, void *f, void *d) {
    (void)h; (void)e; (void)f; (void)d; return NULL;
}
#define g_bdaddr_hash NULL
#define g_bdaddr_equal NULL
#define g_free NULL
#define g_array_unref NULL
%s
int main(void) {
    struct ba_adapter a = { .hci.dev_id = 0, .refs = 1 };
    config.profile.hfp_ag = 1;
    bluez_adapter_new(&a);
    ++a.refs; /* ba_adapter_lookup for the same InterfacesAdded event */
    bluez_adapter_new(&a);
    printf("%%d %%d\n", registrations, a.refs);
    return 0;
}
'''


def run(source, directory):
    start = source.index('static struct bluez_adapter *bluez_adapter_new(')
    end = source.index('\nstatic void bluez_adapter_free', start)
    c = directory / 'test.c'
    c.write_text(HARNESS % source[start:end])
    exe = directory / 'test'
    subprocess.run(['cc', '-Wall', '-Wextra', '-Werror', str(c), '-o', str(exe)], check=True)
    return subprocess.check_output([str(exe)], text=True).strip()


with tempfile.TemporaryDirectory() as directory:
    root = Path(directory)
    (root / 'src').mkdir()
    with tarfile.open(sys.argv[1]) as archive:
        member = next(m for m in archive.getmembers() if m.name.endswith('/src/bluez.c'))
        source = archive.extractfile(member).read().decode()
    before = run(source, root)
    (root / 'src/bluez.c').write_text(source)
    patch = Path(__file__).parent / 'patches/010-idempotent-adapter-registration.patch'
    subprocess.run(['patch', '-p1', '-i', str(patch.resolve())], cwd=root, check=True)
    after = run((root / 'src/bluez.c').read_text(), root)
    assert before == '2 2', before
    assert after == '1 1', after
    print('Duplicate discovery: original registered twice and leaked a reference; patched registered once with one owned reference')
