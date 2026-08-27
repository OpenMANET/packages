'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const sourcePath = path.join(__dirname,
	'../htdocs/luci-static/resources/view/morse/meshwizard.js');
const source = fs.readFileSync(sourcePath, 'utf8');
const aclPath = path.join(__dirname,
	'../root/usr/share/rpcd/acl.d/luci-app-ekhwizards.json');
const acl = JSON.parse(fs.readFileSync(aclPath, 'utf8'))['luci-app-ekhwizards'];

const expectedStop = new Error('stop after reservation reset');
const writes = [];
const uci = {
	set(config, section, option, value) {
		writes.push({ config, section, option, value });
	},
};
const wizard = {
	AbstractWizardView: {
		extend: value => value,
	},
	resetUciNetworkTopology() {},
	readSectionInfo() {
		throw expectedStop;
	},
};

const meshWizard = new Function(
	'form', 'morseuci', 'morseui', 'uci', 'widgets', 'wizard', '_', source,
)({}, {}, {}, uci, {}, wizard, value => value);

assert.deepEqual(meshWizard.getExtraConfigFiles(), ['mesh11sd', 'openmanetd'],
	'the wizard must load the openmanetd UCI namespace');
assert(acl.read.uci.includes('openmanetd'),
	'the wizard must be allowed to load the openmanetd UCI namespace');
assert(acl.write.uci.includes('openmanetd'),
	'the wizard must be allowed to update the openmanetd UCI namespace');

assert.throws(() => meshWizard.parseWizardOptions(), error => error === expectedStop);
assert.deepEqual(writes, [{
	config: 'openmanetd',
	section: 'config',
	option: 'dhcpconfigured',
	value: '0',
}], 'applying mesh topology must request a new address reservation');
