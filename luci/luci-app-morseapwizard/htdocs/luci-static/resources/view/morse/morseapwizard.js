/**
 * This page is a one page wizard/landing page targeted at Router/AP HaLow devices which are mostly setup
 * via factory settings/uci-defaults, but the user can specify a mode:
 *
 * - standard - router (AP on lan, LAN->WAN forwarding)
 *            - AP (ethernet moved to mlan, everything else on lan)
 * - mesh11s gate - router (AP on lan, LAN->WAN forwarding)
 *                - AP (ethernet moved to mlan, everything else on lan)
 * - prplmesh - (all on lan => br-prpl)
 *
 * Unlike our normal landing page/wizards, it does _not_ take over the UI, as it's safe for the user
 * to _not_ do anything on this page.
 *
 * Future work might be to integrate this into our quick config page.
 */
'use strict';
/* globals configDiagram form morseuci network rpc uci view wizard */
'require view';
'require network';
'require rpc';
'require uci';
'require form';
'require tools.morse.uci as morseuci';
'require tools.morse.wizard as wizard';
'require custom-elements.morse-config-diagram as configDiagram';

document.querySelector('head').appendChild(E('link', {
	rel: 'stylesheet',
	type: 'text/css',
	href: L.resourceCacheBusted('view/morse/css/morseapwizard.css'),
}));

// This wizard is only designed for HaLowLink 1's AP mode. If we detect an Extender mode
// situation, give the user some hints.
const EXTENDER_MODE_MESSAGE = _(`
<p>This device is currently setup as an Extender (shown by a solid aqua Status LED),
which is not configurable in general. To be able to change these settings requires
resetting the device to Access Point mode (shown by a solid green Status LED):
<ul>
	<li>hold the mode button until the Status LED starts <strong>slowly flashing green</strong>,
		then release the button
	<li>wait until the LED is <strong>solid green</strong>
	<li>find this device at 192.168.12.1
</ul>

<p>To stay in Extender mode but make a new connection to an Access Point:
<ul>
	<li>hold the mode button and wait until the Status LED starts <strong>quickly flashing aqua</strong>,
		then release the button
	<li>wait until the LED is <strong>solid aqua</strong>
	<li>a short button press first on the Access Point then on the Extender will initiate pairing; see the user guide for details
</ul>
`).trim();

// Conversely, if you're in AP mode in the wizard, you might expect to be able to do everything.
// Let people know that they can switch to Extender mode.
const AP_MODE_MESSAGE = _(`
<p>This device is currently setup as an Access Point mode or equivalent (shown by a solid green Status LED).
If you would like to connect to an existing HaLow network, you should
reset the device to Extender mode (shown by a solid aqua Status LED):
<ul>
	<li>hold the mode button until the Status LED starts <strong>quickly flashing aqua</strong>,
		then release the button
	<li>wait until the LED is <strong>solid aqua</strong>
	<li>a short button press first on the Access Point then on the Extender will initiate pairing; see the user guide for details
</ul>
`).trim();

const INVALID_CONFIG_MESSAGE = _(`
<p>This device is in a state where this wizard cannot work (%s).

To configure via this page, you should factory reset:

<ul>
	<li>hold the mode button until the Status LED starts <strong>slowly flashing green</strong>,
		then release the button
	<li>wait until the LED is <strong>solid green</strong>
	<li>find this device at 192.168.12.1
</ul>
`).trim();

const DEFAULT_LAN_IP = '192.168.12.1';

const callGetBuiltinEthernetPorts = rpc.declare({
	object: 'luci',
	method: 'getBuiltinEthernetPorts',
	expect: { result: [] },
});

const callMorseModeQuery = rpc.declare({
	object: 'morse-mode',
	method: 'query',
});

