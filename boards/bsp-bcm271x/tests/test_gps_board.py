#!/usr/bin/env python3
"""Exercise real boot selection with temporary DT data and no GPIO access."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

BSP = Path(__file__).resolve().parents[1]
SCRIPT = BSP / 'files/etc/init.d/gpsboard.init'
BOOT = r'''
. "$1"
DT_PATH="$2"
HAT_DT_PATH="$DT_PATH/hat"
board_name() { printf '%s\n' "$PROFILE"; }
uci() {
    case "$*" in
        '-q get gpsd.core.board') printf %s "$BOARD";;
        '-q get gpsd.core.enabled') printf %s "$ENABLED";;
        '-q get gpsd.core.device') printf %s "$DEVICE";;
        *) echo "unexpected UCI write: $*" >&2; return 99;;
    esac
}
logger() { printf 'log: %s\n' "$*"; }
init_gps_gpio() { echo GPIO_INITIALIZED; }
boot
'''


class GPSBoardTests(unittest.TestCase):
    def run_boot(self, compatible, profile, *, hat=False, marker=False,
                 board='auto', enabled='1', device='/dev/ttyAMA0', dt_board=None):
        with tempfile.TemporaryDirectory() as directory:
            dt = Path(directory)
            (dt / 'compatible').write_bytes(compatible.encode() + b'\0brcm,bcm2711\0')
            if dt_board is not None:
                (dt / 'sysinfo-board-name').write_bytes(dt_board.encode() + b'\0')
            if hat:
                (dt / 'hat').mkdir()
                (dt / 'hat/vendor').write_bytes(b'Seeed Studio\0')
                (dt / 'hat/product').write_bytes(b'WM1302 Pi HAT\0')
            if marker:
                (dt / 'soc/spi/radio').mkdir(parents=True)
                (dt / 'soc/spi/radio/openmanet,wm6108-reset').touch()
            return subprocess.run(['/bin/sh', '-c', BOOT, 'test', str(SCRIPT), str(dt)],
                                  env={**os.environ, 'PROFILE': profile, 'BOARD': board,
                                       'ENABLED': enabled, 'DEVICE': device},
                                  text=True, capture_output=True, check=False)

    def test_auto_selection(self):
        cases = [
            ('Pi4 USB', 'raspberrypi,4-model-b', 'bcm2711,mm8108-usb', False, False, True),
            ('CM4 USB', 'raspberrypi,4-compute-module', 'bcm2711,mm8108-usb', False, False, True),
            ('Pi4 SDIO', 'raspberrypi,4-model-b', 'bcm2711,mm6108-sdio', False, False, True),
            ('CM4 SPI', 'raspberrypi,4-compute-module', 'bcm2711,mm6108-spi', False, False, True),
            ('Pi3 SPI', 'raspberrypi,3-model-b', 'bcm2710,mm6108-spi', False, False, True),
            ('SPI DT marker', 'raspberrypi,3-model-b', 'raspberrypi,3-model-b', False, True, True),
            ('Pi3 Seeed HAT', 'raspberrypi,3-model-b', 'bcm2710,mm6108-sdio', True, False, True),
            ('Pi3 no carrier', 'raspberrypi,3-model-b', 'bcm2710,mm6108-sdio', False, False, False),
            ('Raven', 'raspberrypi,4-compute-module', 'bcm2711,raven', False, False, False),
            ('Raven HAT and SPI', 'raspberrypi,4-compute-module', 'bcm2711,raven', True, True, False),
            ('Gateworks', 'gateworks,imx8mm-gw7901', 'gateworks,venice', False, False, False),
            ('Gateworks HAT and SPI', 'gateworks,imx8mm-gw7901', 'bcm2711,mm6108-spi', True, True, False),
        ]
        for name, compatible, profile, hat, marker, initialize in cases:
            with self.subTest(name=name):
                result = self.run_boot(compatible, profile, hat=hat, marker=marker)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual('GPIO_INITIALIZED' in result.stdout, initialize, result.stdout)
                self.assertNotIn('unexpected UCI write', result.stderr)
                if initialize:
                    self.assertIn('GPS carrier: wm1302', result.stdout)

    def test_overrides_and_disabled_gps(self):
        for board, enabled, initialize, status in [
            ('', '1', True, 0), ('auto', '0', False, 0), ('none', '1', False, 0),
            ('wm1302', '1', True, 0), ('unsupported', '1', False, 1),
        ]:
            with self.subTest(board=board, enabled=enabled):
                result = self.run_boot('raspberrypi,4-compute-module', 'bcm2711,mm8108-usb',
                                       board=board, enabled=enabled)
                self.assertEqual(result.returncode, status, result.stdout + result.stderr)
                self.assertEqual('GPIO_INITIALIZED' in result.stdout, initialize)

    def test_disabled_spi_remains_disabled(self):
        for board, enabled in [('none', '1'), ('auto', '0')]:
            result = self.run_boot('raspberrypi,3-model-b', 'bcm2710,mm6108-spi',
                                   board=board, enabled=enabled)
            self.assertEqual(result.returncode, 0)
            self.assertNotIn('GPIO_INITIALIZED', result.stdout)

    def test_explicit_override_does_not_claim_other_boards(self):
        for compatible, profile in [('raspberrypi,4-compute-module', 'bcm2711,raven'),
                                     ('gateworks,imx8mm-gw7901', 'gateworks,venice')]:
            result = self.run_boot(compatible, profile, board='wm1302')
            self.assertEqual(result.returncode, 0)
            self.assertNotIn('GPIO_INITIALIZED', result.stdout)

    def test_raven_dt_identity_excludes_cm4_fallback(self):
        result = self.run_boot('raspberrypi,4-compute-module', 'raspberrypi,4-compute-module',
                               dt_board='bcm2711,raven', hat=True, marker=True)
        self.assertEqual(result.returncode, 0)
        self.assertNotIn('GPIO_INITIALIZED', result.stdout)

    def test_uart_requirement(self):
        result = self.run_boot('raspberrypi,4-compute-module', 'bcm2711,mm8108-usb',
                               device='/dev/ttyUSB0')
        self.assertEqual(result.returncode, 1)
        self.assertNotIn('GPIO_INITIALIZED', result.stdout)

    def test_default_stays_auto(self):
        self.assertIn("option board 'auto'", (BSP / 'files/etc/config/gpsd').read_text())


if __name__ == '__main__':
    unittest.main(verbosity=2)
