"""Host tests for the radio restoration contract; no radio commands are executed."""
import importlib.machinery
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

path = Path(__file__).resolve().parents[1] / 'files' / 'halow-scanner'
loader = importlib.machinery.SourceFileLoader('scanner_wrapper', str(path))
spec = importlib.util.spec_from_loader(loader.name, loader)
scanner = importlib.util.module_from_spec(spec)
loader.exec_module(scanner)


class RadioLifecycle(unittest.TestCase):
    def run_case(self, up=True, scan_error=None, down_error=None):
        commands = []

        def wireless(action, radio):
            commands.append((action, radio))
            if action == 'down' and down_error:
                raise down_error

        with patch.object(scanner, 'validate_radio', return_value=up), \
             patch.object(scanner, 'wireless', side_effect=wireless), \
             patch.object(scanner, 'wait_radio'), \
             patch.object(scanner.time, 'sleep'), \
             patch.object(scanner.signal, 'signal'), \
             patch.object(scanner, 'run_scan', side_effect=scan_error, return_value=7) as run:
            if scan_error or down_error:
                with self.assertRaises(type(scan_error or down_error)):
                    scanner.scan('radio0', ['-b', '2'])
            else:
                self.assertEqual(scanner.scan('radio0', ['-b', '2']), 7)
            if down_error:
                run.assert_not_called()
        return commands

    def test_running_radio_is_restored_and_exit_code_preserved(self):
        self.assertEqual(self.run_case(), [('down', 'radio0'), ('up', 'radio0')])

    def test_previously_down_radio_stays_down(self):
        self.assertEqual(self.run_case(up=False), [])

    def test_interrupt_restores_radio(self):
        self.assertEqual(self.run_case(scan_error=KeyboardInterrupt()),
                         [('down', 'radio0'), ('up', 'radio0')])

    def test_scanner_failure_restores_radio(self):
        self.assertEqual(self.run_case(scan_error=OSError('failed to start')),
                         [('down', 'radio0'), ('up', 'radio0')])

    def test_failed_down_attempt_restores_radio_without_scanning(self):
        self.assertEqual(self.run_case(down_error=RuntimeError('ubus failed')),
                         [('down', 'radio0'), ('up', 'radio0')])

    def test_invalid_radio_never_changes_state(self):
        with patch.object(scanner, 'validate_radio', side_effect=ValueError('not HaLow')), \
             patch.object(scanner, 'wireless') as wireless:
            with self.assertRaises(ValueError):
                scanner.scan('radio1', [])
            wireless.assert_not_called()

    def test_default_scan_does_not_touch_radios(self):
        with patch.object(scanner, 'wireless') as wireless, \
             patch.object(scanner, 'run_scan', return_value=0):
            self.assertEqual(scanner.scan(None, []), 0)
            wireless.assert_not_called()

    def test_down_timeout_prevents_scan_and_restores(self):
        with patch.object(scanner, 'validate_radio', return_value=True), \
             patch.object(scanner, 'wireless') as wireless, \
             patch.object(scanner, 'wait_radio', side_effect=[RuntimeError('timeout'), None]), \
             patch.object(scanner.signal, 'signal'), \
             patch.object(scanner, 'run_scan') as run:
            with self.assertRaises(RuntimeError):
                scanner.scan('radio0', [])
            self.assertEqual([c.args[0] for c in wireless.call_args_list], ['down', 'up'])
            run.assert_not_called()


if __name__ == '__main__':
    unittest.main()
