#!/usr/bin/env python3
"""Exercise mesh admission with real shell code and simulated module state."""
import pathlib
import subprocess
import tempfile
import unittest

SOURCE = (pathlib.Path(__file__).parents[1] / 'lib/netifd/wireless/morse.sh').read_text()
FUNCTIONS = SOURCE[SOURCE.index('morse_eu_mesh_ready() {'):SOURCE.index('\nmorse_iface_bringup()')]


class EUMesh(unittest.TestCase):
    def run_case(self, expected, *, duty='Y', duty_mode='0', **config):
        settings = dict(country='EU', mode='mesh', enable_eu_mesh='1',
                        svt_restricted_mode='0', s1g_chanbw='1', txpower='0',
                        firmware_type='', interface_count='0', auto_channel='0',
                        interface_first='', has_chan_info='1', phy='phy0',
                        ifname='wlh0', macaddr='')
        settings.update(config)
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            if duty is not None:
                (root / 'enable_auto_duty_cycle').write_text(duty + '\n')
            (root / 'duty_cycle_mode').write_text(duty_mode + '\n')
            script = FUNCTIONS.replace('/sys/module/morse/parameters', directory)
            script += '\nmorse_iw_interface_add() { echo "CREATE:$*"; }\n'
            # Inputs are constants in these tests; pass values as environment variables.
            script += 'morse_iface_create\nrc=$?\necho "RESULT:$rc"\n'
            result = subprocess.run(['sh', '-c', script], env=settings,
                                    text=True, capture_output=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn(f'RESULT:{expected}\n', result.stdout)
            self.assertEqual('CREATE:' in result.stdout, expected == 0, result.stdout)
            self.assertEqual(result.stderr, '')

    def test_opt_in_mesh(self):
        for country in ('EU', 'GB'):
            with self.subTest(country=country):
                self.run_case(0, country=country)

    def test_default_still_blocks_mesh(self):
        for country in ('EU', 'GB'):
            with self.subTest(country=country):
                self.run_case(9, country=country, enable_eu_mesh='')

    def test_requires_live_duty_cycle_settings(self):
        for duty, mode in [('N', '0'), (None, '0'), ('Y', '1')]:
            with self.subTest(duty=duty, mode=mode):
                self.run_case(12, duty=duty, duty_mode=mode)

    def test_requires_bench_configuration(self):
        for config in [dict(txpower=''), dict(txpower='16'), dict(txpower='-1'),
                       dict(s1g_chanbw='2'), dict(svt_restricted_mode='1'),
                       dict(country='NL'), dict(country='US')]:
            with self.subTest(config=config):
                self.run_case(12, **config)

    def test_channel_validation_remains(self):
        self.run_case(4, auto_channel='1')
        self.run_case(6, has_chan_info='0')

    def test_does_not_enable_adhoc_or_fixed_channel_ap(self):
        self.run_case(9, mode='adhoc')
        self.run_case(8, mode='ap')

    def test_us_mesh_unchanged(self):
        self.run_case(0, country='US', enable_eu_mesh='', txpower='24')

    def test_firmware_mode_restrictions_remain(self):
        for firmware in ('fullmac', 'thin_lmac'):
            with self.subTest(firmware=firmware):
                self.run_case(11, firmware_type=firmware)


if __name__ == '__main__':
    unittest.main()
