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
const loads = [];
let openmanetdPresent = true;
let stopAfterReset = false;
const uci = {
	load(config) {
		loads.push(config);
		return openmanetdPresent ? Promise.resolve() : Promise.reject(new Error('not installed'));
	},
	get(config, section) {
		return config === 'openmanetd' && section === 'config' && openmanetdPresent ? {} : undefined;
	},
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
		if (stopAfterReset) {
			throw expectedStop;
		}
		return {
			wifiDevices: [],
			morseMeshApInterfaceName: 'mesh_ap',
		};
	},
};

const meshWizard = new Function(
	'form', 'morseuci', 'morseui', 'uci', 'widgets', 'wizard', '_', source,
)({}, {}, {}, uci, {}, wizard, value => value);

assert.deepEqual(meshWizard.getExtraConfigFiles(), ['mesh11sd'],
	'openmanetd must not become a required EKH configuration file');
assert(acl.read.uci.includes('openmanetd'),
	'the wizard must be allowed to load the openmanetd UCI namespace');
assert(acl.write.uci.includes('openmanetd'),
	'the wizard must be allowed to update the openmanetd UCI namespace');

async function test() {
	await meshWizard.loadPages();
	assert.deepEqual(loads, ['openmanetd'],
		'the wizard must load the optional openmanetd UCI namespace');

	stopAfterReset = true;
	assert.throws(() => meshWizard.parseWizardOptions(), error => error === expectedStop);
	assert.deepEqual(writes, [{
		config: 'openmanetd',
		section: 'config',
		option: 'dhcpconfigured',
		value: '0',
	}], 'applying mesh topology must request a new address reservation');

	writes.length = 0;
	openmanetdPresent = false;
	await meshWizard.loadPages();
	assert.throws(() => meshWizard.parseWizardOptions(), error => error === expectedStop);
	assert.deepEqual(writes, [],
		'the wizard must remain usable when openmanetd is not installed');
}

test().catch(error => {
	setImmediate(() => { throw error; });
});
