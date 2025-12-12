'use strict';
/* globals form morseuci morseui network uci widgets wizard */
'require form';
'require network';
'require uci';
'require tools.widgets as widgets';
'require tools.morse.wizard as wizard';
'require tools.morse.morseui as morseui';
'require tools.morse.uci as morseuci';

return wizard.AbstractWizardView.extend({
	__init__(/* ... */) {
		this.randomMac = morseuci.getRandomMAC();

		return this.super('__init__', this.varargs(arguments, 1,
			_('EasyMesh Wizard'),
			_(`<p>This wizard will guide you in setting up this device as part of EasyMesh.
				<p>You can exit now if you prefer to complete your configuration manually.</p>`),
			'morse-config-diagram',
			new form.Map('wireless')));
	},

	getExtraConfigFiles() {
		return ['prplmesh'];
	},

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

		// If we weren't a mesh controller, force choice again.
		const getUplink = () => {
			if (uci.get('prplmesh', 'config', 'enable') !== '1' || uci.get('prplmesh', 'config', 'master') !== '1') {
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
				return undefined;
			}
		};

		// If we weren't a mesh agent, force choice again.
		const getDeviceModeMeshAgent = () => {
			if (uci.get('prplmesh', 'config', 'enable') !== '1' || uci.get('prplmesh', 'config', 'master') !== '0') {
				return undefined;
			} else if (ethStaticNetwork === 'lan') {
				return forwardsLanToAhwlan ? 'extender' : 'none';
			} else {
				return 'bridge';
			}
		};

		uci.add('network', 'wizard', 'wizard');
		uci.set('network', 'wizard', 'device_mode_meshagent', getDeviceModeMeshAgent());
		uci.set('network', 'wizard', 'uplink', getUplink());
	},

	parseWizardOptions() {
		// Clear out any network stuff we've created from alternative sets of options
		// so we don't have to consider as many alternative cases.
		wizard.resetUciNetworkTopology();

		const {
			wifiDevices,
			morseDeviceName,
			morseInterfaceName,
			morseBackhaulStaName,
			lanIp,
			wlanIp,
		} = wizard.readSectionInfo();

		const setEasyMeshConfig = (isController) => {
			if (isController) {
				uci.set('prplmesh', 'config', 'gateway', '1');
				uci.set('prplmesh', 'config', 'management_mode', 'Multi-AP-Controller-and-Agent');
				uci.set('prplmesh', 'config', 'operating_mode', 'Gateway');
				uci.set('prplmesh', 'config', 'wired_backhaul', '1');
				uci.set('wireless', morseBackhaulStaName, 'disabled', '1');
			} else {
				uci.set('prplmesh', 'config', 'gateway', '0');
				uci.set('prplmesh', 'config', 'management_mode', 'Multi-AP-Agent');
				uci.set('prplmesh', 'config', 'operating_mode', 'WDS-Repeater');
				uci.set('prplmesh', 'config', 'wired_backhaul', '0');
				uci.set('wireless', morseBackhaulStaName, 'disabled', '0');
			}

			uci.set('prplmesh', morseDeviceName, 'hostap_iface', 'wlan-prpl');
			uci.set('prplmesh', morseDeviceName, 'sta_iface', 'wlan-prpl-1');
		};

		const setMultiapWirelessConfig = () => {
			// EasyMesh specifies that Fronthaul BSS must be configured
			// as PSK+SAE (WPA3 transition mode).
			uci.set('wireless', morseInterfaceName, 'encryption', 'sae-mixed');
			uci.set('wireless', morseInterfaceName, 'mode', 'ap');
			uci.set('wireless', morseInterfaceName, 'wds', '1');
			uci.set('wireless', morseInterfaceName, 'bss_transition', '1');
			uci.set('wireless', morseInterfaceName, 'multi_ap', '3');
			uci.set('wireless', morseInterfaceName, 'ieee80211k', '1');

			uci.set('wireless', morseInterfaceName, 'ieee80211w', '2');
			uci.set('wireless', morseInterfaceName, 'disabled', '0');
			uci.set('wireless', morseInterfaceName, 'ifname', 'wlan-prpl');

			uci.set('wireless', morseBackhaulStaName, 'mode', 'sta');
			uci.set('wireless', morseBackhaulStaName, 'multi_ap', '1');
			uci.set('wireless', morseBackhaulStaName, 'wds', '1');
			uci.set('wireless', morseBackhaulStaName, 'ifname', 'wlan-prpl-1');
		};

		const setWpsConfig = () => {
			uci.set('wireless', morseInterfaceName, 'wps_virtual_push_button', '1');
			uci.set('wireless', morseInterfaceName, 'wps_independent', '0');
			uci.set('wireless', morseInterfaceName, 'auth_cache', '0');
		};

		wizard.setupNetworkIface('lan', { local: true });
		wizard.setupNetworkIface('ahwlan', { local: true, primaryLocal: true });
		// Force wan even if not using to make sure that wan firewall rules are retained
		// (resetUciNetworkTopology removes).
		wizard.setupNetworkIface('wan');

		// Get bridge MAC for prplmesh.
		// Find if the morseInterface has a valid MAC and use it with Morse OUI
		// This would provide a relatable representation of the fronthaul and backhaul
		// interfaces in the topology viewer. If there is no MAC address available, use a
		// random MAC suffix with the Morse OUI.
		let bridgeMAC = morseuci.getFakeMorseMAC(this.netDevices) ?? morseuci.getRandomMAC();

		morseuci.forceBridge('ahwlan', 'br-prpl', bridgeMAC);

		let isController = uci.get('prplmesh', 'config', 'master') === '1';

		// Extract values then remove from dummy uci section.
		const device_mode_meshagent = uci.get('network', 'wizard', 'device_mode_meshagent');
		const uplink = uci.get('network', 'wizard', 'uplink');

		const wifiApsEnabled = {};
		for (const wifiDevice of wifiDevices) {
			// Record whether each device has an enabled AP
			wifiApsEnabled[wifiDevice.name] = uci.get('wireless', wifiDevice.apInterfaceName, 'disabled') !== '1';

			// We don't have an explicit option for this, but it's determined by uplink.
			// And because uplink is a complex option that's not valid for clients and is resolved here...
			uci.set('wireless', wifiDevice.staInterfaceName, 'disabled', uplink === `wifi-${wifiDevice.staInterfaceName}` ? '0' : '1');
		}

		const bridgeMode = () => {
			uci.set('wireless', morseInterfaceName, 'network', 'ahwlan');
			uci.set('wireless', morseBackhaulStaName, 'network', 'ahwlan');

			for (const wifiDevice of wifiDevices) {
				if (wifiApsEnabled[wifiDevice.name]) {
					uci.set('wireless', wifiDevice.apInterfaceName, 'network', 'ahwlan');
				}
			}

			morseuci.setNetworkDevices('ahwlan', this.getEthernetPorts().map(p => p.device));

			return 'ahwlan';
		};

		const nonBridgeMode = () => {
			// We exclude non-builtins to avoid accidentally bridging an LTE USB dongle running
			// its own DHCP server (which will end up confusing the user a lot).
			morseuci.setNetworkDevices('lan', this.getEthernetPorts().filter(p => p.builtin).map(p => p.device));

			uci.set('wireless', morseInterfaceName, 'network', 'ahwlan');
			uci.set('wireless', morseBackhaulStaName, 'network', 'ahwlan');

			for (const wifiDevice of wifiDevices) {
				if (wifiApsEnabled[wifiDevice.name]) {
					uci.set('wireless', wifiDevice.apInterfaceName, 'network', 'lan');
				}
			}

			morseuci.createOrRemoveBridgeAsNeeded('lan');

			return { ethIface: 'lan', halowIface: 'ahwlan' };
		};

		// Set all prplmesh configurations
		setEasyMeshConfig(isController);
		// Set all Multi-ap wireless configuration
		setMultiapWirelessConfig();
		// Set all WPS related configuration
		setWpsConfig();

		// Set 'bridge/ip/gateway' etc. via uci,
		// based on the selected uplink and traffic mode
		if (isController) {
			if (uplink?.match(/ethernet/)) {
				const upstreamNetwork = this.getEthernetPorts().length > 1 ? 'wan' : 'lan';
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

				uci.set('network', upstreamNetwork, 'proto', 'dhcp');
				morseuci.setupNetworkWithDnsmasq('ahwlan', wlanIp);
			} else if (uplink === 'none') {
				const { ethIface, halowIface } = nonBridgeMode();

				// This is a weird overload of the var name
				morseuci.setupNetworkWithDnsmasq(ethIface, lanIp, false);
				morseuci.setupNetworkWithDnsmasq(halowIface, wlanIp, false);
			} else if (uplink?.match(/wifi/)) {
				const iface = bridgeMode();

				wizard.setupNetworkIface('lan', { local: true });
				uci.set('network', 'lan', 'proto', 'dhcp');
				const [_, uplinkWifiStaInterfaceName] = uplink.split('-');
				uci.set('wireless', uplinkWifiStaInterfaceName, 'network', 'lan');
				morseuci.setupNetworkWithDnsmasq(iface, wlanIp);
				morseuci.getOrCreateForwarding(iface, 'lan', 'mmrouter');
			}
		} else {
			if (device_mode_meshagent === 'extender') { // i.e. router
				const { ethIface, halowIface } = nonBridgeMode();

				uci.set('network', halowIface, 'proto', 'dhcp');
				morseuci.setupNetworkWithDnsmasq(ethIface, lanIp);
				morseuci.getOrCreateForwarding(ethIface, halowIface, 'mmextender');
			} else if (device_mode_meshagent === 'none') {
				const { ethIface, halowIface } = nonBridgeMode();

				uci.set('network', halowIface, 'proto', 'dhcp');
				morseuci.setupNetworkWithDnsmasq(ethIface, lanIp, false);
			} else if (device_mode_meshagent === 'bridge') {
				const iface = bridgeMode();

				uci.set('network', iface, 'proto', 'dhcp');
			}
		}
	},

	async loadPages() {
		// resetUci disables all wifi-ifaces, but we want to remember the state of this one.
		const {
			wifiDevices,
		} = wizard.readSectionInfo();
		const wifiApsEnabled = wifiDevices.reduce((acc, wifiDevice) => ({
			...acc,
			[wifiDevice.name]: uci.get('wireless', wifiDevice.apInterfaceName, 'disabled') !== '1',
		}), {});
		return await Promise.all([
			network.getDevices(),
			wifiApsEnabled,
		]);
	},

	renderPages([devices, wifiApsEnabled]) {
		let page, option;

		this.netDevices = devices;

		const map = this.map;
		const {
			wifiDevices,
			morseDeviceName,
			morseInterfaceName,
			morseBackhaulStaName,
		} = wizard.readSectionInfo();

		for (const wifiDevice of wifiDevices) {
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

		// Create a Backhaul STA config section for EasyMesh Agent configuration
		if (!uci.get('wireless', morseBackhaulStaName)) {
			uci.add('wireless', 'wifi-iface', morseBackhaulStaName);
		}
		uci.set('wireless', morseBackhaulStaName, 'device', morseDeviceName);

		if (uci.get('prplmesh', 'config', 'enable') !== '1') {
			// Force user to select prplmesh mode again if we're moving from a non prplmesh mode.
			uci.unset('prplmesh', 'config', 'master');
			uci.set('prplmesh', 'config', 'enable', '1');
		}

		if (!uci.get('prplmesh', morseDeviceName)) {
			uci.add('prplmesh', 'wifi-device', morseDeviceName);
		}

		const morseDeviceSection = map.section(form.NamedSection, morseDeviceName, 'wifi-device');
		const morseApInterfaceSection = map.section(form.NamedSection, morseInterfaceName, 'wifi-interface');
		const wifiApInterfaceSections = {};
		for (const wifiDevice of wifiDevices) {
			wifiApInterfaceSections[wifiDevice.name] = map.section(form.NamedSection, wifiDevice.apInterfaceName, 'wifi-interface');
		}
		const prplmeshConfigSection = map.section(form.NamedSection, 'config', 'prplmesh');
		prplmeshConfigSection.uciconfig = 'prplmesh';
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

		page = this.page(prplmeshConfigSection,
			'', _(`You can configure your device as an <b>EasyMesh Controller</b> or as an <b>EasyMesh Agent</b>`));

		const controllerModeText = _(`An <b>EasyMesh Controller</b> is a Multi-AP device that is the primarily responsible for managing the EasyMesh topology. It is capable of steering weak clients to maintain a healthy network. `);
		const agentModeText = _(`An <b>EasyMesh Agent</b> is a logical entity that executes the commands received from the Multi-AP Controller, and reports measurements and capabilities data for fronthaul APs, clients and backhaul links to a Multi-AP Controller and/or to other Multi-AP Agents.`);

		page.enableDiagram({
			extras: ['AP_SELECT_FILL', 'STA_SELECT_FILL'],
			blacklist: ['AP_HALOW_INT',
				'AP_MGMT_ETH', 'AP_UPLINK', 'AP_UPLINK_ETH', 'AP_UPLINK_WIFI', 'AP_WIFI',
				'STA_HALOW', 'STA_WIFI', 'STA_MGMT_ETH'],
		});

		option = page.option(form.ListValue, 'master');
		option.displayname = _('EasyMesh Device Mode');
		option.widget = 'radio';
		option.orientation = 'vertical';
		option.value('1', _('EasyMesh Controller'));
		option.value('0', _('EasyMesh Agent'));
		option.rmempty = false;
		option.onchange = function (ev, sectionId, value) {
			if (value == '1') {
				this.page.updateInfoText(controllerModeText, thisWizardView);
			} else if (value == '0') {
				this.page.updateInfoText(agentModeText, thisWizardView);
			}
			thisWizardView.onchangeOptionUpdateDiagram(this);
		};

		/*****************************************************************************/

		page = this.page(morseApInterfaceSection,
			_('Setup EasyMesh Network'),
			_(`All devices in the EasyMesh network will share the same <b>SSID</b> and
				 MUST operate on the same <b>Operating Frequency</b>.<br> On an EasyMesh Agent,
				 the SSID is auto-configured by the Controller after successful pairing.`));

		page.enableDiagram({
			extras: ['AP_HALOW_INT_SELECT', 'AP_HALOW_INT_SELECT_FILL'],
			blacklist: ['AP_MGMT_ETH', 'AP_UPLINK', 'AP_UPLINK_ETH', 'AP_UPLINK_WIFI', 'AP_WIFI',
			            'STA_HALOW_INT', 'AP_HALOW_INT:IP', 'AP_HALOW_INT:IPMethod'],
		});

		option = page.option(form.Value, 'ssid', _('<abbr title="Service Set Identifier">SSID</abbr>'));
		option.depends(`prplmesh.config.master`, '1');
		option.datatype = 'maxlength(32)';
		option.rmempty = false;
		option.retain = true;
		option.onchange = function () {
			thisWizardView.onchangeOptionUpdateDiagram(this);
		};
		// Make sure we only load the SSID if we were already an AP; otherwise (or if unset) use default instead.
		option.load = sectionId =>
			(uci.get('wireless', sectionId, 'mode') === 'ap' && uci.get('wireless', sectionId, 'ssid'))
			|| morseuci.getDefaultSSID();
		option.forcewrite = true; // Required since our load doesn't reflect uci.

		option = page.option(form.Value, 'key', _('Passphrase'));
		option.depends(`prplmesh.config.master`, '1');
		option.datatype = 'wpakey';
		option.password = true;
		option.rmempty = false;
		option.retain = true;
		// Make sure we only load the key if we were already an AP; otherwise (or if unset) use default instead.
		option.load = sectionId =>
			(uci.get('wireless', sectionId, 'mode') === 'ap' && uci.get('wireless', sectionId, 'key'))
			|| morseuci.getDefaultWifiKey();
		option.forcewrite = true; // Required since our load doesn't reflect uci.

		option = page.option(widgets.WifiFrequencyValue, '_freq', '<br />' + _('Operating Frequency'));
		option.ucisection = morseDeviceName;
		option.rmempty = false;
		option.retain = true;

		/*****************************************************************************/
		// Device mode for EasyMesh Agent only.
		page = this.page(networkSection,
			_('Traffic Mode'),
			_(`We recommend configuring this device as an <b>Extender</b> to create a 
				separate network for the non-HaLow devices.	This device will run a 
				DHCP server on the non-HaLow interfaces, and it will use NAT to forward 
				IP traffic between HaLow and non-HaLow networks.

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
			blacklist: ['STA_WIFI'],
		});

		option = page.option(form.ListValue, 'device_mode_meshagent');
		option.displayname = _('Traffic mode');
		option.depends(`prplmesh.config.master`, '0');
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

		var ethInfoAp = _(`If you use an <b>Ethernet</b> upstream, the HaLow connected devices obtain IP addresses from
		the DHCP server on this device, and this device uses NAT to forward IP traffic.`);
		var wifiInfoAp = _(`If you use a <b>Wi-Fi</b> upstream, fill in the Wi-Fi AP credentials.
			The HaLow connected devices obtain IP addresses from the DHCP server on this device,
			and this device uses NAT to forward IP traffic.`);
		var noneInfoAp = _(`In <b>None</b> mode, your device will have a static IP address and run a
			DHCP server on all interfaces, the HaLow and non-HaLow networks will be isolated from each other.`);

		page = this.page(networkSection,
			_('Upstream Network'),
			_(`You are using this HaLow device as an EasyMesh Controller, you should configure how it
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
			blacklist: ['STA_WIFI', 'STA_MGMT_ETH', 'AP_WIFI'],
		});

		option = page.option(form.ListValue, 'uplink');
		option.displayname = _('Upstream network');
		option.depends(`prplmesh.config.master`, '1');
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

		/*****************************************************************************/

		for (const wifiDevice of wifiDevices) {
			page = this.page(wifiApInterfaceSections[wifiDevice.name],
				`${wifiDevice.getBandName()} Wi-Fi Access Point`,
				`This HaLow device is also capable of ${wifiDevice.getBandName()} Wi-Fi.
				If you enable a ${wifiDevice.getBandName()} Wi-Fi <b>Access Point</b>, you will be able to
				connect ${wifiDevice.getBandName()} Wi-Fi clients to this device.`);
			page.enableDiagram({
				extras: ['STA_WIFI_INT_SELECT', 'STA_WIFI_INT_SELECT_FILL', 'AP_WIFI_INT_SELECT', 'AP_WIFI_INT_SELECT_FILL'],
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
		page = this.page(morseApInterfaceSection,
			_('Almost there...'),
			_(`Click <b>Apply</b> to persist your configuration.`));
		// This last page should always be active, as otherwise when initial config is happening
		// none of the options are visible and it's treated as inactive.
		page.isActive = () => true;
		page.enableDiagram();

		option = page.html(() => this.renderIPChangeAlert());

		for (const wifiDevice of wifiDevices) {
			option = page.step(_(`
				Connect another device via <b>${wifiDevice.getBandName()} Wi-Fi</b> to use your new HaLow link.
			`));
			option.depends({ mode: 'sta', [`wireless.${wifiDevice.apInterfaceName}.disabled`]: '0' });
		}

		option = page.step(_(`
			Connect your device to an EasyMesh Controller by pressing wps_client from the Status page
		`));
		option.depends('prplmesh.config.master', '0');

		option = page.step(_(`
			Connect your device to EasyMesh Agents by pressing wps button from the Status page
		`));
		option.depends('prplmesh.config.master', '1');

		option = page.step(_(`You can view the EasyMesh topology from the Status page`));

		// AP steps
		//
		option = page.step(_(`
			Connect this device to your existing network via an Ethernet cable.
		`));
		option.depends('network.wizard.uplink', /^ethernet/);

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
