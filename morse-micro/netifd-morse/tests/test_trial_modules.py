#!/usr/bin/env python3
"""Exercise real netifd module selection/reload code with mocked kernel commands."""
import pathlib
import subprocess
import tempfile
import unittest

SOURCE = (pathlib.Path(__file__).parents[1] / 'lib/netifd/wireless/morse.sh').read_text()
PARAMS = SOURCE[SOURCE.index('change_module_parameters() {'):SOURCE.index('\nmorse_set_chan_test_freq()')]
BLOCK = SOURCE[SOURCE.index('\tlocal morse_module_config_file='):SOURCE.index('\t# don\'t do iw reg set as in mac80211')]

class Modules(unittest.TestCase):
    def run_case(self, package, module, integrated):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            (root / package).write_text(module + ' country=US\n')
            if not integrated:
                (root / '50-dot11ah').write_text('dot11ah channelization_scheme=1\n')
            block = BLOCK.replace('/etc/modules.d', directory).replace('/sbin/kmodloader', 'kmodloader')
            script = PARAMS + '''
is_module_loaded() { return 0; }
rmmod() { echo "unload:$1"; }
kmodloader() { echo "load:$1"; }
sleep() { :; }
wireless_set_retry() { echo "FAIL retry:$1"; }
MOD_PARAMS="country=US"
DOT11AH_MOD_PARAMS="channelization_scheme=3"
run() {
''' + block + '\n}\nrun\nrun\n'
            result = subprocess.run(['bash', '-c', script], text=True, capture_output=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertNotIn('FAIL', result.stdout)
            self.assertEqual(result.stdout.count('load:' + str(root / package) + '\n'), 1, result.stdout)
            self.assertEqual('channelization_scheme=3' in (root / package).read_text(), integrated)
            if integrated:
                self.assertNotIn('unload:dot11ah', result.stdout)
                self.assertNotIn('50-dot11ah', result.stdout)
                self.assertFalse((root / '50-dot11ah').exists())
            else:
                self.assertIn('unload:dot11ah', result.stdout)
                self.assertIn('load:' + str(root / '50-dot11ah'), result.stdout)
                self.assertIn('channelization_scheme=3', (root / '50-dot11ah').read_text())

    def test_usb_trial(self): self.run_case('mm8108-trial', 'morse', True)
    def test_spi_trial(self): self.run_case('mm6108-trial', 'morse', True)
    def test_legacy_spi(self): self.run_case('mm6108', 'mm6108_sdio', False)
    def test_legacy_usb(self): self.run_case('mm8108', 'morse', False)

class BoardDefaults(unittest.TestCase):
    def test_external_crystal_defaults(self):
        source = (pathlib.Path(__file__).parents[3] / 'boards/bsp-common/files/uci-defaults/99_morse_radio_defaults').read_text()
        for package, expected in [('mm6108', True), ('mm6108-trial', True), ('mm8108', False), ('mm8108-trial', False)]:
            with self.subTest(package=package), tempfile.TemporaryDirectory() as directory:
                (pathlib.Path(directory) / package).touch()
                script = source.replace('. /lib/functions.sh', '').replace('/etc/modules.d', directory)
                mocks = '''
config_get() { eval "$1=morse"; }
board_name() { echo bcm2711,mm6108-spi; }
uci() { echo "uci:$*"; }
config_load() { :; }
config_foreach() { "$1" radio0; }
'''
                result = subprocess.run(['sh', '-c', mocks + script], text=True, capture_output=True)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual('enable_ext_xtal_init=1' in result.stdout, expected, result.stdout)
                self.assertIn('bcf=bcf_fgh100mhaamd.bin', result.stdout)

if __name__ == '__main__': unittest.main()
