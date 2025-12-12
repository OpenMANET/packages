/**
 * This page is a simplified one page view of LuCI configuration.
 *
 * The intent is that it provides:
 *  - a starting point for seeing the current state of the system
 *  - an introduction to key LuCI concepts, with the ability to easily get to 'Advanced' settings
 *  - the ability to safely tweak key settings (e.g. IP, DHCP server) no matter
 *    the existing configuration of the device
 *
 * This means it must be:
 *  - agnostic in terms of existing configuration (i.e. can load anything)
 *  - when saving, not touch 'unexpected' parts of the system (i.e. disabling
 *    things, changing forwardings, etc.)
 *
 * This is in contrast to the 'wizard' parts of the system, which are assumed to
 * take control of many aspects of the device to ensure that the user has a working
 * configuration, and may break any existing setup.
 *
 * Areas that are too complex - i.e. where we've tried to do some magical abstraction -
 * can generally be found by looking at the preSaveHook or where .write/.load are over-written.
 * At the moment, these are:
 *  - the 'forwarding' on the networks (can produce new zones/forwards,
 *    and remove existing forwards if they're changed)
 *  - the automatic creation of bridges if necessary (and no _removal_ of bridges)
 */
'use strict';
/* globals configDiagram dom firewall form morseuci morseui network rpc uci ui view widgets */
'require dom';
'require view';
'require rpc';
'require uci';
'require ui';
'require form';
'require network';
'require firewall';
'require tools.morse.uci as morseuci';
'require tools.morse.morseui as morseui';
'require tools.widgets as widgets';
'require custom-elements.morse-config-diagram as configDiagram';

document.querySelector('head').appendChild(E('link', {
	rel: 'stylesheet',
	type: 'text/css',
	href: L.resourceCacheBusted('view/morse/css/config.css'),
}));

const DPP_QRCODE_PATH = `/dpp_qrcode.svg?v=${L.env.sessionid?.slice(10)}`;

const callGetBuiltinEthernetPorts = rpc.declare({
	object: 'luci',
	method: 'getBuiltinEthernetPorts',
	expect: { result: [] },
});

// These are from LuCI's resources/network.js, but unfortunately they're buried
// in a switch statement there.
const WIFI_MODE_NAMES = {
	ap: _('Access Point'),
	sta: _('Client'),
	mesh: _('Mesh Point'),
	adhoc: _('Ad-Hoc'),
	monitor: _('Monitor'),
};

// For HaLow chips, we want to encourage people to set WDS.
const HALOW_WIFI_MODE_NAMES = {
	'ap-wds': _('Access Point (WDS)'),
	'ap': _('Access Point (no WDS)'),
	'sta-wds': _('Client (WDS)'),
	'sta': _('Client (no WDS)'),
	'mesh': _('Mesh Point'),
	'adhoc': _('Ad-Hoc'),
	'monitor': _('Monitor'),
	'none': _('None'), // TODO - APP-2533
};

// These are extracted from LuCI's view/network/wireless.js.
const ENCRYPTION_OPTIONS = {
	'psk2': 'WPA2-PSK',
	'psk-mixed': 'WPA-PSK/WPA2-PSK',
	'psk': 'WPA-PSK',
	'sae': 'WPA3-SAE',
	'sae-mixed': 'WPA2-PSK/WPA3-SAE',
	'wep-open': _('WEP Open System'),
	'wep-shared': _('WEP Shared Key'),
	'wpa3': 'WPA3-EAP',
	'wpa3-mixed': 'WPA2-EAP/WPA3-EAP',
	'wpa2': 'WPA2-EAP',
	'wpa': 'WPA-EAP',
	'owe': 'OWE',
	'none': 'No encryption',
};

const ENCRYPTION_MODES_USING_KEYS = new Set([
	'psk',
	'psk2',
	'psk+psk2',
	'psk-mixed',
	'sae',
	'sae-mixed',
]);

const ENCRYPTION_OPTIONS_FOR_MODE = {
	mac80211: {
		default: ['psk2', 'sae-mixed', 'sae', 'owe', 'wpa3', 'none'],
		mesh: ['sae', 'none'],
		adhoc: ['psk2', 'none'],
		monitor: ['none'],
		none: ['none'],
	},
	morse: {
		default: ['sae', 'owe', 'wpa3', 'none'],
		mesh: ['sae', 'none'],
		adhoc: ['none'],
		monitor: ['none'],
		none: ['none'],
	},
};
ENCRYPTION_OPTIONS_FOR_MODE.default = ENCRYPTION_OPTIONS_FOR_MODE.mac80211;

const GATEWAY_DESCRIPTION = `
<strong>${_('Do I need to set a gateway?')}</strong><br>
${_('Traffic will be forwarded to the gateway when there is no available route.')}<br>
${_('When configured as a DHCP Server, the address is sent to DHCP clients.')}<br>
${_('If this interface is not the connection to external subnets, you don\'t need to set a gateway. Leave it blank.')}<br>
`;

const NETWORK_WITHOUT_DEVICES_INFO = _('This network interface is unused because it has no Wireless interfaces or Ethernet ports. You can add Ethernet ports using the Ethernet column, or add Wireless interfaces by configuring them in the section below.');

// This is based on widgets.NetworkSelect, but uses the zone style colouring
// rather than the attached devices icons.
const SimpleNetworkSelect = form.ListValue.extend({
	__name__: 'CBI.SimpleNetworkSelect',

	renderWidget(section_id, option_index, cfgvalue) {
		const choices = this.transformChoices();
		for (const [k, v] of Object.entries(choices)) {
			choices[k] = E('span', { class: 'zonebadge network-name', style: firewall.getZoneColorStyle(morseuci.getZoneForNetwork(v)) }, v);
		}

		var widget = new ui.Dropdown(cfgvalue, choices, {
			id: this.cbid(section_id),
			sort: true,
			optional: false,
			disabled: (this.readonly != null) ? this.readonly : this.map.readonly,
			display_items: this.display_size || this.size || 3,
			dropdown_items: this.dropdown_size || this.size || 5,
			datatype: 'uciname',
			validate: L.bind(this.validate, this, section_id),
		});

		return widget.render();
	},
});

