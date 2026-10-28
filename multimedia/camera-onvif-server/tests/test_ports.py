#!/usr/bin/env python3
"""Exercise the real ONVIF init/migration scripts without camera hardware."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

PACKAGE = Path(__file__).resolve().parents[1]
UCI = r'''#!/usr/bin/env python3
import json, os, sys
from pathlib import Path
p = Path(os.environ['PORT_STATE'])
s = json.loads(p.read_text())
args = [a for a in sys.argv[1:] if a != '-q']
if args[0] == 'get':
    key = args[1]
    if key.endswith('.api_address'):
        print('127.0.0.1:9997')
    elif key.endswith('.rtsp_address'):
        print(':554')
    else:
        _, section, option = key.split('.', 2)
        if option not in s['sections'].get(section, {}):
            sys.exit(1)
        print(s['sections'][section][option])
elif args[0] == 'set':
    if os.environ.get('FAIL_SET'):
        sys.exit(1)
    key, value = args[1].split('=', 1)
    _, section, option = key.split('.', 2)
    s['sections'][section][option] = value
    s['events'].append(args)
elif args[0] == 'commit':
    if os.environ.get('FAIL_COMMIT'):
        sys.exit(1)
    s['events'].append(args)
p.write_text(json.dumps(s))
'''
FUNCTIONS = r'''
config_load() { :; }
config_get() {
    local value
    value="$(uci -q get "camera-onvif-server.$2.$3")" || value="${4-}"
    export "$1=$value"
}
config_foreach() {
    local callback="$1" section
    for section in $PORT_SECTIONS; do "$callback" "$section"; done
}
'''
INIT_STUBS = r'''
procd_open_instance() { :; }
procd_close_instance() { :; }
procd_set_param() {
    if [ "$1" = command ]; then printf '%s\n' "$@" > "$PORT_COMMAND"; fi
}
json_init() { :; }
json_add_string() { :; }
json_close_object() { :; }
json_dump() { printf '{}'; }
network_get_ipaddr() { export "$1=192.0.2.1"; }
network_is_up() { return 0; }
ucode() { printf '<properties/>'; }
'''


class PortTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.state = self.root / 'state.json'
        self.command = self.root / 'command'
        self.config = self.root / 'camera.config'
        self.config.touch()
        (self.root / 'run').mkdir()
        network = self.root / 'lib/functions/network.sh'
        network.parent.mkdir(parents=True)
        network.write_text('')
        self.functions = self.root / 'functions.sh'
        self.functions.write_text(FUNCTIONS)
        tool = self.root / 'uci'
        tool.write_text(UCI)
        tool.chmod(0o755)
        self.env = dict(os.environ, PATH=f'{self.root}:{os.environ["PATH"]}',
                        PORT_STATE=str(self.state), PORT_COMMAND=str(self.command),
                        IPKG_INSTROOT=str(self.root))

    def prepare(self, sections):
        self.state.write_text(json.dumps({'sections': sections, 'events': []}))
        self.env['PORT_SECTIONS'] = ' '.join(sections)

    def migrate(self, **env):
        script = (PACKAGE / 'files/45-camera-onvif-port').read_text()
        script = script.replace('/etc/config/camera-onvif-server', str(self.config))
        script = script.replace('/lib/functions.sh', str(self.functions))
        result = subprocess.run(['sh', '-s'], input=script, text=True,
                                env=dict(self.env, **env), capture_output=True)
        return result, json.loads(self.state.read_text())

    def test_migrate_legacy_defaults_and_preserve_custom_ports(self):
        for port in (None, '8080', '8081', '8082', '9000'):
            with self.subTest(port=port):
                options = {'interface': 'ahwlan'}
                if port is not None:
                    options['service_port'] = port
                self.prepare({'rpicamera': options})
                result, state = self.migrate()
                self.assertEqual(result.returncode, 0, result.stderr)
                changed = port in (None, '8080', '8081')
                expected = '8082' if changed else port
                self.assertEqual(state['sections']['rpicamera'],
                                 {'interface': 'ahwlan', 'service_port': expected})
                self.assertEqual(len(state['events']), 2 if changed else 0)
                first = state
                result, state = self.migrate()
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(state, first, 'migration must be idempotent')

    def test_multiple_sections(self):
        self.prepare({'rpicamera': {'service_port': '8081'},
                      'custom': {'service_port': '9000'}})
        result, state = self.migrate()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(state['sections']['rpicamera']['service_port'], '8082')
        self.assertEqual(state['sections']['custom']['service_port'], '9000')
        self.assertEqual(state['events'][-1], ['commit', 'camera-onvif-server'])

    def test_missing_package_is_noop(self):
        self.prepare({})
        self.config.unlink()
        result, state = self.migrate()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(state['events'], [])

    def test_uci_failures_are_reported(self):
        for failure in ('FAIL_SET', 'FAIL_COMMIT'):
            with self.subTest(failure=failure):
                self.prepare({'rpicamera': {'service_port': '8081'}})
                result, _ = self.migrate(**{failure: '1'})
                self.assertNotEqual(result.returncode, 0)

    def test_init_uses_safe_fallback_and_preserves_custom_port(self):
        for port in (None, '8082', '9000'):
            with self.subTest(port=port):
                self.prepare({'rpicamera': {} if port is None else {'service_port': port}})
                script = (PACKAGE / 'files/camera-onvif-server.init').read_text()
                script = script.replace('/var/run/', str(self.root / 'run') + '/')
                script = script.replace('/dev/video0', str(self.config))
                script += '\n' + FUNCTIONS + INIT_STUBS + '\nstart_instance rpicamera\n'
                # The upstream init uses ash's extended ${value/pattern/}
                # expansion; bash supplies the same expansion on the host.
                result = subprocess.run(['bash', '-s'], input=script, text=True,
                                        env=self.env, capture_output=True)
                self.assertEqual(result.returncode, 0, result.stderr)
                args = self.command.read_text().splitlines()
                self.assertEqual(args[:5], ['command', 'camera-onvif-server',
                                           '192.0.2.1', '--port', port or '8082'])

    def test_fresh_config_uses_8082(self):
        config = (PACKAGE / 'files/camera-onvif-server.config').read_text()
        self.assertIn('option service_port 8082', config)
        self.assertNotIn('service_port 8081', config)


if __name__ == '__main__':
    unittest.main()
