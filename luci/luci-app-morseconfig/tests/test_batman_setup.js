'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const sourcePath = path.join(__dirname,
	'../htdocs/luci-static/resources/tools/morse/uci.js');
const source = fs.readFileSync(sourcePath, 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));

const onboardPath = 'platform/soc/fe300000.mmcnr/mmc_host/mmc1/mmc1:0001/mmc1:0001:1';

{
	const helper = loadModule(createUCI({}));
	for (const path of [onboardPath, onboardPath.replace('fe300000', '3f300000')]) {
		for (const band of ['2g', '5g']) {
			const radio = { type: 'mac80211', path, band };
			assert(helper.isRaspberryPiBuiltinWifi(radio));
			for (const encryption of ['sae', 'sae-mixed', 'sae+ccmp', 'wpa3', 'wpa3-mixed']) {
				assert.equal(helper.isWifiEncryptionAllowed(radio, encryption), false);
				assert.equal(typeof helper.validateWifiEncryption(radio, encryption), 'string');
			}
			for (const encryption of ['psk2', 'psk2+ccmp', 'psk', 'none', 'owe']) {
				assert.equal(helper.validateWifiEncryption(radio, encryption), true);
			}
		}
	}
	for (const radio of [undefined, { type: 'morse', path: onboardPath },
		{ type: 'mac80211', path: 'platform/usb/1-1' },
		{ type: 'mac80211', path: 'pci0000:00/0000:00:00.0' }]) {
		assert.equal(helper.isWifiEncryptionAllowed(radio, 'sae'), true,
			'HaLow and external adapters retain WPA3');
	}
}

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
		unset(config, section, option) {
			if (option.startsWith('.')) return;
			delete ensureConfig(config)[section][option];
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

function loadWizard(uci, morseuci) {
	const wizardSource = fs.readFileSync(path.join(__dirname,
		'../htdocs/luci-static/resources/tools/morse/wizard.js'), 'utf8');
	return new Function('baseclass', 'view', 'rpc', 'uci', 'morseuci', '_', wizardSource)(
		{ extend: value => value }, { extend: value => value },
		{ declare: () => () => {} }, uci, morseuci, value => value);
}

// Run the actual reset whitelist, stopping before unrelated DHCP/topology work.
for (const override of ['0', '1']) {
	const uci = createUCI({ wireless: { onboard: {
		'.name': 'onboard', '.type': 'wifi-device', type: 'mac80211',
		band: '2g', path: onboardPath, short_gi_40: override,
	} } });
	const sections = uci.sections;
	const stop = new Error('stop after wireless reset');
	uci.sections = (config, type) => {
		if (config === 'dhcp') throw stop;
		return sections(config, type);
	};
	for (let run = 0; run < 2; run++) {
		assert.throws(() => loadWizard(uci, {}).resetUci(), error => error === stop);
		assert.equal(uci.configs.wireless.onboard.short_gi_40, override);
	}
}

// The workaround must run after the wizard has applied the selected band.
async function testWizardHtSave() {
	const uci = createUCI({ wireless: { onboard: {
		'.name': 'onboard', '.type': 'wifi-device', type: 'mac80211',
		band: '5g', path: onboardPath,
	} } });
	const helper = loadModule(uci);
	const stop = new Error('stop before Batman save');
	const wizard = loadWizard(uci, {
		applyOnboardWifiHtDefaults() {
			helper.applyOnboardWifiHtDefaults();
			throw stop;
		},
	});
	await assert.rejects(wizard.AbstractWizardView.save.call({
		parseWizardOptions() { uci.set('wireless', 'onboard', 'band', '2g'); },
	}), error => error === stop);
	assert.equal(uci.configs.wireless.onboard.short_gi_40, '0');
}

testWizardHtSave().catch(error => { setImmediate(() => { throw error; }); });

function fixture() {
	return {
		network: {
			ahwlan: {
				'.name': 'ahwlan', '.type': 'interface', device: 'br-ahwlan',
			},
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
				device: 'radio0', mode: 'mesh', ifname: 'wlh0', network: 'ahwlan',
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

for (const [overrides, expected] of [
	[{}, '0'],
	[{ band: '5g' }, undefined],
	[{ short_gi_40: '0' }, '0'],
	[{ short_gi_40: '1' }, '1'],
	[{ path: onboardPath.replaceAll('mmc1', 'mmc2') }, '0'],
	[{ path: 'platform/soc/3f300000.mmcnr/mmc_host/mmc1/mmc1:0001/mmc1:0001:1' }, undefined],
	[{ path: 'platform/soc/fe204000.spi/spi_master/spi0/spi0.0', type: 'morse' }, undefined],
	[{ path: 'platform/usb/1-1' }, undefined],
	[{ path: undefined }, undefined],
]) {
	const initial = fixture();
	initial.wireless.onboard = { '.name': 'onboard', '.type': 'wifi-device',
		type: 'mac80211', band: '2g', path: onboardPath, channel: '6', htmode: 'HT20', ...overrides };
	const uci = createUCI(initial);
	const module = loadModule(uci);
	module.applyOnboardWifiHtDefaults();
	assert.equal(uci.configs.wireless.onboard.short_gi_40, expected);
	const expectedState = clone(initial);
	if (expected !== undefined) expectedState.wireless.onboard.short_gi_40 = expected;
	assert.deepEqual(uci.configs, expectedState, 'only the targeted HT capability may change');
	module.applyOnboardWifiHtDefaults();
	assert.deepEqual(uci.configs, expectedState, 'HT workaround must survive a rerun');
}

function assertConverged(uci) {
	for (const name of ['batmesh0', 'batmesh1']) {
		assert.equal(uci.configs.network[name].proto, 'batadv_hardif');
		assert.equal(uci.configs.network[name].master, 'bat0');
	}
	assert.equal(uci.configs.network.ahwlan.device, 'br-ahwlan');
	const bridge = uci.sections('network', 'device').find(d => d.name === 'br-ahwlan');
	assert.deepEqual(bridge.ports, ['eth1', 'bat0']);
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

// Exercise partial topologies for both roles, including repeated role changes.
for (const state of ['missing', 'direct', 'wrong-binding', 'old-bridge', 'wan-binding', 'raw-radio', 'string-ports']) {
	const initial = fixture();
	initial.network.wan = { '.name': 'wan', '.type': 'interface', device: 'eth0', proto: 'dhcp' };
	if (state === 'missing') delete initial.network.ahwlan_bridge;
	if (state === 'direct') {
		delete initial.network.ahwlan_bridge;
		initial.network.ahwlan.device = 'eth1';
	}
	if (state === 'wrong-binding') initial.network.ahwlan.device = 'br-missing';
	if (state === 'old-bridge') {
		delete initial.network.ahwlan_bridge;
		initial.network.old_bridge = { '.name': 'old_bridge', '.type': 'device',
			type: 'bridge', name: 'br-old', ports: ['eth1'] };
		initial.network.ahwlan.device = 'br-old';
	}
	if (state === 'wan-binding') initial.network.ahwlan.device = 'eth0';
	if (state === 'raw-radio') initial.network.ahwlan_bridge.ports = ['eth1', 'wlh0', 'bat0', 'bat0', 'eth0'];
	if (state === 'string-ports') initial.network.ahwlan_bridge.ports = 'eth1';
	const uci = createUCI(initial);
	const module = loadModule(uci);
	for (const role of ['server', 'client', 'server']) {
		module.setupBatmanDeviceOnNetwork(role);
		module.setupBatmanInterfaceOnDevice();
		const bridge = uci.sections('network', 'device').find(d => d.name === 'br-ahwlan');
		assert(bridge.ports.includes('bat0'), state);
		assert(!bridge.ports.includes('eth0'), 'must not bridge the WAN uplink');
		assert(!bridge.ports.includes('wlh0'), 'raw HaLow must not be a bridge port');
		assert(!bridge.ports.includes('br-missing'), 'do not add a dangling bridge reference as a port');
		assert.equal(uci.configs.network.ahwlan.device, 'br-ahwlan');
		assert.equal(uci.configs.network.bat0.gw_mode, role);
		assert.equal(uci.configs.wireless.default_radio0.network, 'batmesh0');
		assert.deepEqual(uci.configs.network.wan, initial.network.wan);
		assert.deepEqual(uci.configs.firewall, initial.firewall);
		if (state !== 'missing') assert(bridge.ports.includes('eth1'), state);
		if (state === 'old-bridge') assert.equal(uci.configs.network.old_bridge.ports, undefined);
		const before = clone(uci.configs);
		module.setupBatmanDeviceOnNetwork(role);
		module.setupBatmanInterfaceOnDevice();
		assert.deepEqual(uci.configs, before, `${state}: rerun ${role}`);
	}
}

{
	const initial = fixture();
	initial.network.wan = { '.name': 'wan', '.type': 'interface', device: 'br-uplink', proto: 'dhcp' };
	initial.network.uplink = { '.name': 'uplink', '.type': 'device', type: 'bridge',
		name: 'br-uplink', ports: ['eth0'] };
	initial.network.ahwlan.device = 'br-uplink';
	initial.network.ahwlan_bridge.ports.push('eth0');
	const uci = createUCI(initial);
	loadModule(uci).setupBatmanInterfaceOnDevice();
	assertConverged(uci);
	assert.deepEqual(uci.configs.network.uplink, initial.network.uplink,
		'do not steal ports from a bridge owned by the uplink');
}

{
	const initial = fixture();
	initial.wireless.custom_mesh = { ...initial.wireless.default_radio0, '.name': 'custom_mesh' };
	initial.wireless.default_radio0.mode = 'ap';
	const uci = createUCI(initial);
	loadModule(uci).setupBatmanInterfaceOnDevice();
	assert.equal(uci.configs.wireless.custom_mesh.network, 'batmesh0');
	assert.deepEqual(uci.configs.wireless.default_radio0, initial.wireless.default_radio0,
		'leave the companion AP unchanged');
}

for (const state of ['missing-radio', 'no-mesh', 'ambiguous', 'disabled', 'missing-network', 'shared-bridge']) {
	const initial = fixture();
	if (state === 'missing-radio') delete initial.wireless.radio0;
	if (state === 'no-mesh') initial.wireless.default_radio0.mode = 'ap';
	if (state === 'disabled') initial.wireless.default_radio0.disabled = '1';
	if (state === 'ambiguous') initial.wireless.second = {
		...initial.wireless.default_radio0, '.name': 'second',
	};
	if (state === 'missing-network') delete initial.network.ahwlan;
	if (state === 'shared-bridge') initial.network.lan.device = 'br-ahwlan';
	const uci = createUCI(initial);
	assert.throws(() => loadModule(uci).setupBatmanInterfaceOnDevice(), undefined, state);
	assert.deepEqual(uci.configs, initial, `${state}: reject without partial writes`);
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
