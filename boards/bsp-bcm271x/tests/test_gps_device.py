#!/usr/bin/env python3
"""Check live-DT UART resolution, absent hardware and explicit port choices."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / 'files/openmanet-gps-device'


class DeviceTests(unittest.TestCase):
    def test_primary_uart_and_explicit_devices(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            dt = root / 'dt'
            (dt / 'aliases').mkdir(parents=True)
            (dt / 'soc/uart').mkdir(parents=True)
            (dt / 'aliases/serial0').write_bytes(b'/soc/uart\0')
            tty = root / 'tty/null/device'
            tty.mkdir(parents=True)
            (tty / 'of_node').symlink_to(dt / 'soc/uart')
            env = {**os.environ, 'GPS_DT_ROOT': str(dt), 'GPS_SYS_TTY': str(root / 'tty')}

            def run(device):
                return subprocess.run(['sh', str(SCRIPT), device], env=env,
                                      capture_output=True, text=True)

            # /dev/null stands in for the character device mapped by this DT.
            self.assertEqual(run('auto').stdout.strip(), '/dev/null')
            self.assertEqual(run('/dev/ttyAMA0').stdout.strip(), '/dev/null')
            self.assertEqual(run('/dev/zero').stdout.strip(), '/dev/zero')
            self.assertNotEqual(run('/dev/explicit-missing-gps').returncode, 0)
            (tty / 'of_node').unlink()
            self.assertNotEqual(run('auto').returncode, 0)
            self.assertEqual(run('auto').stdout, '')


if __name__ == '__main__':
    unittest.main(verbosity=2)
