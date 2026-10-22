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