// This is almost identical to SimpleNetworkSelect, but is used for the forwarding
// drop-down so automatically excludes the current network section
// (note that we simplify forwarding so networks are specified rather than zones).
const SimpleForwardSelect = form.ListValue.extend({
	__name__: 'CBI.SimpleForwardSelect',

	renderWidget: function (section_id, option_index, cfgvalue) {
		const choices = this.transformChoices();
		// We have to remove the current network on render
		// (we can't do this on construction, since the option can result
		// in multiple renders for different networks).
		delete choices[section_id];
		for (const [k, v] of Object.entries(choices)) {
			choices[k] = E('span', { class: 'zonebadge network-name', style: firewall.getZoneColorStyle(morseuci.getZoneForNetwork(k)) }, v);
		}

		const widget = new ui.Dropdown(cfgvalue, choices, {
			id: this.cbid(section_id),
			sort: true,
			optional: true,
			select_placeholder: E('span', { style: 'min-width: 80px' }, _('None')),
			disabled: (this.readonly != null) ? this.readonly : this.map.readonly,
			display_items: this.display_size || this.size || 3,
			dropdown_items: this.dropdown_size || this.size || 5,
			datatype: 'uciname',
			validate: L.bind(this.validate, this, section_id),
		});

		const dropdown = E('span', ['⇒ ', widget.render()]);

		if (morseuci.getZoneForNetwork(section_id)) {
			return dropdown;
		} else {
			dropdown.style.display = 'none';
			// Hide the dropdown with a button if the zone doesn't exist.
			// This means:
			//  - if the user has no zone, they explicitly opt in to an ACCEPT zone
			//  - if the user has created an interface via LuCI they can then
			//    easily make that interface functional without having to understand
			//    how to attach it to a firewall zone.
			const ZONE_TOOLTIP = _(`
				This interface has no firewall zone, which probably means it won't accept any traffic.
				Click this button to create a default zone with everything set to ACCEPT. You will
				then be able to set forwarding rules (if desired).
			`).replace(/[\t\n ]+/g, ' ');
			return E('span', [
				E('span', [
					E('span', { 'class': 'show-info', 'data-tooltip': ZONE_TOOLTIP }, ''),
					E('button', { click: (e) => {
						morseuci.getOrCreateZone(section_id);
						e.target.parentElement.style.display = 'none';
						e.target.parentElement.nextElementSibling.style.display = 'block';
					} }, 'Create Zone'),
				]),
				dropdown,
			]);
		}
	},
});

/* Encryption list that depends on the device type and mode.
 *
 * The standard luci encryption selection (in network/wireless):
 *  - has an overwhelming number of options
 *  - presents those options even if they'll fail validation
 *    (e.g. SAE in ad-hoc mode)
 *
 * To avoid this, we present only a limited set of options users are likely to choose,
 * and restrict these based on the device/mode. To handle other options that were set
 * in the normal luci config, we support setting .existingValues to an array of strings,
 * and these options are automatically added to the dropdown. This makes sure we don't
 * accidentally mutate the config due to not being able to represent an existing option.
 * Where this falls down is if a scan turns up APs that require other modes.
 *
 * In order to restrict based on device capabilites, we add .deviceType
 * (e.g. morse or mac80211). In LuCI's wireless.js, L.hasSystemFeature is used to decide
 * what encryption options to present. In our case, this is insufficient because
 * it doesn't know what the available encryptions are for the HaLow specific
 * hostapd/wpa_supplicant.
 */
const WifiEncryptionList = form.ListValue.extend({
	__name__: 'CBI.WifiEncryptionList',

	renderWidget(sectionId, optionIndex, cfgvalue) {
		const mode = this.section.formvalue(sectionId, 'mode');
		const deviceType = Object.keys(ENCRYPTION_OPTIONS_FOR_MODE).includes(this.deviceType) ? this.deviceType : 'default';
		let encryptionOptions = ENCRYPTION_OPTIONS_FOR_MODE[deviceType][mode];
		if (!encryptionOptions) {
			// If no specific encryption options for the mode, use the defaults
			// (and extend with anything else that's set to avoid accidental mutation).
			encryptionOptions = Array.from(ENCRYPTION_OPTIONS_FOR_MODE[deviceType].default);
			for (const val of this.existingValues || []) {
				if (!encryptionOptions.includes(val)) {
					encryptionOptions.push(val);
				}
			}
		}

		this.clear();
		for (const encryptionOption of encryptionOptions) {
			this.value(encryptionOption, ENCRYPTION_OPTIONS[encryptionOption]);
		}

		return this.super('renderWidget', [sectionId, optionIndex, cfgvalue]);
	},
});

/* Looks at the adjacent encryption mode, and if it just requires
 * a key it presents the key, otherwise it links to the main wireless config page.
 *
 * Requires the map to call renderUpdate when appropriate
 * (i.e. when the encryption mode changes).
 */
const WifiSecurityValue = form.Value.extend({
	__name__: 'CBI.WifiSecurityValue',

	renderWidget(sectionId, optionIndex, cfgvalue) {
		const encryption = this.section.formvalue(sectionId, 'encryption');

		if (ENCRYPTION_MODES_USING_KEYS.has(encryption)) {
			return form.Value.prototype.renderWidget.call(this, sectionId, optionIndex, cfgvalue);
		} else if (!encryption || ['none', 'owe'].includes(encryption)) {
			const widget = new ui.Textfield('', {
				id: this.cbid(sectionId),
				placeholder: 'Not required',
				disabled: true,
			});
			return widget.render();
		} else {
			return E('a', {
				href: L.url('admin', 'network', 'wireless'),
				title: _('Configure security on the Wireless page. You may want to Save first.'),
			}, _('Configure...'));
		}
	},

	validate(sectionId, value) {
		const encryption = this.section.formvalue(sectionId, 'encryption');
		if (ENCRYPTION_MODES_USING_KEYS.has(encryption)) {
			if (!value || value === '') {
				return _('Encryption "%s" requires a key').format(encryption);
			}
		}

		return true;
	},
});

// In the quick config page, we only really want to deal with 'normal' looking ifaces
// to avoid confusion, so we use this to filter out things we don't care about
// (the user can use the normal luci config if they have more complex requirements).
function isNormalNetworkIface(netIface) {
	return netIface.disabled !== '1' && netIface['.name'] !== 'loopback' && ['dhcp', 'static'].includes(netIface['proto']);
}

