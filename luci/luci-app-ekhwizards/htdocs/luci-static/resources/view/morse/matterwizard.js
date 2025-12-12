/* globals form morseuci uci wizard */
'require form';
'require uci';
'require tools.morse.wizard as wizard';
'require tools.morse.uci as morseuci';

document.querySelector('head').appendChild(E('link', {
	rel: 'stylesheet',
	type: 'text/css',
	href: L.resourceCacheBusted('view/morse/css/wizard.css'),
}));

const LIGHTING_APP_DESC = _(`On/Off Lighing Application. This is a Matter controlled light. 
	The controller will be able to contol the light after provissioning`);
const OTA_APP_DESC = _(`Over-The-Air Matter Software Update Provider Application. 
	This is used to update the Matter application image`);

// Save various device types as a constent value.
// The format is key:[<GUI display name>, <UCI config name>, <Info Text>]
const VAILD_MATTER_DEV_TYPE = {
	Lighting: { display_name: _('On/Off Lighting Application'), dev_type: 'matter_light', dev_desc: LIGHTING_APP_DESC },
	OTA_P: { display_name: _('Over-The-Air Matter Software Update Provider'), dev_type: 'matter_ota_p', dev_desc: OTA_APP_DESC },
};

return wizard.AbstractWizardView.extend({
	__init__(/* ... */) {
		return this.super('__init__', this.varargs(arguments, 1,
			_('Matter Wizard'),
			_(`<p>This wizard will guide you in setting up this device as part of a Matter application.
				<p>You can exit now if you prefer to complete your configuration manually.</p>`),
			'morse-config-diagram',
			new form.Map('wireless')));
	},

	getExtraConfigFiles() {
		return ['matter'];
	},

	async loadPages() {
		return await Promise.all([
			uci.load('matter'),
		]);
	},

	loadWizardOptions() {
		const ahwlanZone = morseuci.getZoneForNetwork('ahwlan');
		const lanZone = morseuci.getZoneForNetwork('lan');
		const forwardsLanToAhwlan = uci.sections('firewall', 'forwarding').some(f => f.src === lanZone && f.dest === ahwlanZone && f.enabled !== '0');

		const {
			ethStaticNetwork,
		} = wizard.readEthernetPortInfo(this.getEthernetPorts());

		// If we weren't a mesh point, force choice again.
		const getDeviceTypeMatter = () => {
			if (uci.get('matter', 'config', 'device_type') === 'none') {
				return undefined;
			} else if (uci.get('matter', 'config', 'device_type') === VAILD_MATTER_DEV_TYPE.Lighting.display_name) {
				return VAILD_MATTER_DEV_TYPE.Lighting.dev_type;
			} else if (uci.get('matter', 'config', 'device_type') === VAILD_MATTER_DEV_TYPE.OTA_P.display_name) {
				return VAILD_MATTER_DEV_TYPE.OTA_P.dev_type;
			} else {
				return undefined;
			}
		};

		const getDeviceModeMatter = () => {
			if (ethStaticNetwork) {
				return forwardsLanToAhwlan ? 'extender' : 'none';
			} else {
				return 'bridge';
			}
		};

		uci.add('network', 'wizard', 'wizard');
		uci.set('network', 'wizard', 'device_type', getDeviceTypeMatter());
		uci.set('network', 'wizard', 'device_mode_matter', getDeviceModeMatter());
	},

	parseWizardOptions() {
		// Clear out any network stuff we've created from alternative sets of options
		// so we don't have to consider as many alternative cases.
		wizard.resetUciNetworkTopology();

		const {
			morseInterfaceName,
			lanIp,
		} = wizard.readSectionInfo();
		wizard.setupNetworkIface('lan', { local: true });
		wizard.setupNetworkIface('ahwlan', { local: true, primaryLocal: true });

		let device_mode_matter = uci.get('network', 'wizard', 'device_mode_matter');

		const bridgeMode = () => {
			morseuci.setNetworkDevices('ahwlan', this.getEthernetPorts().map(p => p.device));
			uci.set('wireless', morseInterfaceName, 'network', 'ahwlan');

			morseuci.createOrRemoveBridgeAsNeeded('ahwlan');

			return 'ahwlan';
		};

		const nonBridgeMode = () => {
			morseuci.setNetworkDevices('lan', this.getEthernetPorts().map(p => p.device));
			uci.set('wireless', morseInterfaceName, 'network', 'ahwlan');

			morseuci.createOrRemoveBridgeAsNeeded('lan');
			morseuci.createOrRemoveBridgeAsNeeded('ahwlan');

			return { ethIface: 'lan', halowIface: 'ahwlan' };
		};

		if (device_mode_matter === 'extender') { // i.e. router
			const { ethIface, halowIface } = nonBridgeMode();

			uci.unset('wireless', morseInterfaceName, 'wds');
			uci.set('network', halowIface, 'proto', 'dhcp');
			morseuci.setupNetworkWithDnsmasq(ethIface, lanIp);
			morseuci.getOrCreateForwarding(ethIface, halowIface, 'mmextender');
		} else if (device_mode_matter === 'none') {
			const { ethIface, halowIface } = nonBridgeMode();

			uci.unset('wireless', morseInterfaceName, 'wds');
			uci.set('network', halowIface, 'proto', 'dhcp');
			morseuci.setupNetworkWithDnsmasq(ethIface, lanIp, false);
		} else if (device_mode_matter === 'bridge') {
			const iface = bridgeMode();

			uci.set('wireless', morseInterfaceName, 'wds', '1');
			uci.set('network', iface, 'proto', 'dhcp');
		}
	},

	renderPages() {
		let page, option;

		const map = this.map;
		const {
			wifiDevices,
			morseDeviceName,
			morseInterfaceName,
		} = wizard.readSectionInfo();

		uci.unset('wireless', morseInterfaceName, 'disabled');
		uci.set('wireless', morseInterfaceName, 'mode', 'sta');
		uci.set('matter', 'config', 'enable', '1');
		if (!uci.get('matter', morseDeviceName)) {
			uci.add('matter', 'wifi-device', morseDeviceName);
		}

		for (const wifiDevice of wifiDevices) {
			uci.set('wireless', wifiDevice.apInterfaceName, 'device', wifiDevice.name);
			uci.set('wireless', wifiDevice.apInterfaceName, 'mode', 'ap');

			if (!uci.get('wireless', wifiDevice.staInterfaceName)) {
				uci.add('wireless', 'wifi-iface', wifiDevice.staInterfaceName);
			}
			uci.set('wireless', wifiDevice.staInterfaceName, 'device', wifiDevice.name);
			uci.set('wireless', wifiDevice.staInterfaceName, 'mode', 'sta');
		}

		const morseDeviceSection = map.section(form.NamedSection, morseDeviceName, 'wifi-device');
		const matterConfigSection = map.section(form.NamedSection, 'config', 'matter');
		matterConfigSection.uciconfig = 'matter';
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

		page = this.page(matterConfigSection,
			_(`Matter Application`), _(`You can configure your device as a Matter application`));
		page.enableDiagram();
		option = page.option(form.ListValue, 'device_type');
		option.displayname = _('Matter Application');
		option.widget = 'radio';
		option.orientation = 'vertical';
		for (var dev_type in VAILD_MATTER_DEV_TYPE) {
			option.value(VAILD_MATTER_DEV_TYPE[dev_type].dev_type, _(VAILD_MATTER_DEV_TYPE[dev_type].display_name));
		}
		option.onchange = function (ev, sectionId, value) {
			for (var dev_type in VAILD_MATTER_DEV_TYPE) {
				if (VAILD_MATTER_DEV_TYPE[dev_type].dev_type == value) {
					this.page.updateInfoText(VAILD_MATTER_DEV_TYPE[dev_type].dev_desc, thisWizardView);
					break;
				}
			}
			thisWizardView.onchangeOptionUpdateDiagram(this);
		};

		/*****************************************************************************/

		page = this.page(matterConfigSection,
			_('Matter Configurations'), _(`You can configure your device as a Matter application`));

		const application_discriminator = _(`Lighting application discriminator value. 
			This is an interger value unique to this device. 
			The value is used to the identify the device that need to be commissioned by the controller`);
		const ota_discriminator = _(`OTA Application discriminator value. 
			This is an interger value unique to this device. 
			The value is used to the identify the device that need to be commissioned by the controller`);
		const ble_protocol = _(`BLE protocol to use`);
		const ble_uart_port = _(`BLE UART port to use`);

		// TODO: Hardcoded to show On/Off Lighting Application Discriminator. In future change this based on the device_type selected above
		option = page.option(form.Value, 'application_discriminator', _(VAILD_MATTER_DEV_TYPE.Lighting.display_name + ' Discriminator'));
		option.depends('device_type', VAILD_MATTER_DEV_TYPE.Lighting.dev_type);
		option.displayname = _('Matter Configurations');
		option.datatype = 'integer';
		option.placeholder = 'Default (3840)';
		option.rmempty = true;
		option.retain = true;
		option.onchange = function () {
			this.page.updateInfoText(application_discriminator, thisWizardView);
		};

		option = page.option(form.Value, 'ota_discriminator', _('OTA Discriminator'));
		option.depends('device_type', VAILD_MATTER_DEV_TYPE.OTA_P.dev_type);
		option.datatype = 'integer';
		option.placeholder = 'Default (22)';
		option.rmempty = true;
		option.retain = true;
		option.onchange = function () {
			this.page.updateInfoText(ota_discriminator, thisWizardView);
		};

		option = page.option(form.ListValue, 'ble_proto', _('BLE Protocol'));
		option.widget = 'radio';
		option.orientation = 'vertical';
		option.value('bcm', _('bcm'));
		option.value('h4', _('4 wire'));
		option.value('3wire', _('3 wire'));
		option.rmempty = true;
		option.retain = true;
		option.onchange = function () {
			this.page.updateInfoText(ble_protocol, thisWizardView);
		};

		option = page.option(form.Value, 'ble_uart_port', _('BLE UART Port'));
		option.placeholder = 'Default (/dev/ttyS0)';
		option.datatype = 'file';
		option.rmempty = true;
		option.retain = true;
		option.onchange = function () {
			this.page.updateInfoText(ble_uart_port, thisWizardView);
		};

		/*****************************************************************************/

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

		option = page.option(form.ListValue, 'device_mode_matter');
		option.displayname = _('Traffic mode');
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

		page = this.page(morseDeviceSection, '');

		// This last page should always be active, as otherwise when initial config is happening
		// none of the options are visible and it's treated as inactive.
		page.isActive = () => true;
		const completion
			= E('span', { class: 'completion' }, [
				E('h1', _('Wizard Complete')),
				E('p', _('Click below to exit the wizard')),
			]);

		option = page.html(completion);

		return map.render();
	},
});
