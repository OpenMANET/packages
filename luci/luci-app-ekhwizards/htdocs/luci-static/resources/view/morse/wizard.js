'use strict';

/* globals form morseuci morseui uci widgets wizard */
'require form';
'require uci';
'require tools.widgets as widgets';
'require tools.morse.wizard as wizard';
'require tools.morse.uci as morseuci';
'require tools.morse.morseui as morseui';

const DPP_QRCODE_PATH = `/dpp_qrcode.svg?v=${L.env.sessionid?.slice(10)}`;

return wizard.AbstractWizardView.extend({
	__init__(/* ... */) {
		return this.super('__init__', this.varargs(arguments, 1,
			_('Wi-Fi HaLow Wizard'),
			_(`<p>This wizard will guide you in setting up your device as a simple <b>Client</b> or <b>Access Point</b>.
				<p>You can exit now if you prefer to complete your configuration manually.</p>`),
			'morse-config-diagram',
			new form.Map('wireless')));
	},

	/* Populate the network.wizard section with calculated values.
	 * These values are removed when saving (i.e. not persisted), but
	 * having them present makes diagram and wizard operations easier.
	 *
	 * Note that this is 'best effort' - the main thing is to:
	 *  - show the same option if the user has persisted it
	 *  - on initial setup, or switching modes, to show no option selected
	 *
	 * If the user has been modifying their config outside the wizard,
	 * then the selected option may not correspond well.
	 */
	loadWizardOptions() {
		const {
			wifiDevices,
			morseInterfaceName,
		} = wizard.readSectionInfo();

		const ahwlanZone = morseuci.getZoneForNetwork('ahwlan');
		const lanZone = morseuci.getZoneForNetwork('lan');
		const forwardsLanToAhwlan = uci.sections('firewall', 'forwarding').some(f => f.src === lanZone && f.dest === ahwlanZone && f.enabled !== '0');

		const {
			ethDHCPNetwork,
			ethDHCPPort,
			ethStaticNetwork,
		} = wizard.readEthernetPortInfo(this.getEthernetPorts());

		// If we weren't an AP, force choice again.
		const getUplink = () => {
			if (uci.get('wireless', morseInterfaceName, 'mode') !== 'ap' || uci.get('prplmesh', 'config', 'enable') === '1') {
				return undefined;
			}

			for (const wifiDevice of wifiDevices) {
				// Return the first device setup as a station as the uplink
				if (uci.get('wireless', wifiDevice.staInterfaceName) && uci.get('wireless', wifiDevice.staInterfaceName, 'disabled') !== '1') {
					return `wifi-${wifiDevice.staInterfaceName}`;
				}
			}

			if (ethDHCPNetwork) {
				if (this.ethernetPorts.length > 1) {
					return `ethernet-${ethDHCPPort}`;
				} else {
					return 'ethernet';
				}
			} else if (ethStaticNetwork !== uci.get('wireless', morseInterfaceName, 'network')) {
				// HaLow is separate to ethernet, but there's no ethernet DHCP client.
				// This is probably like 'none'.
				return 'none';
			} else {
				// Note that this captures the default OpenWrt, where the AP and ethernet port
				// are on the same network and there's a DHCP server, but we don't support this mode
				// in the wizard.
				return undefined;
			}
		};

		const getDeviceModeAp = () => {
			if (getUplink()?.includes('ethernet')) {
				if (ethDHCPNetwork === uci.get('wireless', morseInterfaceName, 'network')) {
					return 'bridge';
				} else if (ethDHCPNetwork === 'wan' && this.ethernetPorts.length > 1) {
					return 'router_firewall';
				} else {
					return 'router';
				}
			} else {
				return undefined;
			}
		};

		// If we weren't a STA, force choice again.
		const getDeviceModeSta = () => {
			if (uci.get('wireless', morseInterfaceName, 'mode') !== 'sta' || uci.get('prplmesh', 'config', 'enable') === '1') {
				return undefined;
			} else if (ethStaticNetwork === 'lan') {
				return forwardsLanToAhwlan ? 'extender' : 'none';
			} else if (ethDHCPNetwork === uci.get('wireless', morseInterfaceName, 'network')) {
				return 'bridge';
			} else {
				return undefined;
			}
		};

		uci.add('network', 'wizard', 'wizard');
		uci.set('network', 'wizard', 'device_mode_ap', getDeviceModeAp());
		uci.set('network', 'wizard', 'device_mode_sta', getDeviceModeSta());
		uci.set('network', 'wizard', 'uplink', getUplink());
	},

	/* Handle complex config here. Basic wifi setup is covered by the usual UCI actions.
	 * We pass this through to morseconf.js so our 'complex' setup is shared.
	 * Like the standard OpenWrt parse, this _also_ does uci.set
	 * (but does not uci.save).
	 */
	parseWizardOptions() {
		// Clear out any network stuff we've created from alternative sets of options
		// so we don't have to consider as many alternative cases.
		wizard.resetUciNetworkTopology();

		const {
			wifiDevices,
			morseInterfaceName,
			lanIp,
			wlanIp,
		} = wizard.readSectionInfo();

		wizard.setupNetworkIface('lan', { local: true });
		wizard.setupNetworkIface('ahwlan', { local: true, primaryLocal: true });
		// Force wan even if not using to make sure that wan firewall rules are retained
		// (resetUciNetworkTopology removes).
		wizard.setupNetworkIface('wan');

		// Extract values then remove from dummy uci section.
		const device_mode_ap = uci.get('network', 'wizard', 'device_mode_ap');
		const device_mode_sta = uci.get('network', 'wizard', 'device_mode_sta');
		const uplink = uci.get('network', 'wizard', 'uplink');

		const mode = uci.get('wireless', morseInterfaceName, 'mode');
		const wifiApsEnabled = {};
		for (const wifiDevice of wifiDevices) {
			// Record whether each device has an enabled AP
			wifiApsEnabled[wifiDevice.name] = uci.get('wireless', wifiDevice.apInterfaceName, 'disabled') !== '1';

			// We don't have an explicit option for this, but it's determined by uplink.
			// And because uplink is a complex option that's not valid for clients and is resolved here...
			uci.set('wireless', wifiDevice.staInterfaceName, 'disabled', uplink === `wifi-${wifiDevice.staInterfaceName}` ? '0' : '1');
		}

		// Wizard only supports SAE for simplicity (less choice for user).
		uci.set('wireless', morseInterfaceName, 'encryption', 'sae');

		const bridgeMode = () => {
			morseuci.setNetworkDevices('ahwlan', this.getEthernetPorts().map(p => p.device));
			uci.set('wireless', morseInterfaceName, 'network', 'ahwlan');

			for (const wifiDevice of wifiDevices) {
				if (wifiApsEnabled[wifiDevice.name]) {
					uci.set('wireless', wifiDevice.apInterfaceName, 'network', 'ahwlan');
				}
			}

			morseuci.createOrRemoveBridgeAsNeeded('ahwlan');

			return 'ahwlan';
		};

		const nonBridgeMode = () => {
			// We exclude non-builtins to avoid accidentally bridging an LTE USB dongle running
			// its own DHCP server (which will end up confusing the user a lot).
			morseuci.setNetworkDevices('lan', this.getEthernetPorts().filter(p => p.builtin).map(p => p.device));
			uci.set('wireless', morseInterfaceName, 'network', 'ahwlan');

			for (const wifiDevice of wifiDevices) {
				if (wifiApsEnabled[wifiDevice.name]) {
					uci.set('wireless', wifiDevice.apInterfaceName, 'network', 'lan');
				}
			}

			morseuci.createOrRemoveBridgeAsNeeded('lan');
			morseuci.createOrRemoveBridgeAsNeeded('ahwlan');

			return { ethIface: 'lan', halowIface: 'ahwlan' };
		};

		if (mode === 'ap') {
			// If we're an AP, we should have WDS on regardless as we can't predict
			// when a STA using WDS will connect to us.
			uci.set('wireless', morseInterfaceName, 'wds', '1');

			if (uplink?.match(/ethernet/) && device_mode_ap?.match(/router/)) {
				// Network
				const upstreamNetwork = device_mode_ap === 'router_firewall' ? 'wan' : 'lan';
				if (upstreamNetwork === 'wan') {
					morseuci.getOrCreateForwarding('ahwlan', 'wan');
				} else {
					morseuci.getOrCreateForwarding('ahwlan', 'lan', 'mmrouter');
				}

				// Devices
				uci.set('wireless', morseInterfaceName, 'network', 'ahwlan');
				for (const wifiDevice of wifiDevices) {
					if (wifiApsEnabled[wifiDevice.name]) {
						uci.set('wireless', wifiDevice.apInterfaceName, 'network', 'ahwlan');
					}
				}
				const [_, port] = uplink.split('-');
				if (port) {
					morseuci.setNetworkDevices(upstreamNetwork, [port]);
					morseuci.setNetworkDevices('ahwlan', this.getEthernetPorts().filter(p => p.device !== port).map(p => p.device));
				} else {
					morseuci.setNetworkDevices(upstreamNetwork, this.getEthernetPorts().map(p => p.device));
				}

				// Bridges
				morseuci.createOrRemoveBridgeAsNeeded(upstreamNetwork);
				morseuci.createOrRemoveBridgeAsNeeded('ahwlan');

				uci.set('network', upstreamNetwork, 'proto', 'dhcp');
				morseuci.setupNetworkWithDnsmasq('ahwlan', wlanIp);
			} else if (uplink === 'none') {
				const { ethIface, halowIface } = nonBridgeMode();

				// This is a weird overload of the var name
				morseuci.setupNetworkWithDnsmasq(ethIface, lanIp, false);
				morseuci.setupNetworkWithDnsmasq(halowIface, wlanIp, false);
			} else if (uplink?.match(/ethernet/) && device_mode_ap === 'bridge') {
				const iface = bridgeMode();

				uci.set('network', iface, 'proto', 'dhcp');
			} else if (uplink?.match(/wifi/)) {
				// Confusingly, this is 'bridgeMode' even though we forward between interfaces
				// (as we put both ethernet/halow on ahwlan).
				const iface = bridgeMode();

				wizard.setupNetworkIface('lan', { local: true });
				uci.set('network', 'lan', 'proto', 'dhcp');
				const [_, uplinkWifiStaInterfaceName] = uplink.split('-');
				uci.set('wireless', uplinkWifiStaInterfaceName, 'network', 'lan');
				morseuci.setupNetworkWithDnsmasq(iface, wlanIp);
				morseuci.getOrCreateForwarding(iface, 'lan', 'mmrouter');
			}
		} else if (mode === 'sta') {
			if (device_mode_sta === 'extender') { // i.e. router
				const { ethIface, halowIface } = nonBridgeMode();

				uci.unset('wireless', morseInterfaceName, 'wds');
				uci.set('network', halowIface, 'proto', 'dhcp');
				morseuci.setupNetworkWithDnsmasq(ethIface, lanIp);
				morseuci.getOrCreateForwarding(ethIface, halowIface, 'mmextender');
			} else if (device_mode_sta === 'none') {
				const { ethIface, halowIface } = nonBridgeMode();

				uci.unset('wireless', morseInterfaceName, 'wds');
				uci.set('network', halowIface, 'proto', 'dhcp');
				morseuci.setupNetworkWithDnsmasq(ethIface, lanIp, false);
			} else if (device_mode_sta === 'bridge') {
				const iface = bridgeMode();

				uci.set('wireless', morseInterfaceName, 'wds', '1');
				uci.set('network', iface, 'proto', 'dhcp');
			}
		}
	},

	async loadPages() {
		let hasQRCode = false;
		try {
			hasQRCode = (await fetch(DPP_QRCODE_PATH, { method: 'HEAD' })).ok;
		} catch (e) { false; }
		// resetUci disables all wifi-ifaces, but we want to remember the state of this one.
		const {
			wifiDevices,
		} = wizard.readSectionInfo();
		const wifiApsEnabled = wifiDevices.reduce((acc, wifiDevice) => ({
			...acc,
			[wifiDevice.name]: uci.get('wireless', wifiDevice.apInterfaceName, 'disabled') !== '1',
		}), {});
		return [hasQRCode, wifiApsEnabled];
	},

	renderPages([hasQRCode, wifiApsEnabled]) {
		// The general policy here is to make as small a choice as possible on each page.
		//
		// Oddly, if you change this.uciconfig this affects the cbid
		// (BUT changing ucioption/ucisection doesn't). The implication is that you have
		// to be a bit careful specifying depends in certain situations.
		//
		// WARNING: it's important to use 'retain' a lot here, because in general
		// we don't want options from non-displayed pages wiped out.
		let page, option;

		const map = this.map;
		const {
			wifiDevices,
			morseDeviceName,
			morseInterfaceName,
		} = wizard.readSectionInfo();

		uci.unset('wireless', morseInterfaceName, 'disabled');

		for (const wifiDevice of wifiDevices) {
			// Remove any traces of the AP ever being disabled
			if (wifiApsEnabled[wifiDevice.name]) {
				uci.unset('wireless', wifiDevice.apInterfaceName, 'disabled');
			}

			uci.set('wireless', wifiDevice.apInterfaceName, 'device', wifiDevice.name);
			uci.set('wireless', wifiDevice.apInterfaceName, 'mode', 'ap');
			if (!uci.get('wireless', wifiDevice.staInterfaceName)) {
				uci.add('wireless', 'wifi-iface', wifiDevice.staInterfaceName);
			}
			uci.set('wireless', wifiDevice.staInterfaceName, 'device', wifiDevice.name);
			uci.set('wireless', wifiDevice.staInterfaceName, 'mode', 'sta');
		}

		const initialMorseMode = uci.get('wireless', morseInterfaceName, 'mode');
		if (uci.get('luci', 'wizard', 'used') !== '1') {
			// Force user to make this choice again if wizard not used.
			uci.unset('wireless', morseInterfaceName, 'mode');
		}

		const morseDeviceSection = map.section(form.NamedSection, morseDeviceName, 'wifi-device');
		const morseInterfaceSection = map.section(form.NamedSection, morseInterfaceName, 'wifi-interface');
		const wifiApInterfaceSections = {};
		for (const wifiDevice of wifiDevices) {
			wifiApInterfaceSections[wifiDevice.name] = map.section(form.NamedSection, wifiDevice.apInterfaceName, 'wifi-interface');
		}
		// We put the network configuration in its own dummy section inside wireless.
		//
		// This means:
		//  - our dependencies work properly
		//  - the different map doesn't constrain our ui order
		//
		// All .load functions are overridden to figure it out based on the underlying
		// option values. In handleSave, we remove this section and only persist the related
		// options.
		const networkSection = map.section(form.NamedSection, 'wizard', 'wizard');
		networkSection.uciconfig = 'network';

		// Keeping a reference to the current AbstractWizardView for use in callbacks
		const thisWizardView = this;

		/*****************************************************************************/

		page = this.page(morseInterfaceSection,
			'',
			_(`As with any Wi-Fi network, HaLow has <b>Clients</b> (also known as stations) which discover
				and connect to an <b>Access Point</b>. If you select client, non-HaLow devices can use
				the HaLow link by connecting to the other interfaces.`));

		var apModeText = _(`In <b>Access Point</b> mode, the device can accept connections from HaLow clients.`);
		var clientModeText = _(`In <b>Client</b> mode, the device discovers and connects to a HaLow access point (AP).`);

		page.enableDiagram({
			extras: ['AP_SELECT_FILL', 'STA_SELECT_FILL'],
			blacklist: ['AP_HALOW_INT',
			            'AP_MGMT_ETH', 'AP_UPLINK', 'AP_UPLINK_ETH', 'AP_UPLINK_WIFI', 'AP_WIFI',
			            'STA_HALOW', 'STA_WIFI', 'MESH_HALOW', 'STA_MGMT_ETH'],
		});

		option = page.option(form.ListValue, 'mode');
		option.displayname = _('Mode selection');
		option.widget = 'radio';
		option.orientation = 'vertical';
		option.value('ap', _('Access Point'));
		option.value('sta', _('Client'));
		option.rmempty = false;
		option.onchange = function (ev, sectionId, value) {
			// To avoid the wrong SSID appearing in the diagram
			// on subsequent pages, interactions on this page wipe it from
			// uci. Happily, this doesn't affect the form elements as they
			// will have loaded an appropriate old ssid (i.e. ssid/sta_ssid),
			// so when they get evaluated this ssid will get set again.
			uci.unset('wireless', sectionId, 'ssid');

			if (value == 'ap') {
				this.page.updateInfoText(apModeText, thisWizardView);
			} else if (value == 'sta') {
				this.page.updateInfoText(clientModeText, thisWizardView);
			}
			thisWizardView.onchangeOptionUpdateDiagram(this);
		};

		/*****************************************************************************/

		page = this.page(morseInterfaceSection,
			_('Setup HaLow Network - AP'),
			_(`Available <b>Bandwidths</b> and <b>Channels</b> differ greatly across regions. The higher
				your bandwidth, the greater the potential throughput of the connection.
				If you're deploying multiple HaLow access points you may want to select
				distinct channels and a lower bandwidth to reduce interference.`));
		page.enableDiagram({
			extras: ['AP_HALOW_INT_SELECT', 'AP_HALOW_INT_SELECT_FILL'],
			blacklist: ['AP_MGMT_ETH', 'AP_UPLINK', 'AP_UPLINK_ETH', 'AP_UPLINK_WIFI', 'AP_WIFI',
			            'STA_HALOW_INT', 'AP_HALOW_INT:IP', 'AP_HALOW_INT:IPMethod'],
		});

		option = page.option(form.Value, 'ssid', _('<abbr title="Service Set Identifier">SSID</abbr>'));
		option.depends('mode', 'ap');
		option.datatype = 'maxlength(32)';
		option.rmempty = false;
		option.retain = true;
		option.onchange = function () {
			thisWizardView.onchangeOptionUpdateDiagram(this);
		};
		// Make sure we only load the SSID if we were already an AP; otherwise (or if unset) use default instead.
		option.load = sectionId =>
			((uci.get('wireless', morseDeviceName, 'mode') || initialMorseMode) === 'ap' && uci.get('wireless', sectionId, 'ssid'))
			|| morseuci.getDefaultSSID();
		option.forcewrite = true; // Required since our load doesn't reflect uci.

		option = page.option(form.Value, 'key', _('Passphrase'));
		option.depends('mode', 'ap');
		option.datatype = 'wpakey';
		option.password = true;
		option.rmempty = false;
		option.retain = true;
		// Make sure we only load the key if we were already an AP; otherwise (or if unset) use default instead.
		option.load = sectionId =>
			((uci.get('wireless', morseDeviceName, 'mode') || initialMorseMode) === 'ap' && uci.get('wireless', sectionId, 'key'))
			|| morseuci.getDefaultWifiKey();
		option.forcewrite = true; // Required since our load doesn't reflect uci.

		option = page.option(widgets.WifiFrequencyValue, '_freq', '<br />' + _('Operating Frequency'));
		option.depends('mode', 'ap');
		option.ucisection = morseDeviceName;
		option.rmempty = false;
		option.retain = true;

		/*****************************************************************************/

		var manualCredInfo = _('Fill in the credentials to connect to a HaLow Access Point.');
		var dppCredInfo = _(`<b>DPP</b> (Device Provisioning Protocol) lets you scan a QR code to automatically
			connect to a HaLow access point.`);

		page = this.page(morseInterfaceSection,
			_('Connect to a HaLow Network'),
			manualCredInfo);

		page.enableDiagram({
			extras: ['STA_HALOW_INT_SELECT', 'STA_HALOW_INT_SELECT_FILL'],
			blacklist: ['STA_WIFI', 'MESH_HALOW', 'STA_MGMT_ETH',
			            'STA_HALOW_INT:IP', 'STA_HALOW_INT:IPMethod'],
		});

		if (hasQRCode) {
			option = page.option(form.ListValue, 'dpp');
			option.displayname = _('Authentication method');
			option.depends('mode', 'sta');
			option.widget = 'radio';
			option.orientation = 'vertical';
			option.value('0', _('Manual credentials'));
			option.value('1', _('DPP (Device Provisioning Protocol) QR Code'));
			option.rmempty = false;
			option.retain = false;
			option.onchange = function (ev, sectionId, value) {
				if (value == '0') {
					this.page.updateInfoText(manualCredInfo, thisWizardView);
				} else if (value == '1') {
					this.page.updateInfoText(dppCredInfo, thisWizardView);
				}
				thisWizardView.onchangeOptionUpdateDiagram(this);
			};
		} else {
			option = page.option(form.HiddenValue, 'dpp');
			option.depends('mode', 'sta');
			option.load = () => '0';
			option.forcewrite = true;
		}

		// Because these options duplicate the options above, we have to
		// have distinct names.
		option = page.option(morseui.SSIDListScan, 'sta_ssid', _('<abbr title="Service Set Identifier">SSID</abbr>'));
		option.depends({ mode: 'sta', dpp: '0' });
		option.ucioption = 'ssid';
		option.rmempty = false;
		option.retain = true;
		option.staOnly = true;
		option.scanAlerts = true;
		option.scanEncryptions = ['sae', 'owe'];
		option.onchangeWithEncryption = function (ev, sectionId, _value, _encryption) {
			thisWizardView.onchangeOptionUpdateDiagram(this);
			this.section.getUIElement(sectionId, 'sta_key').setValue('');
		};
		// Only load SSID if STA mode.
		option.load = sectionId => (uci.get('wireless', morseDeviceName, 'mode') || initialMorseMode) === 'sta' ? uci.get('wireless', sectionId, 'ssid') : '';

		option = page.option(form.Value, 'sta_key', _('Passphrase'));
		option.depends({ mode: 'sta', dpp: '0' });
		option.ucioption = 'key';
		option.datatype = 'wpakey';
		option.password = true;
		option.rmempty = false;
		option.retain = true;
		// Only load the key if STA mode.
		option.load = sectionId => (uci.get('wireless', morseDeviceName, 'mode') || initialMorseMode) === 'sta' ? uci.get('wireless', sectionId, 'key') : '';

		/*****************************************************************************/

		// Device mode for client only.
		// i.e. if we're a router, we call it an 'extender'.
		page = this.page(networkSection,
			_('Traffic Mode'),
			_(`We recommend configuring this device as a <b>Bridge</b>.
				This allows non-HaLow devices to obtain IPs over your HaLow link.

				<p>However, if the HaLow Access Point you connect to does not have
				<abbr title="Wireless Distribution System">WDS</abbr> (aka 4 address mode) enabled,
				select <b>Extender</b> to create a separate network for the non-HaLow devices.
				<em>All HaLow access points configured via this wizard have WDS enabled.</em>
				This device will run a DHCP server on the non-HaLow interfaces, and
				it will use NAT to forward IP traffic between HaLow and non-HaLow networks.

				<p>Choose <b>None</b> to keep the HaLow and non-HaLow networks isolated,
				this is the mode the device uses after factory reset.`));
		var noneInfoSta = _(`In <b>None</b> traffic mode, non-HaLow and HaLow networks are isolated.
			This device will use a static IP address and run a DHCP server on the non-HaLow interface.`);
		var bridgeInfoSta = _('In <b>Bridged</b> traffic mode, non-HaLow devices obtain IPs from your HaLow link.');
		var extenderInfoSta = _(`In <b>Extender</b> traffic mode, non-HaLow devices obtain IPs from the DHCP server
			on this device and this device uses NAT to forward IP traffic.`);

		page.enableDiagram({
			extras: [
				'STA_HALOW_INT_SELECT', 'STA_HALOW_INT_SELECT_FILL',
				'STA_MGMT_ETH_INT_SELECT', 'STA_MGMT_ETH_INT_SELECT_FILL',
			],
			blacklist: ['MESH_HALOW', 'STA_WIFI'],
		});

		option = page.option(form.ListValue, 'device_mode_sta');
		option.displayname = _('Traffic mode');
		option.depends(`wireless.${morseInterfaceName}.mode`, 'sta');
		option.rmempty = false;
		option.retain = true;
		option.widget = 'radio';
		option.orientation = 'vertical';
		option.value('none', _('None'));
		option.value('bridge', _('Bridge'));
		option.value('extender', _('Extender'));
		option.onchange = function (ev, sectionId, value) {
			if (value == 'bridge') {
				this.page.updateInfoText(bridgeInfoSta, thisWizardView);
			} else if (value == 'extender') {
				this.page.updateInfoText(extenderInfoSta, thisWizardView);
			} else if (value == 'none') {
				this.page.updateInfoText(noneInfoSta, thisWizardView);
			}
			thisWizardView.onchangeOptionUpdateDiagram(this);
		};

		/*****************************************************************************/

		var ethInfoAp = _(`If you use an <b>Ethernet</b> upstream, we recommend choosing <b>Bridge</b>.
			This allows HaLow connected devices to obtain IPs from your Ethernet network.`);
		var wifiInfoAp = _(`If you use a <b>Wi-Fi</b> upstream, fill in the Wi-Fi AP credentials.
			The HaLow connected devices obtain IP addresses from the DHCP server on this device,
			and this device uses NAT to forward IP traffic.`);
		var noneInfoAp = _(`In <b>None</b> mode, your device will have a static IP address and run a
			DHCP server on all interfaces, the HaLow and non-HaLow networks will be isolated from each other.`);
		var bridgeInfoAp = _(`In <b>Bridge</b> mode this device and the HaLow connected devices obtain IP addresses from
			your current upstream network.`);
		var routerInfoAp = _(`In <b>Router</b> mode the HaLow connected devices obtain IP addresses from
			the DHCP server on this device, and this device uses NAT to forward IP traffic. <strong>Only use this if you
			intend to connect to a trusted network</strong>, as this admin interface
			will be accessible on the upstream network.`);
		var routerFirewallInfoAp = _(`In <b>Router with Firewall</b> mode the HaLow connected devices obtain IP addresses from
			the DHCP server on this device, and this device uses NAT to forward IP traffic. The admin interface
			will be blocked on the network you connect to, which is the normal behaviour for a home router.
			Choose this when connecting directly to the internet.`);

		page = this.page(networkSection,
			_('Upstream Network'),
			_(`You are using this HaLow device as an access point, you should configure how it
			connects to the internet (or some other network).
			<p>
			If you choose <b>None</b>, your device will have a static IP address and run a DHCP server on all interfaces,
			the HaLow and non-HaLow networks will be isolated from each other.
			If you choose an upstream network, your HaLow and non-HaLow networks will be connected.
			<p>`));
		page.enableDiagram({
			extras: [
				'AP_MGMT_ETH_INT_SELECT', 'AP_MGMT_ETH_INT_SELECT_FILL',
				'AP_UPLINK_ETH_INT_SELECT', 'AP_UPLINK_ETH_INT_SELECT_FILL',
				'AP_UPLINK_WIFI_INT_SELECT', 'AP_UPLINK_WIFI_INT_SELECT_FILL',
				'AP_HALOW_INT_SELECT', 'AP_HALOW_INT_SELECT_FILL',
			],
			blacklist: ['STA_WIFI', 'MESH_HALOW', 'STA_MGMT_ETH', 'AP_WIFI'],
		});

		option = page.option(form.ListValue, 'uplink');
		option.displayname = _('Upstream network');
		option.depends(`wireless.${morseInterfaceName}.mode`, 'ap');
		option.rmempty = false;
		option.widget = 'radio';
		option.orientation = 'vertical';
		option.value('none', _('None'));
		if (this.getEthernetPorts().length === 1) {
			option.value('ethernet', _('Ethernet'));
		} else if (this.getEthernetPorts().length > 1) {
			const nonDonglePorts = [];
			for (const port of this.getEthernetPorts()) {
				if (!port.builtin) {
					option.value(`ethernet-${port.device}`, `Dongle (${port.device}) - e.g. a USB LTE dongle or tethered phone`);
				} else {
					nonDonglePorts.push(port);
				}
			}

			// Put the non-dongle ports at the end, as dongle is preferred.
			for (const port of nonDonglePorts) {
				option.value(`ethernet-${port.device}`, `Ethernet (${port.device})`);
			}
		}

		for (const wifiDevice of wifiDevices) {
			const displayName = wifiDevices.length > 1
				? `${wifiDevice.getBandName()} Wi-Fi (${wifiDevice.name})`
				: `${wifiDevice.getBandName()} Wi-Fi`;
			option.value(`wifi-${wifiDevice.staInterfaceName}`, displayName);
		}
		option.onchange = function (ev, sectionId, value) {
			if (value.includes('ethernet')) {
				this.page.updateInfoText(ethInfoAp, thisWizardView);
			} else if (value.includes('wifi')) {
				this.page.updateInfoText(wifiInfoAp, thisWizardView);
			} else if (value == 'none') {
				this.page.updateInfoText(noneInfoAp, thisWizardView);
			}
			thisWizardView.onchangeOptionUpdateDiagram(this);
		};

		for (const wifiDevice of wifiDevices) {
			option = page.option(morseui.SSIDListScan, `uplink_ssid-${wifiDevice.staInterfaceName}`, _('<abbr title="Service Set Identifier">SSID</abbr>'));
			// Have to be explicit here because we change uciconfig/section/option.
			option.depends('network.wizard.uplink', `wifi-${wifiDevice.staInterfaceName}`);
			option.uciconfig = 'wireless';
			option.ucisection = wifiDevice.staInterfaceName;
			option.ucioption = 'ssid';
			option.staOnly = true;
			option.scanAlerts = true;
			option.rmempty = false;
			option.retain = true;
			option.scanEncryptions = ['psk2', 'psk', 'sae', 'owe', 'none'];
			option.onchangeWithEncryption = function (ev, sectionId, value, encryption) {
				thisWizardView.onchangeOptionUpdateDiagram(this);
				this.section.getUIElement(sectionId, `uplink_encryption-${wifiDevice.staInterfaceName}`).setValue(encryption);
				this.section.getUIElement(sectionId, `uplink_key-${wifiDevice.staInterfaceName}`).setValue('');
			};

			// Non-HaLow wifi credentials are one of the few things we don't want to retain,
			// as users might be putting more sensitive creds here
			// (i.e. if you disable, this should disappear).
			option = page.option(form.ListValue, `uplink_encryption-${wifiDevice.staInterfaceName}`, _('Encryption'));
			option.uciconfig = 'wireless';
			option.ucisection = wifiDevice.staInterfaceName;
			option.ucioption = 'encryption';
			option.depends('network.wizard.uplink', `wifi-${wifiDevice.staInterfaceName}`);
			option.value('psk2', _('WPA2-PSK'));
			option.value('sae', _('WPA3-SAE'));
			option.value('psk', _('WPA-PSK'));
			option.value('owe', _('OWE'));
			option.value('none', _('None'));

			option = page.option(form.Value, `uplink_key-${wifiDevice.staInterfaceName}`, _('Passphrase'));
			// Have to be explicit here because we change uciconfig/section/option.
			option.depends(`wireless.wizard.uplink_encryption-${wifiDevice.staInterfaceName}`, 'psk');
			option.depends(`wireless.wizard.uplink_encryption-${wifiDevice.staInterfaceName}`, 'psk2');
			option.depends(`wireless.wizard.uplink_encryption-${wifiDevice.staInterfaceName}`, 'sae');
			option.uciconfig = 'wireless';
			option.ucisection = wifiDevice.staInterfaceName;
			option.ucioption = 'key';
			option.datatype = 'wpakey';
			option.password = true;
		}

		option = page.heading(_('Traffic Mode'));
		option.depends({ uplink: /ethernet/ });

		option = page.option(form.ListValue, 'device_mode_ap');
		option.displayname = _('Bridge/Router');
		option.depends({ uplink: /ethernet/ });
		option.rmempty = false;
		option.retain = true;
		option.widget = 'radio';
		option.orientation = 'vertical';
		option.value('bridge', _('Bridge'));
		option.value('router', _('Router'));
		if (this.getEthernetPorts().length > 1) {
			// Only offer the firewall option if you have multiple ethernet ports
			// (with a single ethernet port, you're much more likely to get
			// locked out of the admin interface).
			option.value('router_firewall', _('Router with Firewall'));
		}
		option.onchange = function (ev, sectionId, value) {
			if (value == 'bridge') {
				this.page.updateInfoText(bridgeInfoAp, thisWizardView);
			} else if (value == 'router') {
				this.page.updateInfoText(routerInfoAp, thisWizardView);
			} else if (value == 'router_firewall') {
				this.page.updateInfoText(routerFirewallInfoAp, thisWizardView);
			}
			thisWizardView.onchangeOptionUpdateDiagram(this);
		};

		/*****************************************************************************/

		for (const wifiDevice of wifiDevices) {
			page = this.page(wifiApInterfaceSections[wifiDevice.name],
				`${wifiDevice.getBandName()} Wi-Fi Access Point`,
				`This HaLow device is also capable of ${wifiDevice.getBandName()} Wi-Fi.
				If you enable a ${wifiDevice.getBandName()} Wi-Fi <b>Access Point</b>, you will be able to
				connect ${wifiDevice.getBandName()} Wi-Fi clients to this device.`);
			page.enableDiagram({
				extras: ['STA_WIFI_INT_SELECT', 'STA_WIFI_INT_SELECT_FILL', 'AP_WIFI_INT_SELECT', 'AP_WIFI_INT_SELECT_FILL'],
				blacklist: ['MESH_HALOW'],
			});

			option = page.option(morseui.Slider, 'disabled', `Enable ${wifiDevice.getBandName()} Access Point`);
			option.enabled = '0';
			option.disabled = '1';
			option.default = '0';
			option.onchange = function () {
				thisWizardView.onchangeOptionUpdateDiagram(this);
			};

			option = page.option(form.Value, 'ssid', _('<abbr title="Service Set Identifier">SSID</abbr>'));
			option.datatype = 'maxlength(32)';
			option.retain = true;
			option.rmempty = false;
			option.depends('disabled', '0');
			option.onchange = function () {
				thisWizardView.onchangeOptionUpdateDiagram(this);
			};

			option = page.option(form.Value, 'key', _('Passphrase'));
			option.datatype = 'wpakey';
			option.password = true;
			option.retain = true;
			option.rmempty = false;
			option.depends('disabled', '0');

			option = page.option(form.ListValue, 'encryption', _('Encryption'));
			option.value('psk2', _('WPA2-PSK'));
			option.value('sae-mixed', _('WPA2-PSK/WPA3-SAE Mixed Mode'));
			option.value('sae', _('WPA3-SAE'));
			option.depends('disabled', '0');
		}

		/*****************************************************************************/

		// We don't actually modify morseInterfaceSection here, but it makes it easier
		// to get to our most common dependencies.
		page = this.page(morseInterfaceSection,
			_('Almost there...'),
			_('Click <b>Apply</b> to persist your configuration.'));
		// This last page should always be active, as otherwise when initial config is happening
		// none of the options are visible and it's treated as inactive.
		page.isActive = () => true;
		page.enableDiagram();

		option = page.html(() => this.renderIPChangeAlert());

		// Client steps
		//
		const html = [
			_(`Connect this device to your HaLow access point by scanning the QR code
				in the mobile application, then clicking `),
			E('strong', 'Apply.'),
			E('br'),
			E('img', { src: DPP_QRCODE_PATH }),
		];
		option = page.step(html);
		option.depends('dpp', '1');

		option = page.step(_(`
			Connect another device via <b>Ethernet</b> to use your new HaLow link.
		`));
		option.depends('mode', 'sta');

		for (const wifiDevice of wifiDevices) {
			option = page.step(`
				Connect another device via <b>${wifiDevice.getBandName()} Wi-Fi</b> to use your new HaLow link.
			`);
			option.depends({ mode: 'sta', [`wireless.${wifiDevice.apInterfaceName}.disabled`]: '0' });
		}

		// AP steps
		//
		option = page.step(_(`
			Connect this device to your existing network via an Ethernet cable.
		`));
		option.depends('network.wizard.uplink', /ethernet/);

		option = page.step(_(`
			Connect other HaLow-enabled devices to use your new HaLow network.
		`));
		option.depends('mode', 'ap');

		for (const wifiDevice of wifiDevices) {
			option = page.step(`
				Connect ${wifiDevice.getBandName()} devices to your network.
			`);
			option.depends({ mode: 'ap', [`wireless.${wifiDevice.apInterfaceName}.disabled`]: '0' });
		}

		option = page.step(_(`
			Connect Ethernet devices to your network.
		`));
		option.depends('network.wizard.uplink', /wifi/);
		option.depends('network.wizard.uplink', 'none');

		/*****************************************************************************/

		page = this.page(morseDeviceSection, '');

		// This last page should always be active, as otherwise when initial config is happening
		// none of the options are visible and it's treated as inactive.
		page.isActive = () => true;

		page.html(() => E('span', { class: 'completion' }, [
			this.renderIPChangeAlert(),
			E('h1', _('Wizard Complete')),
			E('p', _('Click below to exit the wizard')),
		]));

		return map.render();
	},
});
