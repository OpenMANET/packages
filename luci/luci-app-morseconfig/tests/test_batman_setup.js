'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const sourcePath = path.join(__dirname,
	'../htdocs/luci-static/resources/tools/morse/uci.js');
const source = fs.readFileSync(sourcePath, 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));

function createUCI(initial) {
	const configs = clone(initial);
	let anonymousID = 0;

	function ensureConfig(config) {
		if (!configs[config]) {
			configs[config] = {};
		}
		return configs[config];
	}

	return {
		configs,
		sections(config, type) {
			return Object.values(ensureConfig(config))
				.filter(section => !type || section['.type'] === type);
		},
		add(config, type, name) {
			const sections = ensureConfig(config);
			const sectionName = name || `cfg${++anonymousID}`;
			if (sections[sectionName]) {
				throw new Error(`duplicate UCI section ${config}.${sectionName}`);
			}
			sections[sectionName] = {
				'.name': sectionName,
				'.type': type,
			};
			return sectionName;
		},
		get(config, section, option) {
			const value = ensureConfig(config)[section];
			return option === undefined ? value : value && value[option];
		},
		set(config, section, option, value) {
			const target = ensureConfig(config)[section];
			if (!target) {
				throw new Error(`missing UCI section ${config}.${section}`);
			}
			target[option] = value;
		},
	};
}

function loadModule(uci) {
	const baseclass = { extend: value => value };
	const L = { toArray: value => Array.isArray(value) ? value : value == null ? [] : [value] };
	const translate = value => value;
	return new Function('baseclass', 'uci', 'network', 'L', '_', source)(
		baseclass, uci, {}, L, translate);
}

function fixture() {
	return {
		network: {
			ahwlan_bridge: {
				'.name': 'ahwlan_bridge',
				'.type': 'device',
				type: 'bridge',
				name: 'br-ahwlan',
				ports: ['eth1'],
			},
			lan: {
				'.name': 'lan',
				'.type': 'interface',
			},
		},
		wireless: {
			radio0: {
				'.name': 'radio0',
				'.type': 'wifi-device',
				type: 'morse',
			},
			default_radio0: {
				'.name': 'default_radio0',
				'.type': 'wifi-iface',
			},
		},
		mesh11sd: {
			mesh_params: {
				'.name': 'mesh_params',
				'.type': 'mesh11sd',
			},
		},
		firewall: {
			ahwlan_wan: {
				'.name': 'ahwlan_wan',
				'.type': 'forwarding',
				src: 'ahwlan',
				dest: 'wan',
			},
			stale_ahwlan_lan: {
				'.name': 'stale_ahwlan_lan',
				'.type': 'forwarding',
				src: 'ahwlan',
				dest: 'lan',
				enabled: '0',
			},
		},
	};
}

function assertConverged(uci) {
	for (const name of ['batmesh0', 'batmesh1']) {
		assert.equal(uci.configs.network[name].proto, 'batadv_hardif');
		assert.equal(uci.configs.network[name].master, 'bat0');
	}
	assert.deepEqual(uci.configs.network.ahwlan_bridge.ports, ['eth1', 'bat0']);
	assert.equal(uci.configs.wireless.default_radio0.network, 'batmesh0');
	assert.equal(uci.configs.mesh11sd.mesh_params.mesh_fwding, '0');
	assert.equal(uci.configs.mesh11sd.mesh_params.mesh_nolearn, '1');
	assert.equal(uci.configs.network.lan.dns, '1.1.1.1');
	const activeDestinations = Object.values(uci.configs.firewall)
		.filter(section => section.src === 'ahwlan' && section.enabled !== '0')
		.map(section => section.dest);
	assert.deepEqual(activeDestinations, ['wan']);
	assert.equal(Object.keys(uci.configs.firewall).length, 2,
		'shared Batman setup must not append topology-specific forwardings');
}

{
	const uci = createUCI(fixture());
	const module = loadModule(uci);

	module.setupBatmanInterfaceOnDevice();
	assertConverged(uci);

	const afterFirstRun = clone(uci.configs);
	module.setupBatmanInterfaceOnDevice();
	assertConverged(uci);
	assert.deepEqual(uci.configs, afterFirstRun, 'second run must be idempotent');
}

{
	const initial = fixture();
	initial.network.batmesh0 = {
		'.name': 'batmesh0',
		'.type': 'interface',
		proto: 'static',
		master: 'wrong-device',
	};
	const uci = createUCI(initial);
	const module = loadModule(uci);

	module.setupBatmanInterfaceOnDevice();
	assertConverged(uci);
}

{
	const initial = fixture();
	initial.network.batmesh1 = {
		'.name': 'batmesh1',
		'.type': 'interface',
		proto: 'static',
		master: 'wrong-device',
	};
	const uci = createUCI(initial);
	const module = loadModule(uci);

	module.setupBatmanInterfaceOnDevice();
	assertConverged(uci);
}
