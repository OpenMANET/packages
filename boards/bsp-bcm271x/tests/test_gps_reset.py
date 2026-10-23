#!/usr/bin/env python3
"""Run the real GPS reset sequence against simulated GPIO command ownership."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / 'files/etc/init.d/gpsboard.init'
# libgpiod modifies argv while parsing 25=0, so process matching sees 25 0.
TOOLS = r'''#!/usr/bin/env python3
import json, os, subprocess, sys
from pathlib import Path
state_path = Path(os.environ['GPIO_TEST_STATE'])
state = json.loads(state_path.read_text())
command = Path(sys.argv[0]).name
if command == 'gpioset':
    args = sys.argv[1:]
    chip = args[args.index('-c') + 1]
    consumer = args[args.index('-C') + 1]
    offset, value = args[-1].split('=')
    if os.environ.get('FAIL_SET') == args[-1]:
        sys.exit(1)
    if any(h['chip'] == chip and h['offset'] == offset for h in state['holders']):
        sys.exit(1)
    state['holders'].append({'chip': chip, 'offset': offset, 'value': value,
                             'cmdline': 'gpioset ' + ' '.join(args).replace('=', ' ')})
    state['events'].append(['set', offset, value])
elif command == 'pkill':
    if os.environ.get('FAIL_KILL'):
        sys.exit(2)
    pattern = sys.argv[-1]
    remaining = []
    matched = False
    for holder in state['holders']:
        result = subprocess.run(['grep', '-Eq', '--', pattern],
                                input=holder['cmdline'], text=True)
        if result.returncode == 0:
            state['events'].append(['release', holder['offset']])
            matched = True
        else:
            remaining.append(holder)
    state['holders'] = remaining
    state_path.write_text(json.dumps(state))
    sys.exit(0 if matched else 1)
state_path.write_text(json.dumps(state))
'''


def holder(offset, value, consumer='gps-wm1302', chip='gpiochip0', legacy=False):
    assignment = f'{offset}={value}' if legacy else f'{offset} {value}'
    return {'chip': chip, 'offset': str(offset), 'value': str(value),
            'cmdline': f'gpioset -c {chip} -C {consumer} -z {assignment}'}


class GPSResetTests(unittest.TestCase):
    def run_reset(self, holders=(), **failures):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            state_file = root / 'state.json'
            state_file.write_text(json.dumps({'holders': list(holders), 'events': []}))
            for command in ['gpioset', 'pkill']:
                executable = root / command
                executable.write_text(TOOLS)
                executable.chmod(0o755)
            sleep = root / 'sleep'
            sleep.write_text('#!/bin/sh\nexit 0\n')
            sleep.chmod(0o755)
            result = subprocess.run(['/bin/sh', '-c', '''
. "$1"
logger() { echo "$*"; }
init_gps_gpio
''', 'test', str(SCRIPT)], text=True, capture_output=True,
                env={**os.environ, 'PATH': str(root) + ':' + os.environ['PATH'],
                     'GPIO_TEST_STATE': str(state_file), **failures}, check=False)
            return result, json.loads(state_file.read_text())

    def test_reset_releases_holders_between_low_high_low(self):
        for legacy in [False, True]:
            with self.subTest(legacy=legacy):
                result, state = self.run_reset([
                    holder(12, 1, legacy=legacy), holder(25, 1, legacy=legacy)])
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                self.assertEqual([event for event in state['events'] if event[0] == 'set'],
                                 [['set', '12', '0'], ['set', '25', '0'],
                                  ['set', '25', '1'], ['set', '25', '0']])
                self.assertEqual(sorted((h['offset'], h['value']) for h in state['holders']),
                                 [('12', '0'), ('25', '0')])
                self.assertIn('initialization completed', result.stdout)

    def test_other_consumers_and_gpio125_are_untouched(self):
        unrelated = [holder(25, 1, consumer='raven-gps', chip='gpiochip1'),
                     holder(25, 1, consumer='other', chip='gpiochip2'),
                     holder(25, 1, chip='gpiochip3'), holder(125, 1)]
        result, state = self.run_reset(unrelated)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        for owner in unrelated:
            self.assertIn(owner, state['holders'])

    def test_gpio_request_failure_is_reported(self):
        result, state = self.run_reset(FAIL_SET='25=1')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('ERROR: could not request GPIO25=1', result.stdout)
        self.assertNotIn('initialization completed', result.stdout)
        self.assertNotIn(['set', '25', '1'], state['events'])

    def test_gpio_release_failure_is_reported(self):
        result, state = self.run_reset(FAIL_KILL='1')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('ERROR: could not release GPS GPIO25', result.stdout)
        self.assertNotIn('initialization completed', result.stdout)
        self.assertEqual(state['events'], [])


if __name__ == '__main__':
    unittest.main(verbosity=2)