return view.extend({
	// Because we rely on the diagram code reading from the uci.js cache layer, we can't handle resets
	// well (and really, it's such a small form that this is not worth it).
	handleReset: null,

	// We override handleSave to make sure we translate our JSONMap wizard options to actual uci
	// config.
	async handleSave() {
		await this.saveToUciCache();
		// Delete disabled wifi-ifaces to avoid confusion unless they're default_radioX.
		// Note that we should _not_ delete them in saveToUciCache, as this is called on every update;
		// i.e. we don't want to continually junk/recreate interfaces as user clicks around
		// different options, particularly when those interfaces may contain useful info (e.g. mesh_id/key).
		for (const iface of uci.sections('wireless', 'wifi-iface')) {
			if (iface['disabled'] === '1' && !iface['.name'].startsWith('default_')) {
				uci.remove('wireless', iface['.name']);
			}
		}
		await uci.save();
	},

	async saveToUciCache() {
		// (1) Save JSON data (to this.data).
		await this.map.save();

		// (2) Take that JSON data and turn it into uci config.
		const {
			wifiDevices,
			morseDeviceName,
			morseInterfaceName,
			morseMeshInterfaceName,
		} = wizard.readSectionInfo();

		const wifiApsDisabled = {};
		for (const wifiDevice of wifiDevices) {
			wifiApsDisabled[wifiDevice.name] = uci.get('wireless', wifiDevice.apSectionName, 'disabled');
		}

		wizard.resetUci();
		wizard.resetUciNetworkTopology();

		// Remove primary channel width override (may have been set by bug work-around from
		// prior mesh wizard versions).
		uci.unset('wireless', morseDeviceName, 's1g_prim_chwidth');

		// Make sure Morse device is enabled.
		uci.unset('wireless', morseDeviceName, 'disabled');

		// Re-enable any non-HaLow radios if our reset disabled.
		for (const wifiDevice of wifiDevices) {
			if (uci.get('wireless', wifiDevice.apSectionName)) {
				uci.set('wireless', wifiDevice.apSectionName, 'disabled', wifiApsDisabled[wifiDevice.name]);
			}
		}

		// Ensure HaLow AP is enabled/created
		// (NB network_mode will place in appropriate network below).
		if (uci.get('wireless', morseInterfaceName)) {
			uci.unset('wireless', morseInterfaceName, 'disabled');
		}
		uci.set('wireless', morseInterfaceName, 'mode', 'ap');
		uci.set('wireless', morseInterfaceName, 'wds', '1');
		if (!uci.get('wireless', morseInterfaceName, 'ssid')) {
			uci.set('wireless', morseInterfaceName, 'ssid', morseuci.getDefaultSSID());
		}
		// Clear mesh_id to avoid confusion.
		uci.unset('wireless', morseInterfaceName, 'mesh_id');

		if (!uci.get('wireless', morseInterfaceName, 'key')) {
			uci.set('wireless', morseInterfaceName, 'key', morseuci.getDefaultWifiKey());
		}

		// lan is the primary local interface unless overridden
		// by wlan below if the network mode is set to bridged.
		wizard.setupNetworkIface('lan', { local: true, primaryLocal: true });
		// Force wan even if not using to make sure that wan firewall rules are retained
		// (resetUciNetworkTopology removes).
		wizard.setupNetworkIface('wan');
		morseuci.setupNetworkWithDnsmasq('lan', morseuci.getFirstIpaddr('lan') || DEFAULT_LAN_IP);

		switch (this.data.wizard.device_mode) {
			case 'standard':
				morseuci.forceBridge('lan', 'br-lan');
				uci.set('system', 'led_halow', 'dev', 'wlh0');
				uci.set('system', 'led_80211n_ap', 'dev', 'phy0-ap0');
				uci.set('wireless', morseInterfaceName, 'encryption', 'sae');
				for (const wifiDevice of wifiDevices) {
					uci.set('wireless', wifiDevice.apSectionName, 'encryption', 'psk2');
				}
				break;
			case 'prplmesh':
				morseuci.forceBridge('lan', 'br-prpl', this.bridgeMAC);

				uci.set('prplmesh', 'config', 'enable', '1');
				uci.set('prplmesh', 'config', 'gateway', '1');
				uci.set('prplmesh', 'config', 'management_mode', 'Multi-AP-Controller-and-Agent');
				uci.set('prplmesh', 'config', 'operating_mode', 'Gateway');
				uci.set('prplmesh', 'config', 'wired_backhaul', '1');

				if (!uci.get('prplmesh', morseDeviceName)) {
					uci.add('prplmesh', 'wifi-device', morseDeviceName);
				}
				uci.set('prplmesh', morseDeviceName, 'hostap_iface', 'wlan-prpl');

				uci.set('wireless', morseInterfaceName, 'encryption', 'sae-mixed');
				uci.set('wireless', morseInterfaceName, 'bss_transition', '1');
				uci.set('wireless', morseInterfaceName, 'multi_ap', '3');
				uci.set('wireless', morseInterfaceName, 'ieee80211k', '1');
				uci.set('wireless', morseInterfaceName, 'ieee80211w', '2');
				uci.set('wireless', morseInterfaceName, 'ifname', 'wlan-prpl');
				uci.set('system', 'led_halow', 'dev', 'wlan-prpl');
				uci.set('wireless', morseInterfaceName, 'wps_virtual_push_button', '1');
				uci.set('wireless', morseInterfaceName, 'wps_independent', '0');
				uci.set('wireless', morseInterfaceName, 'auth_cache', '0');

				// Configure the non-HaLow radios to be managed by prplMesh
				wifiDevices.forEach((wifiDevice, i) => {
					if (!uci.get('prplmesh', wifiDevice.name)) {
						uci.add('prplmesh', 'wifi-device', wifiDevice.name);
					}
					uci.set('system', 'led_80211n_ap', 'dev', `wl${i}-prpl`);
					uci.set('prplmesh', wifiDevice.name, 'hostap_iface', `wl${i}-prpl`);
					uci.set('wireless', wifiDevice.apSectionName, 'ifname', `wl${i}-prpl`);
					uci.set('wireless', wifiDevice.apSectionName, 'encryption', 'sae-mixed');
					uci.set('wireless', wifiDevice.apSectionName, 'bss_transition', '1');
					uci.set('wireless', wifiDevice.apSectionName, 'multi_ap', '2');
					uci.set('wireless', wifiDevice.apSectionName, 'wps_virtual_push_button', '1');
					uci.set('wireless', wifiDevice.apSectionName, 'wps_independent', '0');
					uci.set('wireless', wifiDevice.apSectionName, 'auth_cache', '0');
				});

				break;
			case 'mesh':
				morseuci.forceBridge('lan', 'br-lan');

				uci.set('mesh11sd', 'mesh_params', 'mesh_gate_announcements', '1');

				if (!uci.get('wireless', morseMeshInterfaceName)) {
					uci.add('wireless', 'wifi-iface', morseMeshInterfaceName);
				} else {
					uci.unset('wireless', morseMeshInterfaceName, 'disabled');
				}

				uci.set('wireless', morseMeshInterfaceName, 'mode', 'mesh');
				uci.set('wireless', morseMeshInterfaceName, 'device', morseDeviceName);
				uci.set('wireless', morseMeshInterfaceName, 'encryption', 'sae');
				// Use credentials from AP interface as default if we don't have them.
				if (!uci.get('wireless', morseMeshInterfaceName, 'mesh_id')) {
					uci.set('wireless', morseMeshInterfaceName, 'mesh_id', uci.get('wireless', morseInterfaceName, 'ssid'));
				}
				// Clear ssid to avoid confusion.
				uci.unset('wireless', morseMeshInterfaceName, 'ssid');
				if (!uci.get('wireless', morseMeshInterfaceName, 'key')) {
					uci.set('wireless', morseMeshInterfaceName, 'key', uci.get('wireless', morseInterfaceName, 'key'));
				}

				for (const wifiDevice of wifiDevices) {
					uci.set('wireless', wifiDevice.apSectionName, 'encryption', 'psk2');
				}
				uci.set('system', 'led_halow', 'dev', 'wlh0');
				uci.set('system', 'led_80211n_ap', 'dev', 'phy0-ap0');
				break;
		}

		const network_mode = this.data.wizard[this.data.wizard.device_mode === 'prplmesh' ? 'network_mode_prplmesh' : 'network_mode'];
		switch (network_mode) {
			case 'bridged': // move HaLow and wan to wlan; don't use wan at all
				// Override lan with wlan as the primary local network.
				wizard.setupNetworkIface('wlan', { local: true, primaryLocal: true });
				uci.set('network', 'wlan', 'proto', 'dhcp');
				morseuci.getOrCreateForwarding('lan', 'wlan');

				// Set LAN devices
				morseuci.setNetworkDevices('lan', this.ethernetPorts.filter(p => p.device !== 'wan').map(p => p.device));
				// Keep 2.4 on LAN for setup; no use case for bridging this
				// AP onto an existing network that will almost certainly already have 2.4.
				for (const iface of uci.sections('wireless', 'wifi-iface')) {
					if (iface['disabled'] !== '1' && iface['device'] !== morseDeviceName) {
						uci.set('wireless', iface['.name'], 'network', 'lan');
					}
				}

				// Set WLAN devices
				morseuci.setNetworkDevices('wlan', ['wan']);
				for (const iface of uci.sections('wireless', 'wifi-iface')) {
					if (iface['disabled'] !== '1' && iface['device'] === morseDeviceName) {
						uci.set('wireless', iface['.name'], 'network', 'wlan');
					}
				}
				morseuci.createOrRemoveBridgeAsNeeded('wlan');
				break;
			case 'routed_wan': // everything on lan except wan port
			default:
				uci.set('network', 'wan', 'proto', 'dhcp');
				morseuci.getOrCreateForwarding('lan', 'wan');

				// Set LAN devices
				morseuci.setNetworkDevices('lan', this.ethernetPorts.filter(p => p.device !== 'wan').map(p => p.device));
				for (const iface of uci.sections('wireless', 'wifi-iface')) {
					if (iface['disabled'] !== '1') {
						uci.set('wireless', iface['.name'], 'network', 'lan');
					}
				}

				// Set WAN devices
				morseuci.setNetworkDevices('wan', ['wan']);
				break;
			case 'routed_wifi24': // everything on lan except 2.4 Wi-Fi STA; 'wan' disabled.
				uci.set('network', 'wan', 'proto', 'dhcp');
				morseuci.getOrCreateForwarding('lan', 'wan');

				// Set LAN devices
				morseuci.setNetworkDevices('lan', this.ethernetPorts.filter(p => p.device !== 'wan').map(p => p.device));
				for (const iface of uci.sections('wireless', 'wifi-iface')) {
					if (iface['disabled'] !== '1') {
						uci.set('wireless', iface['.name'], 'network', 'lan');
					}
				}

				// Set WAN devices
				for (const wifiDevice of wifiDevices) {
					if (uci.get('wireless', wifiDevice.staSectionName)) {
						uci.unset('wireless', wifiDevice.staSectionName, 'disabled');
					} else {
						uci.add('wireless', 'wifi-iface', wifiDevice.staSectionName);
					}
					uci.set('wireless', wifiDevice.staSectionName, 'device', wifiDevice.name);
					uci.set('wireless', wifiDevice.staSectionName, 'mode', 'sta');
					uci.set('wireless', wifiDevice.staSectionName, 'network', 'wan');
					if (!uci.get('wireless', wifiDevice.staSectionName, 'ssid')) {
						// Without setting something here, if no SSID is specified
						// wpa_supplicant likes to connect to any open network.
						uci.set('wireless', wifiDevice.staSectionName, 'encryption', 'psk2');
					}
				}
				break;
		}

		// (3) Update diagram now we've flushed our config.
		this.diagram.updateFrom(uci, this.ethernetPorts);

		// (4) Update extra infobox.
		this.updateInfoBox();
	},

	updateInfoBox() {
		const EASYMESH_INFO = _(`
			<p>Easy Mesh Controller configuration allows centralized management of WiFi network credentials.
			The HaLow Gateway's network credentials will be automatically applied to all extenders.
			<p>Note: The extender's QR code for Wi-Fi connection will no longer be valid.
		`);
		const WIFI_UPLINK_INFO = _(`
			After saving a 2.4 GHz Wi-Fi uplink configuration, you will need to connect to the correct
			network on the Home page. Find the Uplink card, click on the "Disconnected" cross, then
			set the SSID and password.
		`);

		const shouldShowWifi24UplinkInfo = (
			(this.data.wizard.device_mode !== 'prplmesh' && this.data.wizard.network_mode === 'routed_wifi24')
			|| (this.data.wizard.device_mode === 'prplmesh' && this.data.wizard.network_mode_prplmesh === 'routed_wifi24')
		);
		const shouldShowEasyMeshInfo = (this.data.wizard.device_mode === 'prplmesh');

		let message = '';
		if (shouldShowWifi24UplinkInfo) {
			message += WIFI_UPLINK_INFO;
		}
		if (shouldShowEasyMeshInfo) {
			if (message) message += '<br><br>'; // Add spacing between messages
			message += EASYMESH_INFO;
		}

		// Update the infobox
		this.infobox.innerHTML = message;
		this.infobox.style.display = message ? 'block' : 'none';
	},

	async load() {
		const [networkDevices, ethernetPorts, morseModeInfo] = await Promise.all([
			network.getDevices(),
			callGetBuiltinEthernetPorts(),
			callMorseModeQuery(),
			configDiagram.loadTemplate(),
			uci.load(['network', 'wireless', 'dhcp', 'system', 'firewall', 'prplmesh', 'mesh11sd', 'umdns']),
		]);

		if (morseModeInfo.persistent_morse_mode === 'sta') {
			this.errorMessage = EXTENDER_MODE_MESSAGE;
		} else {
			try {
				const { wifiDevices } = wizard.readSectionInfo();

				if (wifiDevices.length == 0) {
					this.errorMessage = INVALID_CONFIG_MESSAGE.format(_('No non-HaLow Wi-Fi radios found'));
				}
			} catch (e) {
				this.errorMessage = INVALID_CONFIG_MESSAGE.format(e.message);
			}
		}

		// Hide buttons if we want an error message.
		if (this.errorMessage) {
			this.handleSave = null;
			this.handleSaveApply = null;
		}

		return [networkDevices, ethernetPorts];
	},

	async render([networkDevices, builtinEthernetPorts]) {
		if (this.errorMessage) {
			return [
				E('h2', _('Wizard')),
				E('section', { class: 'message' }, this.errorMessage),
			];
		}

		this.bridgeMAC = morseuci.getFakeMorseMAC(networkDevices) ?? morseuci.getRandomMAC();
		this.ethernetPorts = morseuci.getEthernetPorts(builtinEthernetPorts, networkDevices);
		this.data = {
			wizard: {
				device_mode: this.getDeviceMode(),
				network_mode: this.getNetworkMode(),
				network_mode_prplmesh: this.getNetworkMode(),
			},
		};

		this.diagram = E('morse-config-diagram');
		this.diagram.updateFrom(uci, this.ethernetPorts);
		this.infobox = E('div', { class: 'alert-message notice' });
		this.updateInfoBox();

		this.map = new form.JSONMap(this.data);
		const s = this.map.section(form.NamedSection, 'wizard');
		let o = s.option(form.ListValue, 'device_mode', _('HaLow Mode'));
		o.widget = 'radio';
		o.orientation = 'vertical';
		const makeOptionWithInfo = (key, val, info) => {
			o.value(key, E('span', {}, [
				E('span', { style: 'width: 12rem; display: inline-block;' }, val),
				E('em', { style: 'margin-left: 1rem; display: inline-block; width: 14rem; white-space: nowrap;' }, '← ' + info),
			]));
		};
		makeOptionWithInfo('standard', _('Access Point'), _('Fastest mode if <4km range.'));
		makeOptionWithInfo('mesh', _('802.11s Mesh'), _('Use extra devices for more range.'));
		makeOptionWithInfo('prplmesh', _('EasyMesh Controller'), _('Use extra devices for more range.'));
		o.onchange = () => this.saveToUciCache();
		o.default = 'standard';

		o = s.option(form.ListValue, 'network_mode', _('Network Mode'));
		o.widget = 'radio';
		o.orientation = 'vertical';
		o.value('bridged', _('HaLow Wi-Fi devices will get an IP on your existing router\'s network.'));
		const routed_wan_string = _('HaLow Wi-Fi devices will get an IP on this device\'s local network.');
		o.value('routed_wan', routed_wan_string);
		const routed_wifi24_string = _('HaLow Wi-Fi devices will get an IP on this device\'s local network and use 2.4 GHz Wi-Fi for an uplink (not an Ethernet cable).');
		o.value('routed_wifi24', routed_wifi24_string);
		o.depends({ '!reverse': true, 'device_mode': 'prplmesh' });
		o.onchange = () => this.saveToUciCache();
		o.default = 'bridged';

		// Prplmesh doesn't currently support bridged mode, as the Morse implementation requires the
		// DHCP server to be on the prplmesh controller node.
		o = s.option(form.ListValue, 'network_mode_prplmesh', _('Network Mode'));
		o.widget = 'radio';
		o.orientation = 'vertical';
		o.value('routed_wan', routed_wan_string);
		o.value('routed_wifi24', routed_wifi24_string);
		o.depends('device_mode', 'prplmesh');
		o.onchange = () => this.saveToUciCache();
		o.default = 'routed_wan';

		return await Promise.all([
			E('h2', _('Wizard')),
			E('div', { class: 'cbi-section' }, this.diagram),
			this.map.render(),
			this.infobox,
			E('details', { class: 'cbi-section', style: 'padding: 20px; cursor: pointer;' }, [
				E('summary', { style: 'font-weight: bold;' }, 'How do I configure this device as a HaLow Client/Station?'),
				E('div', {}, AP_MODE_MESSAGE),
			]),
		]);
	},

	getDeviceMode() {
		if (uci.get('prplmesh', 'config', 'enable') === '1') {
			return 'prplmesh';
		} else {
			const morseDevice = uci.sections('wireless', 'wifi-device').find(ns => ns.type === 'morse');
			if (morseDevice && uci.sections('wireless', 'wifi-iface').find(ns => ns['device'] === morseDevice['.name'] && ns['disabled'] !== '1' && ns['mode'] === 'mesh')) {
				return 'mesh';
			} else {
				return 'standard';
			}
		}
	},

	getNetworkMode() {
		if (morseuci.getNetworkWifiIfaces('wan').some(iface => iface['mode'] === 'sta')) {
			return 'routed_wifi24';
		} else if (morseuci.getNetworkDevices('wan').includes('wan')) {
			return 'routed_wan';
		} else {
			return 'bridged';
		}
	},
});