function getWifiIfaceModeI18n(wifiIface) {
	return WIFI_MODE_NAMES[wifiIface.mode] ?? _('Unknown');
}

function modeUsesDefaultWifiKey(mode) {
	return ['ap', 'ap-wds', 'mesh'].includes(mode);
}

return view.extend({
	// Because we rely on the diagram code reading from the uci.js cache layer, we can't handle resets
	// in this form normally.
	handleReset() {
		location.reload();
	},

	// The default save calls save on every map, but because we queue up changes in UCI
	// (due to trying to keep the diagram code orthogonal) the first map save will persist
	// unrelated config.
	//
	// Therefore we copy the normal map.save code but call uci.save manually only once.
	handleSave() {
		const tasks = [];
		const maps = Array.from(document.getElementById('maincontent').querySelectorAll('.cbi-map'))
			.map(m => dom.findClassInstance(m));

		const uciMaps = [];
		for (const m of maps) {
			if (m.data != uci) {
				tasks.push(() => m.save());
			} else {
				uciMaps.push(m);
			}
		}

		for (const m of uciMaps) {
			m.checkDepends();
		}

		return Promise.all(uciMaps.map(m => m.parse()))
			.then(() => this.preSaveHook())
			.then(() => uci.save())
			.then(() => Promise.all(uciMaps.map(m => m.load())))
			.catch((e) => {
				ui.showModal(_('Save error'), [
					E('p', {}, [_('An error occurred while saving the form:')]),
					E('p', {}, [E('em', { style: 'white-space:pre-wrap' }, [e.message])]),
					E('div', { class: 'right' }, [
						E('button', { class: 'cbi-button', click: ui.hideModal }, [_('Dismiss')]),
					]),
				]);

				return Promise.reject(e);
			})
			.then(() => Promise.all(uciMaps.map(m => m.renderContents())));
	},

	// Handle any we need to make a complex adjustment to uci config situations
	// that require processing multiple form elements.
	// This is called by handleSave above so we can safely interact with the uci
	// values rather than the form elements.
	preSaveHook() {
		// Use a bridge if we have more than one device.
		for (const network of uci.sections('network', 'interface')) {
			morseuci.createOrRemoveBridgeAsNeeded(network['.name']);
			morseuci.validateBridge(network['.name'], this.wifiDevices);
		}

		// Make sure we don't have too many ifaces for morse devices.
		// In theory, this should just be obeying the `iw phy` restriction,
		// but in practice our supported modes are a bit tighter than this so
		// we check them manually.
		for (const wd of uci.sections('wireless', 'wifi-device')) {
			if (wd.disabled === '1' || wd.type !== 'morse') {
				continue;
			}

			const modes = [];
			for (const wi of uci.sections('wireless', 'wifi-iface')) {
				if (wi.device === wd['.name'] && wi.disabled !== '1' && wi.mode !== 'none') {
					modes.push(wi.mode);
				}
			}

			if (modes.length > 2) {
				// This is consistent with what iw phy reports as a device capability.
				throw new TypeError(_('Morse devices can currently have at most two enabled interfaces.'));
			} else if (modes.length === 2) {
				modes.sort();
				if (!(modes[0] === 'ap' && ['mesh', 'sta'].includes(modes[1]))) {
					throw new TypeError(_('Morse devices with multiple interfaces can only support AP+Mesh or AP+Client.'));
				}
			}
		}
	},

	load() {
		return Promise.all([
			fetch(DPP_QRCODE_PATH, { method: 'HEAD' }).then(r => r.ok).catch(_e => false),
			callGetBuiltinEthernetPorts(),
			configDiagram.loadTemplate(),
			uci.load(['network', 'firewall', 'dhcp', 'system']),
			uci.load('prplmesh').catch(() => null),
			uci.load('mesh11sd').catch(() => null),
			uci.load('wireless').catch(() => null),
			network.flushCache(true),
		]);
	},

	async render([hasQRCode, builtinEthernetPorts]) {
		this.hasQRCode = hasQRCode;
		// The actual load is performed by 'flushCache' above; these don't cause network requests.
		// Note that if we did them in parallel, we would duplicate requests (due to what IMO
		// is a bug in the initNetworkState caching layer).
		this.ethernetPorts = morseuci.getEthernetPorts(builtinEthernetPorts, await network.getDevices());
		this.wifiDevices = (await network.getWifiDevices()).reduce((o, d) => (o[d.getName()] = d, o), {});
		this.wifiNetworks = (await network.getWifiNetworks()).reduce((o, n) => (o[n.getName()] = n, o), {});

		const hasWireless = Object.keys(this.wifiDevices).length > 0;

		const networkMap = new form.Map('network', [
			_('Network Interfaces'),
			E('a', {
				href: L.url('admin', 'network', 'network'),
				title: 'Advanced Configuration',
				class: 'advanced-config pull-right',
			}),
		]);
		if (hasWireless) {
			networkMap.chain('wireless');
		}
		networkMap.chain('firewall');
		networkMap.chain('dhcp');
		this.renderNetworkInterfaces(networkMap, hasWireless);

		const easyMesh = uci.get('prplmesh', 'config', 'enable');

		let wirelessMap = null;
		if (hasWireless) {
			wirelessMap = new form.Map('wireless', [
				'Wireless',
				E('a', {
					href: L.url('admin', 'network', 'wireless'),
					title: 'Advanced Configuration',
					class: 'advanced-config pull-right',
				}),
			]);

			// Put HaLow devices first
			const uciWifiDevices = uci.sections('wireless', 'wifi-device').filter(s => s.type === 'morse');
			uciWifiDevices.push(...uci.sections('wireless', 'wifi-device').filter(s => s.type !== 'morse'));
			for (const device of uciWifiDevices) {
				if (device.disabled === '1') {
					continue;
				}

				this.renderWifiDevice(wirelessMap, device);
				if (device.type === 'morse' && easyMesh == '1') {
					const alert_message_section = wirelessMap.section(form.TypedSection, 'EasyMesh_Info', _('EasyMesh Alert Message'));
					alert_message_section.anonymous = true;
					alert_message_section.render = function () {
						return E('div', { class: 'alert-message warning' }, _(`
							The following section is read-only in EasyMesh mode. Any direct modifications made on this page might disrupt normal functionality. To make changes, please use the <a target="_blank" href="%s">wizard</a>.
						`).format(L.url('admin', 'selectwizard')));
					};
					this.renderWifiInterfaces(wirelessMap, device['.name'], { readOnly: true });
				} else {
					this.renderWifiInterfaces(wirelessMap, device['.name']);
				}
			}
		}

		const diagram = E('morse-config-diagram');
		this.attachDynamicUpdateHandlers(diagram, this.ethernetPorts, hasWireless ? [networkMap, wirelessMap] : [networkMap]);

		// This is actually a promise, but we can do it along with the render.
		diagram.updateFrom(uci, this.ethernetPorts);

		const elements = [
			E('div', { class: 'cbi-section' }, [
				E('h1', 'Quick Configuration'),
				E('p', _('Use this page to quickly change individual settings. For major changes, we recommend using a Wizard (see menu).')),
			]),
			E('div', { class: 'cbi-section' }, diagram),
			networkMap.render(),
			hasWireless ? wirelessMap.render() : [],
		];

		return Promise.all(elements);
	},

	renderWifiDevice(map, device) {
		const deviceInfo = this.wifiDevices[device['.name']];
		const displayName = deviceInfo.getI18n().replace(' Wireless Controller', '');
		const section = map.section(form.NamedSection, device['.name'], 'wifi-device', displayName);
		let option;

		if (device['type'] === 'morse') {
			// Only HaLow devices have the static channel map which allows us to see
			// frequencies from other countries without setting the region of the device.
			option = section.option(widgets.WifiCountryValue, 'country', _('Country'));
			option.onchange = function (ev, sectionId, value) {
				this.map.lookupOption('_freq', sectionId)[0].toggleS1gCountry(sectionId, value);
			};
		}
		option = section.option(widgets.WifiFrequencyValue, '_freq', _('Preferred frequency'));
	},

	renderWifiInterfaces(map, deviceName, options = {}) {
		const deviceType = uci.get('wireless', deviceName, 'type');
		const isMorse = deviceType === 'morse';
		const section = map.section(form.TableSection, 'wifi-iface');
		section.filter = sectionId => deviceName === uci.get('wireless', sectionId, 'device');
		const readOnly = options.readOnly ? options.readOnly : false;
		if (readOnly) {
			section.addremove = false;
		} else {
			section.addremove = true;
		}
		section.anonymous = true;

		// If we don't immediately set the correct device, it won't appear in our table
		// due to the filter. Also, the normal handleAdd saves the current state of the
		// form to the backend, which is a bit rude.
		// So we monkey-patch handleAdd :(
		section.handleAdd = function (_ev, name) {
			const config_name = this.uciconfig || this.map.config;

			if (!name) {
				let offset = 1;
				do {
					name = `wifinet${offset++}_${deviceName}`;
				} while (uci.get('wireless', name));
			}
			this.map.data.add(config_name, this.sectiontype, name);
			this.map.data.set(config_name, name, 'device', deviceName);
			this.map.data.set(config_name, name, 'disabled', '1');
			this.map.data.set(config_name, name, 'encryption', isMorse ? 'sae' : 'psk2');
			this.map.data.set(config_name, name, 'ssid', morseuci.getDefaultSSID());
			this.map.data.set(config_name, name, 'key', morseuci.getDefaultWifiKey());

			// If lan doesn't exist in our dropdown, this won't ever save
			// (i.e. it's safe to do if lan doesn't exist).
			// However, setting it makes sure that it appears in the network ifaces
			// list on the config page, as this goes to uci rather than the form
			// to determine what to display (i.e. it won't pick up the form default
			// until you mutate it).
			this.map.data.set(config_name, name, 'network', 'lan');

			// It's safe to simple load/reset here rather than doing
			// a save since (to support the diagram) we're already putting
			// everything into the uci cache (i.e. the 'reset' won't lose
			// any data, _unlike_ hitting the Reset button on the page
			// which causes a refresh).
			return this.map.load().then(() => this.map.reset());
		};

		let option;

		option = section.option(morseui.Slider, 'disabled', _('Enabled'));
		option.enabled = '0';
		option.disabled = '1';
		option.default = '0';
		option.readonly = readOnly;

		option = section.option(form.DummyValue, '_device', _('Device'));
		option.cfgvalue = (sectionId) => {
			return this.wifiNetworks[sectionId]?.getIfname() || '';
		};

		option = section.option(SimpleNetworkSelect, 'network', _('Network'));
		for (const networkIface of uci.sections('network', 'interface')) {
			if (isNormalNetworkIface(networkIface)) {
				option.value(networkIface['.name'], networkIface['.name']);
			}
		}
		option.readonly = readOnly;

		const MODE_TOOLTIP = _(`
			Change the mode of your Wi-Fi interface. To enable HaLow Wi-Fi extenders, you should select WDS (Wireless Distribution System)
			modes for Access Points and Clients (Stations).
		`).replace(/[\t\n ]+/g, ' ');
		option = section.option(form.ListValue, 'mode', E('span', { 'class': 'show-info', 'data-tooltip': MODE_TOOLTIP }, _('Mode')));
		for (const [k, v] of Object.entries(isMorse ? HALOW_WIFI_MODE_NAMES : WIFI_MODE_NAMES)) {
			option.value(k, v);
		}
		option.readonly = readOnly;
		option.onchange = function (ev, sectionId, value, previousValue) {
			if (previousValue && previousValue.replace('-wds', '') === value.replace('-wds', '')) {
				// If the only change is WDS, none of the dependent fields are invalidated.
				return;
			}

			// Fundamental mode change; existing ssid/encryption/key are not relevant.

			const ssidOption = this.map.lookupOption('ssid', sectionId)[0];
			if (['sta', 'sta-wds'].includes(value)) {
				ssidOption.renderUpdate(sectionId, '');
			} else {
				ssidOption.renderUpdate(sectionId, morseuci.getDefaultSSID());
			}

			const newKey = modeUsesDefaultWifiKey(value) ? morseuci.getDefaultWifiKey() : '';
			const keyOption = this.map.lookupOption('_wpa_key', sectionId)[0];
			keyOption.renderUpdate(sectionId, newKey);

			// Note: The encryptionOption should be updated AFTER the keyOption, otherwise the
			// encryptionOption will undo the keyOption change above if the changing mode also
			// changes the encryption setting
			const encryptionOption = this.map.lookupOption('encryption', sectionId)[0];
			encryptionOption.renderUpdate(sectionId, isMorse ? 'sae' : 'psk2');
		};

		if (!isMorse) {
			// Since we don't support WDS here, and in advanced config changing
			// the mode would let you select the WDS status (similar to our HaLow
			// dropdown here), if we've changed let's remove WDS.
			// Note that if nothing is changed we don't touch it here (on the
			// principle of not nuking user config) because AbstractValue.parse
			// only calls .write if this changes.
			option.write = function (sectionId, value) {
				uci.unset('wireless', sectionId, 'wds');
				uci.set('wireless', sectionId, 'mode', value);
			};
		} else {
			// For HaLow, add special handling to set WDS and mesh
			// (i.e. setting ifname to mesh0 if it's a Mesh Point so mesh11sd
			// picks it up).
			// Note that if nothing is changed we don't touch it here (on the
			// principle of not nuking user config) because AbstractValue.parse
			// only calls .write if this changes.
			option.write = function (sectionId, value) {
				switch (value) {
					case 'ap-wds':
						uci.set('wireless', sectionId, 'mode', 'ap');
						uci.set('wireless', sectionId, 'wds', '1');
						break;

					case 'sta-wds':
						uci.set('wireless', sectionId, 'mode', 'sta');
						uci.set('wireless', sectionId, 'wds', '1');
						break;

					case 'mesh':
						uci.set('wireless', sectionId, 'mode', 'mesh');
						uci.unset('wireless', sectionId, 'wds');
						break;

					default:
						uci.set('wireless', sectionId, 'mode', value);
						uci.unset('wireless', sectionId, 'wds');
						break;
				}
			};
			option.cfgvalue = function (section_id) {
				const mode = uci.get('wireless', section_id, 'mode');
				if (uci.get('wireless', section_id, 'wds') === '1') {
					if (mode === 'ap') {
						return 'ap-wds';
					} else if (mode === 'sta') {
						return 'sta-wds';
					}
				}

				return mode;
			};
		}

		if (this.hasQRCode && isMorse) {
			const DPP_TOOLTIP = _('This enables DPP via QRCode for clients (access points automatically support DPP).');
			option = section.option(form.Flag, 'dpp', E('span', { 'class': 'show-info', 'data-tooltip': DPP_TOOLTIP }, _('DPP')));
			option.depends({ '!contains': true, 'mode': 'sta' });
			option.readonly = readOnly;
		}

		option = section.option(morseui.SSIDListScan, 'ssid', _('SSID/Mesh ID'));
		if (this.hasQRCode && isMorse) {
			option.depends('dpp', '0');
			option.depends({ '!reverse': true, 'mode': 'sta' });
		}
		option.readonly = readOnly;
		if (readOnly) {
			// If we're in readonly mode, we don't want to block people saving seemingly
			// 'bad' configurations when they can't fix them.
			// This happens in practice if you have an EasyMesh config before WPS,
			// where we don't know the SSID/password yet (and so have left it blank).
			option.validate = () => true;
			option.optional = true;
		}
		option.rmempty = false;
		option.write = function (sectionId, value) {
			const mode = this.map.lookupOption('mode', sectionId)[0].formvalue(sectionId);
			switch (mode) {
				case 'mesh':
					uci.set('wireless', sectionId, 'mesh_id', value);
					break;
				default:
					uci.set('wireless', sectionId, 'ssid', value);
					break;
			}
		};
		option.onchangeWithEncryption = function (ev, sectionId, value, encryption) {
			if (encryption) {
				const encryptionElement = this.section.getUIElement(sectionId, 'encryption');
				encryptionElement.setValue(encryption);
				encryptionElement.node.querySelector('select').dispatchEvent(new Event('change'));
			}
		};

		option.cfgvalue = function (section_id) {
			const mode = uci.get('wireless', section_id, 'mode');
			switch (mode) {
				case 'mesh':
					return uci.get('wireless', section_id, 'mesh_id');
				default:
					return uci.get('wireless', section_id, 'ssid');
			}
		};

		option = section.option(WifiEncryptionList, 'encryption', _('Encryption'));
		option.readonly = readOnly;
		if (this.hasQRCode && isMorse) {
			option.depends({ dpp: '0' });
			option.depends({ '!reverse': true, '!contains': true, 'mode': 'sta' });
		}
		// Let the widget know what existing things are selected
		// (this allows us to present a limited set in most cases, but if someone
		// has selected something strange in advanced we can still represent it).
		option.existingValues = [];
		for (const wi of uci.sections('wireless', 'wifi-iface')) {
			if (wi.device === deviceName && wi.encryption && !option.existingValues.includes(wi.encryption)) {
				option.existingValues.push(wi.encryption);
			}
		}
		option.deviceType = deviceType;
		option.default = 'none';
		option.onchange = function (ev, sectionId, _value, previousValue) {
			const mode = this.section.formvalue(sectionId, 'mode');
			let key = this.section.formvalue(sectionId, '_wpa_key');

			// On change, if empty key 'suggest' default key.
			if (!key && modeUsesDefaultWifiKey(mode)) {
				key = morseuci.getDefaultWifiKey();
			}

			const keyOption = this.map.lookupOption('_wpa_key', sectionId)[0];
			keyOption.renderUpdate(sectionId, key);

			if (['wpa3', 'wpa3-mixed'].includes(previousValue)) {
				// If the user has (as suggested on the page) gone to setup wpa3 things like
				// auth_server in the advanced config, then switches back to something
				// else (e.g. like ordinary sae), apparently auth_server is still
				// meaningful, picked up by netifd and passed to wpa_supplicant. To avoid user
				// confusion since we don't hint at being able to configure the auth_server here,
				// remove auth_server (this also prevents other related things like
				// port/secret/macaddr_acl being set).
				//
				// We do not remove auth_server as a general thing (i.e. on .write, as would
				// be a more usual approach), because the user may have configured this intentionally,
				// and we want to follow our policy of not destroying existing configuration.
				// It's safe to modify uci directly rather than pushing this through a hidden
				// form value since this page habitually pushes changes to uci in order
				// to render the diagram.
				uci.unset('wireless', sectionId, 'auth_server');
			}
		};

		option = section.option(WifiSecurityValue, '_wpa_key', _('Key/Security'));
		if (this.hasQRCode && isMorse) {
			option.depends({ dpp: '0' });
			option.depends({ '!reverse': true, '!contains': true, 'mode': 'sta' });
		}
		option.datatype = 'wpakey';
		option.rmempty = true;
		option.password = true;
		option.readonly = readOnly;
		if (readOnly) {
			// If we're in readonly mode, we don't want to block people saving seemingly
			// 'bad' configurations when they can't fix them.
			// This happens in practice if you have an EasyMesh config before WPS,
			// where we don't know the SSID/password yet (and so have left it blank).
			option.validate = () => true;
			option.optional = true;
		}

		// This curious code is taken from LuCI's wireless.js. Apparently,
		// in WEP mode key can be an reference specifying key1/key2/key3/key4.
		// https://openwrt.org/docs/guide-user/network/wifi/basic
		option.cfgvalue = function (section_id) {
			var key = uci.get('wireless', section_id, 'key');
			return /^[1234]$/.test(key) ? null : key;
		};
		option.write = function (section_id, value) {
			uci.set('wireless', section_id, 'key', value);
			uci.unset('wireless', section_id, 'key1');
			uci.unset('wireless', section_id, 'key2');
			uci.unset('wireless', section_id, 'key3');
			uci.unset('wireless', section_id, 'key4');
		};
	},

	renderNetworkInterfaces(map, hasWireless) {
		const section = map.section(form.TableSection, 'interface');
		// We set this to anonymous so we can render the name ourselves with colour.
		section.anonymous = true;
		section.modaltitle = _('Network Interface');
		section.filter = (sectionId) => {
			const iface = uci.get('network', sectionId);
			return iface.disabled !== '1' && iface['.name'] !== 'loopback' && ['dhcp', 'static'].includes(iface['proto']);
		};
		section.max_cols = 7;

		let option;

		option = section.option(morseui.DynamicDummyValue, '_name', _('Name'));
		option.rawhtml = true;
		option.cfgvalue = (sectionId) => {
			if (morseuci.getNetworkDevices(sectionId).length + morseuci.getNetworkWifiIfaces(sectionId).length > 0) {
				return E('span', {
					class: 'zonebadge network-name',
					style: firewall.getZoneColorStyle(morseuci.getZoneForNetwork(sectionId)),
				}, sectionId);
			} else {
				return E('span', {
					'class': 'zonebadge network-name show-warning',
					'data-tooltip': NETWORK_WITHOUT_DEVICES_INFO,
					'style': firewall.getZoneColorStyle(morseuci.getZoneForNetwork(sectionId)),
				}, sectionId);
			}
		};

		option = section.option(SimpleForwardSelect, '_forward', _('Forward'));
		option.titleref = L.url('admin', 'network', 'firewall');
		// We disable the uci refresh for this because otherwise, when people mess around with the element,
		// we generate spurious forwarding rules that we then have to disable.
		option.disableUciRefresh = true;
		for (const networkIface of uci.sections('network', 'interface')) {
			if (networkIface.disabled === '1' || networkIface['.name'] === 'loopback' || !['dhcp', 'static'].includes(networkIface['proto'])) {
				continue;
			}

			option.value(networkIface['.name'], networkIface['.name']);
		}
		option.load = (sectionId) => {
			for (const s of uci.sections('firewall', 'forwarding')) {
				if (s.enabled !== '0' && s.src === sectionId) {
					return s.dest;
				}
			}

			return null;
		};
		option.write = (sectionId, value) => {
			const srcZone = morseuci.getOrCreateZone(sectionId);
			const destZone = morseuci.getOrCreateZone(value);
			morseuci.getOrCreateForwarding(srcZone, destZone);
		};
		option.remove = function (sectionId) {
			const zone = morseuci.getZoneForNetwork(sectionId);
			if (!zone) {
				return;
			}
			for (const s of uci.sections('firewall', 'forwarding').filter(f => f.src === zone)) {
				uci.set('firewall', s['.name'], 'enabled', '0');
			}
		};

		if (hasWireless) {
			option = section.option(morseui.DynamicDummyValue, '_wifi_interfaces', _('Wireless'));
			option.rawhtml = true;
			option.cfgvalue = (sectionId) => {
				const wirelessDevices = {};
				for (const wifiIface of uci.sections('wireless', 'wifi-iface')) {
					if (wifiIface.disabled !== '1' && wifiIface.network === sectionId) {
						const deviceName = this.wifiDevices[wifiIface.device]?.getI18n()?.replace(' Wireless Controller', '');
						const mode = getWifiIfaceModeI18n(wifiIface);
						const ifname = this.wifiNetworks[wifiIface['.name']]?.getIfname();
						let tooltip;
						if (ifname) {
							tooltip = _('%s (%s) on %s').format(mode, ifname, deviceName);
						} else {
							tooltip = _('%s on %s').format(mode, deviceName);
						}
						const wifiId = wifiIface.mode === 'mesh' ? `${wifiIface.mesh_id} (mesh)` : wifiIface.ssid;
						const displayName = wifiIface.dpp === '1' ? '(DPP)' : (wifiId ?? `${wifiIface.device}:${wifiIface.mode}`);
						(wirelessDevices[displayName] ??= []).push(tooltip);
					}
				}

				return E('div', { style: 'display:flex;flex-wrap:wrap;justify-content:center;' }, Object.entries(wirelessDevices).map(([name, tooltips]) => {
					return E('span', { 'class': 'show-info', 'data-tooltip': tooltips.join('\n') }, name);
				}));
			};
		}

		option = section.option(form.MultiValue, 'device', _('Ethernet'));
		option.placeholder = _('None');
		option.load = morseuci.getNetworkDevices;
		option.write = morseuci.setNetworkDevices;
		option.remove = (sectionId) => {
			const device = uci.get('network', sectionId, 'device');
			const deviceSection = uci.sections('network', 'device')
				.find(s => s.name === device);

			if (device && deviceSection && deviceSection.type === 'bridge') {
				uci.unset('network', deviceSection['.name'], 'ports');
			} else {
				uci.unset('network', sectionId, 'device');
			}
		};

		const availableDevices = new Set(this.ethernetPorts.map(p => p.device));

		// Add any other devices that aren't currently available to avoid
		// accidentally mutating config (e.g. for a usb dongle that's not
		// currently plugged in).
		for (const netIface of uci.sections('network', 'interface')) {
			if (isNormalNetworkIface(netIface)) {
				for (const dev of morseuci.getNetworkDevices(netIface['.name'])) {
					availableDevices.add(dev);
				}
			}
		}

		for (const dev of availableDevices) {
			option.value(dev, dev);
		}

		option.validate = function (sectionId, value) {
			for (const section of uci.sections('network', 'interface')) {
				if (section['.name'] === sectionId) {
					continue;
				}

				const otherDevices = new Set(this.section.formvalue(section['.name'], 'device'));

				for (const device of value.split(' ')) {
					if (otherDevices.has(device)) {
						return _('%s exists in networks %s and %s').format(device, sectionId, section['.name']);
					}
				}
			}

			return true;
		};

		option = section.option(morseui.Slider, '_dnsmasq', _('DHCP Server'));
		option.titleref = L.url('admin', 'network', 'dhcp');
		option.load = (sectionId) => {
			// We lean towards reporting as disabled.
			const dnsSection = uci.sections('dhcp', 'dnsmasq')
				.find(dnsmasq =>
					(!dnsmasq.interface || L.toArray(dnsmasq.interface).includes(sectionId))
					&& !L.toArray(dnsmasq.notinterface).includes(sectionId)
					&& dnsmasq.port !== '0');
			const dhcpSection = dnsSection && uci.sections('dhcp', 'dhcp')
				.find(dhcp =>
					dhcp.interface === sectionId && dhcp.ignore !== '1'
					&& (!dhcp.instance || dhcp.instance === dnsSection['.name']));
			return (dnsSection && dhcpSection) ? '1' : '0';
		};
		option.write = function (sectionId, value) {
			// Note that if there's an existing half-enabled config (e.g. DNS but not DHCP or vice-versa),
			// we don't touch it here (on the principle of not nuking user config) because
			// AbstractValue.parse only calls .write if this changes.

			const dnsmasqName = morseuci.getOrCreateDnsmasq(sectionId);
			if (value === '1') {
				if (uci.get('dhcp', dnsmasqName, 'port')) {
					uci.unset('dhcp', dnsmasqName, 'port');
				}
			} else {
				// If there are multiple DNS servers we need to properly turn this off
				// to avoid clashing with another server. Note that if there is only
				// one - even if this is scoped for now - getOrCreateDnsmasq will pick it up
				// and enable it for this interface.
				// WARNING: This is a poorly tested code-path, and normal devices should not
				// be in this situation. It's most likely to happen after upgrading from pre-2.6.
				// This will also mean that turning on and off has the potential
				// to change the configuration.
				if (uci.sections('dhcp', 'dnsmasq').length > 1) {
					uci.set('dhcp', dnsmasqName, 'port', '0');
					uci.set('dhcp', dnsmasqName, 'localuse', '0');
					uci.unset('dhcp', dnsmasqName, 'nonwildcard');

					// Make sure we're not listening on loopback interface.
					const notinterface = L.toArray(uci.get('dhcp', dnsmasqName, 'notinterface'));
					if (!notinterface.includes('loopback')) {
						notinterface.push('loopback');
						uci.set('dhcp', dnsmasqName, 'notinterface', notinterface);
					}
				}
			}

			const onSections = uci.sections('dhcp', 'dhcp').filter(dhcp => dhcp.interface === sectionId && dhcp.ignore !== '1' && (!dhcp.instance || dhcp.instance === dnsmasqName));
			const offSection = uci.sections('dhcp', 'dhcp').find(dhcp => dhcp.interface === sectionId && dhcp.ignore === '1' && (!dhcp.instance || dhcp.instance === dnsmasqName));
			if (value === '0' && onSections.length > 0) {
				for (const dhcpSection of onSections) {
					uci.set('dhcp', dhcpSection['.name'], 'ignore', '1');
				}
			} else if (value === '1' && onSections.length === 0) {
				if (offSection) {
					uci.unset('dhcp', offSection['.name'], 'ignore');
				} else {
					morseuci.createDhcp(dnsmasqName, sectionId);
				}
			}
		};
		option.rmempty = false;

		// It's 'safe' to only list dhcp/static here because we only present networks that
		// are in this state.
		option = section.option(form.ListValue, 'proto', _('Protocol'));
		option.value('dhcp', _('DHCP Client'));
		option.value('static', _('Static IP'));
		option.onchange = function (_ev, sectionId, value) {
			// When changing, turn DHCP/DNS on by default for static and off by default for DHCP client
			// (but as always, we shouldn't do this unless the user has interacted with us to avoid
			// unexpectedly mutating a configuration).
			this.section.getUIElement(sectionId, '_dnsmasq').setValue(value === 'static' ? '1' : '0');

			// Set a reasonable netmask if moving to static and none exists.
			// We do this because by default OpenWrt will deal out a /32, which
			// isn't very useful in our case.
			if (value === 'static') {
				const netmaskElement = this.section.getUIElement(sectionId, 'netmask');

				if (netmaskElement) {
					if (!netmaskElement.getValue()) {
						netmaskElement.setValue('255.255.255.0');
					}
				} else if (!uci.get('network', sectionId, 'netmask')) {
					// Because the netmask element only appears in the '...' modal, if we can't find
					// the element we set the netmask in uci :(
					// (since the modal rerenders from uci, this will appear in the modal if it's subsequently
					// popped up!)
					uci.set('network', sectionId, 'netmask', '255.255.255.0');
				}
			}
		};

		const staticProtocol = network.getProtocol('static');

		option = section.option(form.Value, 'ipaddr', 'IPv4 address');
		option.depends('proto', 'static');
		option.datatype = 'ip4addr("nomask")';
		option.rmempty = false;
		option.retain = true;
		// Warning: this _discards_ other IPs (and mask info) in the load.
		// We rely on the standard behaviour of the form to not attempt to write
		// values that haven't changed to avoid unexpected mutations; however,
		// if the user edits this value then all bets are off.
		option.load = sectionId => morseuci.getFirstIpaddr(sectionId);
		option.validate = function (sectionId, value) {
			// Prevent users setting different networks to the same IP.
			// This is valid, but too confusing.

			const wifiNetworks = uci.sections('wireless', 'wifi-iface').filter(wi => wi.disabled !== '1').map(wi => wi.network);
			// Only check if something is actually using our network.
			if (morseuci.getNetworkDevices(sectionId).length > 0 || wifiNetworks.includes(sectionId)) {
				for (const section of uci.sections('network', 'interface')) {
					if (section['.name'] === sectionId) {
						continue;
					}

					if (morseuci.getNetworkDevices(section['.name']).length === 0 && !wifiNetworks.includes(section['.name'])) {
						// Ignore clashes if nothing in the network.
						continue;
					}

					if (value === this.section.formvalue(section['.name'], 'ipaddr')) {
						return _('IPv4 address %s is in networks %s and %s').format(value, sectionId, section['.name']);
					}
				}
			}

			return staticProtocol.CBIIPValue.prototype.validate.call(this, sectionId, value);
		};

		option = section.option(form.Value, 'netmask', _('Netmask'));
		option.datatype = 'ip4addr("nomask")';
		option.depends('proto', 'static');
		option.value('255.255.255.0', '255.255.255.0');
		option.value('255.255.0.0', '255.255.0.0');
		option.value('255.0.0.0', '255.0.0.0');
		// This is marked as inactive on the main page because it's hidden by max_cols,
		// and because of this LuCI decides to remove it unless retain is set.
		// IMO this is a bug in LuCI, but for now we work around it.
		option.retain = true;
		option.validate = staticProtocol.CBINetmaskValue.prototype.validate;
		option.load = (sectionId) => {
			const netmask = morseuci.getFirstNetmask(sectionId);
			if (netmask && netmask !== uci.get('network', sectionId, 'netmask')) {
				// We must have extracted the netmask from the IP. If the user
				// edits the IP in our system, we should keep the same netmask
				// as before (and make sure it's set), which means putting it in
				// its own option correctly. For now, just force it all the time,
				// as it's not straightforward to only do it if ipaddr has changed
				// (it will be ignored if the mask is set on ipaddrs anyway).
				//
				// NB We can't use forcewrite, because this field is often not used
				// (max_cols again).
				uci.set('network', sectionId, 'netmask', netmask);
			}
			return netmask;
		};

		option = section.option(staticProtocol.CBIGatewayValue, 'gateway', _('Gateway'));
		option.description = GATEWAY_DESCRIPTION;
		option.depends('proto', 'static');
		// This is marked as inactive on the main page because it's hidden by max_cols,
		// and because of this LuCI decides to remove it unless retain is set.
		// IMO this is a bug in LuCI, but for now we work around it.
		option.retain = true;

		// This helps the validate functions on ip/netmask check properly against
		// the current broadcast ip.
		option = section.option(form.HiddenValue, 'broadcast');
	},

	/**
	 * Attach an onchange handler to _every element_ in order to update uci.js
	 * immediately, and then update the diagram and any reactive UI elements.
	 *
	 * 'reactive UI element' = one where dynamicUpdate is defined
	 * (not part of normal LuCI).
	 *
	 * Note that at the moment there are no smarts to this: we call
	 * update every time, even if there are no changes required.
	 *
	 * Why do this at all?
	 *
	 * - the diagram code is abstracted from the form, so it's nicer for it
	 *   to be able to use uci.js rather than the form values.
	 * - even for the elements on the page, their initial load needs to depend
	 *   on UCI, so it would be messy (and often complex) having subsequent
	 *   operations depends on .formvalue. Since we already have this mechanism
	 *   for the diagram...
	 *
	 * @private
	 */
	attachDynamicUpdateHandlers(diagram, ethernetPorts, maps) {
		function forEachOption(arr, cb) {
			for (const child of arr) {
				if (child instanceof form.AbstractValue) {
					cb(child);
				} else {
					forEachOption(child.children, cb);
				}
			}
		}

		const dynamicValues = [];
		forEachOption(maps, (option) => {
			if (option.dynamic) {
				dynamicValues.push(option);
			}
		});

		forEachOption(maps, (option) => {
			if (option.disableUciRefresh || option.dynamic) {
				return;
			}

			const existingHandler = option.onchange;
			option.onchange = async function (ev, sectionId) {
				if (existingHandler) existingHandler.apply(this, arguments);

				// Usually, a parse is followed by a save and then options are
				// reloaded. In our situation, we aren't using this mechanism,
				// so we manually repopulate the form value with the updated
				// value in UCI. This makes sure that any subsequent AbstractValue.parse
				// doesn't get confused and think that something doesn't need
				// to be persisted because it's already that value.
				// IMO this is a bug in AbstractValue - parse should call .cfgvalue
				// after calling .write.
				try {
					await this.parse(sectionId);
				} catch (e) {
					// ignore errors - if the parse failed, we can't update the diagram,
					// and user should be notified of failure by ordinary form validation errors.
					// Note that parse is a bit of a misnomer - it both parses the options
					// and writes it if necessary.
					return;
				}

				this.cfgvalue(sectionId, this.load(sectionId));

				// Now it gets even trickier. Sometimes, it's not valid to set an option
				// because it's already been 'used' in another section (e.g. assigning the
				// same ethernet port to two networks, or the same IP to two networks).
				// This prevents _either_ of those values from parsing.
				// However, when one of them is updated, both should now be pushed through
				// to uci before we can update dynamic dummy values or the diagram.
				for (const otherSectionId of this.section.cfgsections()) {
					if (otherSectionId !== sectionId) {
						try {
							await this.parse(otherSectionId);
						} catch (e) {
							// Ignore errors from fields we aren't changing and
							// in this case continue to update diagram/dummyvalues.
						}
					}
				}

				// Now we get to what all this is for: the ability to re-render things when
				// something has changed. In this case, special form elements
				// (DynamicDummyValues) and the diagram at the top.
				for (const dv of dynamicValues) {
					for (const dvSectionId of dv.section.cfgsections()) {
						dv.renderUpdate(dvSectionId);
					}
				}

				await diagram.updateFrom(uci, ethernetPorts);
			};
		});

		return diagram;
	},
});
