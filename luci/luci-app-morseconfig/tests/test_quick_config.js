'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname,
	'../htdocs/luci-static/resources/view/morse/config.js'), 'utf8');

// Load the real view and construct its wireless fields with a minimal LuCI
// host. Inspect the choices passed to the widget, not a copied filter.
const base = { extend: methods => methods };
const network = [
	{ '.name': 'ahwlan', proto: 'static' },
	{ '.name': 'lan', proto: 'dhcp' },
	{ '.name': 'bat0', proto: 'batadv' },
	{ '.name': 'batmesh0', proto: 'batadv_hardif' },
	{ '.name': 'batmesh1', proto: 'batadv_hardif' },
	{ '.name': 'loopback', proto: 'static' },
];
const wireless = {
	radio0: { type: 'mac80211' },
	radio1: { type: 'morse' },
};
const uci = {
	get: (config, section, key) => key ? wireless[section]?.[key] : wireless[section],
	sections: config => config === 'network' ? network : [],
};
let dropdown;
const deps = {
	_: text => text,
	E: (...args) => args,
	document: { querySelector: () => ({ appendChild() {} }) },
	L: { resourceCacheBusted: p => p, env: {}, bind: (fn, self, ...args) => fn?.bind(self, ...args) },
	rpc: { declare: () => () => {} },
	form: { ListValue: base, Value: base },
	view: base,
	uci,
	morseui: {},
	morseuci: { getZoneForNetwork: () => null },
	firewall: { getZoneColorStyle: () => '' },
	ui: { Dropdown: function(value, choices, options) {
		dropdown = { value, choices, options };
		this.render = () => dropdown;
	} },
};
const view = new Function(...Object.keys(deps), source)(...Object.values(deps));

for (const [radio, binding] of [['radio1', 'batmesh0'], ['radio0', 'ahwlan']]) {
	const fields = {};
	const map = { section: () => ({ option(type, name) {
		const choices = {};
		const option = Object.assign({
			value: (key, label) => { choices[key] = label; },
			depends() {},
			transformChoices: () => ({ ...choices }),
			cbid: id => id,
			map: {},
		}, type);
		fields[name] = option;
		return option;
	} }) };
	view.renderWifiInterfaces(map, radio);
	fields.network.renderWidget('default_' + radio, 0, binding);
	assert.equal(dropdown.value, binding);
	assert.ok(Object.hasOwn(dropdown.choices, binding),
		`${binding} must remain selectable when unrelated radio settings are saved`);
	assert.ok(Object.hasOwn(dropdown.choices, 'batmesh1'));
	assert.ok(!Object.hasOwn(dropdown.choices, 'bat0'), 'do not offer BATMAN soft interfaces');
	assert.ok(!Object.hasOwn(dropdown.choices, 'loopback'));
}

// An administratively disabled hard interface must also retain its binding.
network.find(n => n['.name'] === 'batmesh0').disabled = '1';
let disabledChoices;
view.renderWifiInterfaces({ section: () => ({ option(type, name) {
	const choices = {};
	if (name === 'network') disabledChoices = choices;
	return { value: key => { choices[key] = true; }, depends() {} };
} }) }, 'radio1');
assert.ok(disabledChoices.batmesh0);

console.log('Quick Configuration preserves BATMAN network choices: PASS');

// Exercise the real save hook and bridge helpers with the device's topology.
// A mesh wifi-iface counts as multiple devices in the generic bridge helper;
// that rule must never turn a BATMAN hard interface into a Linux bridge.
const configs = {
	network: [
		{ '.name': 'loopback', '.type': 'interface', proto: 'static', device: 'lo' },
		{ '.name': 'wan', '.type': 'interface', proto: 'dhcp' },
		{ '.name': 'bat0', '.type': 'interface', proto: 'batadv' },
		{ '.name': 'ahwlan', '.type': 'interface', proto: 'static', device: 'br-ahwlan' },
		{ '.name': 'lanbridge', '.type': 'device', name: 'br-ahwlan', type: 'bridge', ports: ['eth0', 'bat0'] },
		{ '.name': 'batmesh0', '.type': 'interface', proto: 'batadv_hardif', master: 'bat0' },
		{ '.name': 'batmesh1', '.type': 'interface', proto: 'batadv_hardif', master: 'bat0' },
	],
	wireless: [
		{ '.name': 'radio0', '.type': 'wifi-device', type: 'mac80211' },
		{ '.name': 'radio1', '.type': 'wifi-device', type: 'morse' },
		{ '.name': 'default_radio0', '.type': 'wifi-iface', device: 'radio0', network: 'ahwlan', mode: 'ap', ssid: 'before' },
		{ '.name': 'default_radio1', '.type': 'wifi-iface', device: 'radio1', network: 'batmesh0', mode: 'mesh' },
	],
};
const liveUci = {
	sections: (config, type) => (configs[config] || []).filter(s => !type || s['.type'] === type),
	get(config, section, key) {
		const s = this.sections(config).find(s => s['.name'] === section);
		return key ? s?.[key] : s;
	},
	set(config, section, key, value) { this.get(config, section)[key] = value; },
	unset(config, section, key) { delete this.get(config, section)[key]; },
	add(config, type) {
		const name = `cfg${configs[config].length}`;
		configs[config].push({ '.name': name, '.type': type });
		return name;
	},
};
const liveL = { ...deps.L, toArray: value => value == null ? [] : Array.isArray(value) ? value : value.split(/\s+/) };
const helperSource = fs.readFileSync(path.join(__dirname,
	'../htdocs/luci-static/resources/tools/morse/uci.js'), 'utf8');
const helpers = new Function('baseclass', 'uci', 'network', 'L', '_', helperSource)(base, liveUci, {}, liveL, deps._);
const saveDeps = { ...deps, uci: liveUci, L: liveL, morseuci: helpers };
const saveView = new Function(...Object.keys(saveDeps), source)(...Object.values(saveDeps));
saveView.wifiDevices = {};
const originalNetwork = JSON.stringify(configs.network);
for (const ssid of ['after', 'before', 'after-again']) {
	liveUci.set('wireless', 'default_radio0', 'ssid', ssid);
	saveView.preSaveHook();
	assert.equal(JSON.stringify(configs.network), originalNetwork,
		'an AP SSID save must preserve BATMAN interfaces and the existing LAN bridge');
	assert.equal(liveUci.get('wireless', 'default_radio1', 'network'), 'batmesh0');
}

// Keep bridge creation working on the ordinary networks managed by this page.
liveUci.add('network', 'interface');
const normal = configs.network.at(-1);
normal.proto = 'static';
normal.device = 'eth1';
configs.wireless.push({ '.name': 'extra_ap', '.type': 'wifi-iface', device: 'radio0', network: normal['.name'], mode: 'ap' });
saveView.preSaveHook();
assert.ok(normal.device.startsWith('br-'));
assert.deepEqual(configs.network.find(s => s.name === normal.device).ports, ['eth1']);
assert.equal(liveUci.get('network', 'batmesh0', 'device'), undefined);
console.log('Quick Configuration SSID saves preserve BATMAN topology: PASS');
