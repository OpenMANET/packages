#!/usr/bin/env python3
"""Reproduce a daemonized GPIO holder retaining the real procd lock FD."""
import os
from pathlib import Path
import signal
import subprocess
import tempfile
import time
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / 'files/etc/init.d/gpsboard.init'
HOLDER = r"""#!/usr/bin/env python3
import os, time
from pathlib import Path
pid = os.fork()
if pid:
    raise SystemExit(0)
os.setsid()
Path(os.environ['HOLDER_PID']).write_text(str(os.getpid()))
for fd in (0, 1, 2):
    try: os.close(fd)
    except OSError: pass
time.sleep(30)
"""


def probe(source):
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        script = root / 'gpsboard.init'; script.write_text(source)
        tool = root / 'gpioset'; tool.write_text(HOLDER); tool.chmod(0o755)
        lock = root / 'procd.lock'; pid_file = root / 'holder.pid'
        pid = None
        try:
            result = subprocess.run(['bash', '-c', r"""
set -e
exec 1000>"$1"
flock -x 1000
. "$2"
set_gpio_persistent 12 0
""", 'test', str(lock), str(script)],
                env={**os.environ, 'PATH': str(root)+':'+os.environ['PATH'],
                     'HOLDER_PID': str(pid_file)}, capture_output=True, timeout=5)
            if result.returncode:
                raise AssertionError(result.stderr.decode())
            deadline = time.monotonic()+3
            while not pid_file.exists() and time.monotonic()<deadline: time.sleep(0.01)
            pid = int(pid_file.read_text())
            os.kill(pid, 0)  # GPIO state is still held by the live daemon.
            return subprocess.run(['flock','-n',str(lock),'true'], timeout=3).returncode
        finally:
            if pid is None and pid_file.exists(): pid = int(pid_file.read_text())
            if pid is not None:
                try: os.kill(pid, signal.SIGTERM)
                except ProcessLookupError: pass


class GPSLockTests(unittest.TestCase):
    def test_live_gpio_holder_does_not_block_service_lock(self):
        self.assertEqual(probe(SCRIPT.read_text()), 0)

    def test_negative_control_reproduces_stuck_service_lock(self):
        original = SCRIPT.read_text().replace(' 1000>&-', '')
        self.assertEqual(probe(original), 1)


if __name__ == '__main__': unittest.main(verbosity=2)
