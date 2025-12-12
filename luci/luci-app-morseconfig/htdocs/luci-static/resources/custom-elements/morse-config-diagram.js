/* globals baseclass request */
'require baseclass';
'require request';

function getBandName(band) {
	const bandNames = {
		's1g': '802.11ah HaLow',
		'2g': '2.4 GHz',
		'5g': '5 GHz',
		'6g': '6 GHz',
		'60g': '60 GHz',
	};
	return bandNames[band] || 'Unknown Band';
}

const DEVICE = {
	STA: Symbol('STA'),
	AP: Symbol('AP'),
	POINT: Symbol('POINT'),
	GATE: Symbol('GATE'),
};

const TEMPLATE_STANDARD = 'morse-config-diagram';
const TEMPLATE_MESH11S = 'morse-config-diagram-mesh11s';
const TEMPLATE_MATTER = 'morse-config-diagram-matter';
const TEMPLATES = [TEMPLATE_STANDARD, TEMPLATE_MESH11S, TEMPLATE_MATTER];

function defaultObject() {
	return new Proxy(Object.create(null), {
		get(o, k) {
			if (o[k] === undefined) {
				o[k] = {};
			}
			return o[k];
		},
	});
}

// Convert a slotData dictionary into lines of HTML.
function slotDataToHtml(slotData) {
	if (typeof slotData === 'string') {
		return slotData;
	}

	// Otherwise, it's some kind of weird multi-line interface config obj.
	const lines = [];
	if (slotData['IP']) {
		lines.push(`<b>${slotData['IP']}</b>`);
	}

	if (slotData['IPMethod']) {
		lines.push(slotData['IPMethod']);
	}

	if (slotData['SSID']) {
		lines.push(`<b>${_('SSID')}</b>: ${slotData['SSID']}`);
	}

	if (slotData['MeshId']) {
		lines.push(`<b>${_('Mesh ID')}</b>: ${slotData['MeshId']}`);
	}

	return lines.join('<br>');
}

// Convert a slotData dictionary into text for a title attribute
// (so we can have all the slot data in a tooltip).
function slotDataToText(slotData) {
	if (typeof slotData === 'string') {
		const temp = document.createElement('div');
		temp.innerHTML = slotData;
		return temp.innerText;
	}

	// If it's not a string, it's some kind of weird multi-line interface config obj.
	const lines = [];
	if (slotData['IP']) {
		lines.push(`${slotData['IP']}`);
	}

	if (slotData['IPMethod']) {
		lines.push(slotData['IPMethod']);
	}

	if (slotData['SSID']) {
		lines.push(_('SSID: %s').format(slotData['SSID']));
	}

	if (slotData['MeshId']) {
		lines.push(_('Mesh Id: %s').format(slotData['MeshId']));
	}

	return lines.join('\n');
}

function getFirstIpaddr(ipaddr) {
	if (Array.isArray(ipaddr)) {
		ipaddr = ipaddr[0];
	}

	return ipaddr?.split('/')[0];
}

/* Represent the device configuration with some indication of general topology.
 *
 * We use an SVG file as a template which has named slots for various textual bits
 * (e.g. AP_HALOW_INT, AP_MGMT_ETH_INT, ...). Currently these are all inside
 * foreignObject elements that will accept arbitrary HTML, so it's possible to do
 * bold/italics etc.
 *
 * We use attributes for visibility of the various components
 * (e.g. show-AP_HALOW, show-AP_MGMT_ETH, if missing not shown), which
 * map to the underlying SVG by forcing groups to display.
 * i.e. show-AP_HALOW => getElementById('AP_HALOW').style.display = 'block'
 *
 * Example:
 *
 * <morse-config-diagram show-AP_SELECT show-AP_HALOW show-AP_MGMT_ETH show-AP_MGMT_ETH_INT_SELECT>
 *   <b slot="DEVICE_AP">EKH03</b>
 *   <span slot="AP_MGMT_ETH_INT"><b>eth0</b> - DHCP Server<br /><b>10.42.0.1</b></span>
 *   <span slot="AP_HALOW_INT"><b>wlan0</b> - DHCP Server<br /><b>192.168.1.1</b></span>
 *   <span slot="AP_DESC">HaLow<br />Access Point</span>
 *   <span slot="STA_DESC">HaLow Client</span>
 * </morse-config-diagram>
 */
class MorseConfigDiagram extends HTMLElement {
	constructor() {
		super();
		this.attachShadow({ mode: 'open' });
		this.currentTemplate = null;
		if (!this.constructor.templates) {
			throw Error('Bad code - need to set template');
		}
	}

	applyAttribute(attributeName) {
		const [action, id] = attributeName.split('-');
		if (!id) {
			return;
		}
		const element = this.shadowRoot.getElementById(id.toUpperCase());
		if (!element) {
			console.error('Attribute refers to id not in diagram:', id);
			return;
		}

		// At the moment, 'show' is the only supported action.
		if (action === 'show') {
			this.setDisplay(element, this.getAttribute(attributeName));
		} else {
			console.error('Attribute action not understood:', action);
		}
	}

	connectedCallback() {
		this.observer = new MutationObserver((mutations) => {
			for (const mutation of mutations) {
				this.applyAttribute(mutation.attributeName);
			}
		});

		this.observer.observe(this, { attributes: true });

		// By default things are hidden, so we apply the current attributes
		// to unhide.
		for (const attribute of this.attributes) {
			this.applyAttribute(attribute.name);
		}
	}

	disconnectedCallback() {
		this.observer.disconnect();
	}

	setDisplay(element, val) {
		element.style.display = val === null ? 'none' : 'block';
	}

	// Usually, our templates would live in a separate HTML file.
	// However, in LuCI, the expectation is that everything is generated
	// via the JS, so we instead 'initialise' this thing later
	// (see loadTemplate below).
	static setTemplates(templates) {
		this.templates = templates;
	}

	show(attr) {
		this.setAttribute(`show-${attr}`, '');
	}

	hide(attr) {
		this.removeAttribute(`show-${attr}`);
	}

	setCurrentTemplate(templateName) {
		if (this.currentTemplate !== templateName) {
			this.currentTemplate = templateName;
			// Destroy existing attributes.
			// This ensures that the next synchronise will trigger all the necessary mutation observers
			// (otherwise a shared name from the previously active template might be something that's
			// supposedly not necessary to change).
			if (this.observer) {
				this.observer.disconnect();
				for (const attr of Array.from(this.attributes)) {
					this.removeAttributeNode(attr);
				}
				this.observer.observe(this, { attributes: true });
			}

			this.shadowRoot.innerHTML = this.constructor.templates[templateName];
			this.shadowRoot.children[0].style.height = '100%';

			this.style['max-width'] = '900px';
			this.style['display'] = 'block';
			this.style['margin'] = 'auto';
		}
	}

	// To avoid some confusion, we call the wifi interfaces 'wifi' and the network interfaces 'network'.
	// This gets a little confusing when dhcp uses 'interface' and it's referring to the network one.
	getWifiInterfaceInfo(config, wifiInterfaces) {
		const wifi = wifiInterfaces.length === 0 ? undefined : wifiInterfaces.find(s => s.disabled !== '1') ?? wifiInterfaces[0];
		let network = !wifi?.network ? undefined : config.sections('network', 'interface').find(s => s['.name'] === wifi['network']);
		if (network && network['proto'] === 'batadv_hardif') {
			// Batman has a very odd setup, so we have to find the actual network in this case. e.g.
			//
			// config interface 'ahiface'
			//   option mtu '1536'
			//   option proto 'batadv_hardif'
			//   option master 'bat0'
			//   option defaults_applied '1'
			//
			// config interface 'ahwlan'
			//    option proto 'static'
			//    option ipaddr '192.168.1.1'
			//    option netmask '255.255.255.0'
			//    option defaults_applied '1'
			//    option device 'bat0'
			network = config.sections('network', 'interface').find(s => s['device'] === network['master']);
		}

		if (network) {
			network['first_ipaddr'] = getFirstIpaddr(network['ipaddr']);
		}

		const dhcp = !network ? undefined : config.sections('dhcp', 'dhcp').find(s => s['interface'] === network['.name']);

		return { wifi, network, dhcp };
	}

	getEthernetInterfaceInfo(config, ethernetPorts) {
		for (const network of config.sections('network', 'interface')) {
			if (!network.device) {
				continue;
			}

			const bridge = config.sections('network', 'device').find(s => s.name === network.device && s.type === 'bridge');
			if (bridge && (!bridge.ports || bridge.ports.length === 0)) {
				continue;
			}

			const devices = bridge ? bridge.ports : [network.device];
			if (ethernetPorts.some(p => devices.includes(p.device))) {
				network['first_ipaddr'] = getFirstIpaddr(network['ipaddr']);

				return {
					network,
					dhcp: config.sections('dhcp', 'dhcp').find(s => !s.interface || s.interface === network['.name']),
				};
			}
		}

		return { network: undefined, dhcp: undefined };
	}

	/* This takes the info about an interface (often from getWifiInterfaceInfo above) and
	 * converts it into a format we're happy to display.
	 */
	getDiagramInterfaceText(info) {
		const slot = {};
		const externalSlot = {};
		// externalSlot is a slot object for the device connected to this interface.

		if (info.wifi) {
			if (info.wifi['disabled'] === '1' || !['adhoc', 'sta', 'ap', 'mesh'].includes(info.wifi['mode'])) {
				// It's probably 'none' or not set at all. At any rate, we don't understand it, so let's
				// not show anything here (at all, hence early return before groups are enabled).
				return [];
			}

			if (info.wifi['mode'] === 'mesh') {
				if (info.wifi['mesh_id']) {
					slot['MeshId'] = info.wifi['mesh_id'];
					externalSlot['MeshId'] = info.wifi['mesh_id'];
				}
			} else if (info.wifi['mode'] === 'sta' && info.wifi['dpp'] === '1') {
				slot['SSID'] = _('via DPP');
			} else if (info.wifi['ssid']) {
				slot['SSID'] = info.wifi['ssid'];
				externalSlot['SSID'] = info.wifi['ssid'];
			}
		}

		if (info.network) {
			switch (info.network['proto']) {
				case 'static':
					if (info.network['first_ipaddr']) {
						slot['IP'] = info.network['first_ipaddr'];
					}
					if (info.dhcp && info.dhcp.ignore !== '1') {
						slot['IPMethod'] = _('DHCP Server');

						if (info.network['first_ipaddr']) {
							externalSlot['IP'] = info.network['first_ipaddr'].replace(/\d+$/, 'x');
						}
					}
					break;
				case 'dhcp':
					slot['IPMethod'] = _('DHCP Client');
					break;
			}
		}

		return [slot, externalSlot];
	}

	/**
	 * Update the diagram based on the current config (UCI).
	 *
	 * @param config         uci config object
	 * @param extras         allows you to add things that wouldn't usually be there (e.g. *_SELECT/SELECT_FILL,
	 *                       which enable the selection boxes around elements to show that we're currently changing them).
	 * @param blacklist      allows you to remove things that would usually be there (usually if you're at an early stage of the wizard).
	 *                       (if you have a colon, will blacklist _part_ of the slot data; e.g. AP_HALOW_INT:IP will
	 *                       remove the IP field from AP_HALOW_INT, but not touch other values. See slotDataToHTML above).
	 */
	updateFrom(config, ethernetPorts, { extras, blacklist } = {}) {
		// The 'groups' are all the visible elements in our diagram
		// (the default is that groups are hidden).
		// Each item corresponds to a particular data-group attribute in the SVG.
		// The slots are all the text boxes that can be filled.
		let groups, slots;

		const morseDevice = config.sections('wireless', 'wifi-device').find(s => s.type === 'morse');
		const morseInterfaces = config.sections('wireless', 'wifi-iface').filter(s => s.device && s.device === morseDevice?.['.name']);
		const isMatterDevice = config.sections('matter').find(s => s.enable === '1');

		if (morseInterfaces.find(s => s.mode == 'mesh' && s.disabled !== '1')) {
			this.setCurrentTemplate(TEMPLATE_MESH11S);
			[groups, slots] = this.getMesh11sData(config, ethernetPorts);
		} else if (isMatterDevice) {
			this.setCurrentTemplate(TEMPLATE_MATTER);
			this.style['text-align'] = 'center';
			// For now Matter SVG does not have any group or slots as it just displays the matter logo if the device is configured
			// as a Matter device. Later when we certify Matter for OpenWRT we can add a slot to toggle message showing if the device
			// has been certified or not.
			groups = new Set();
			slots = defaultObject();
		} else {
			this.setCurrentTemplate(TEMPLATE_STANDARD);
			[groups, slots] = this.getStandardData(config, ethernetPorts);
		}

		for (const extra of extras ?? []) {
			groups.add(extra);
		}

		if (blacklist) {
			for (const bl of blacklist) {
				const [field, val] = bl.split(':');
				if (val) {
					if (slots[field]?.[val]) {
						delete slots[field][val];
					}
				} else {
					groups.delete(bl);
					delete slots[bl];
				}
			}
		}

		this.synchronise(groups, slots);
	}

	getStandardData(config, ethernetPorts) {
		const groups = new Set();
		const slots = defaultObject();

		const morseDevice = config.sections('wireless', 'wifi-device').find(s => s.type === 'morse');
		const wifiDevices = config.sections('wireless', 'wifi-device').filter(s => s.type === 'mac80211');
		const morseDeviceName = morseDevice?.['.name'];
		const wifiDeviceNames = wifiDevices.map(s => s['.name']);

		const wifiApInterfaces = config.sections('wireless', 'wifi-iface').filter(s => s.device && wifiDeviceNames.includes(s.device) && s.mode === 'ap');
		const enabledApWifiDeviceNames = wifiApInterfaces.filter(s => s.disabled !== '1').map(s => s.device);
		const enabledApWifiBands = [...new Set(wifiDevices.filter(s => enabledApWifiDeviceNames.includes(s['.name'])).map(s => getBandName(s.band)))];
		const uniqueApWifiSSIDs = [...new Set(wifiApInterfaces.filter(s => s.disabled !== '1').map(s => s.ssid))];
		const wifiStaInterfaces = config.sections('wireless', 'wifi-iface').filter(s => s.device && wifiDeviceNames.includes(s.device) && s.mode === 'sta');
		const enabledStaWifiInterface = wifiStaInterfaces.find(s => s.disabled !== '1');
		const morseInterfaces = config.sections('wireless', 'wifi-iface').filter(s => s.device && s.device === morseDeviceName);

		// Find 'best' interfaces - one that exists, and ideally is enabled...
		const wifiApInfo = this.getWifiInterfaceInfo(config, wifiApInterfaces);
		const wifiStaInfo = this.getWifiInterfaceInfo(config, wifiStaInterfaces);
		const morseInfo = this.getWifiInterfaceInfo(config, morseInterfaces);
		const morseApInfo = this.getWifiInterfaceInfo(config, morseInterfaces.filter(s => s.mode == 'ap'));
		const morseStaInfo = this.getWifiInterfaceInfo(config, morseInterfaces.filter(s => s.mode == 'sta'));

		let ethLanInfo = this.getEthernetInterfaceInfo(config, ethernetPorts.filter(p => p.role === 'lan'));
		let ethWanInfo = this.getEthernetInterfaceInfo(config, ethernetPorts.filter(p => p.role === 'wan'));
		const wanEthernetDevices = ethernetPorts.filter(p => p.role === 'wan').map(s => s.device);
		const lanEthernetDevices = ethernetPorts.filter(p => p.role === 'lan').map(s => s.device);

		if (enabledApWifiBands.length > 0) {
			const apWifiSlot = enabledApWifiBands.join(' + ') + ' Wi-Fi';
			slots['AP_WIFI_LINK'] = apWifiSlot;
			slots['STA_WIFI_LINK'] = apWifiSlot;
		}
		if (enabledStaWifiInterface) {
			const enabledStaWifiDevice = wifiDevices.find(s => s['.name'] === enabledStaWifiInterface.device);
			slots['AP_UPLINK_WIFI_LINK'] = `${getBandName(enabledStaWifiDevice.band)} Wi-Fi`;
		}

		// Check single port LAN situation and consider it a WAN if DHCP.
		if (!ethWanInfo.network && ethLanInfo.network?.proto === 'dhcp') {
			ethWanInfo = ethLanInfo;
			ethLanInfo = { network: undefined, dhcp: undefined };
		}

		const setDiagramInterfaceText = (diagramInterface, info, diagramGroups, diagramExternalInterface) => {
			const [slot, externalSlot] = this.getDiagramInterfaceText(info);
			if (!slot) {
				return;
			}
			Object.assign(slots[diagramInterface], slot);
			if (diagramExternalInterface && externalSlot) {
				if (diagramExternalInterface.endsWith('_INT')) { // i.e. it's an entire interface (i.e. AP/STA)
					Object.assign(slots[diagramExternalInterface], externalSlot);
				} else { // it's just an imaginary device with a single text field.
					slots[diagramExternalInterface]['IP'] = externalSlot['IP'];
				}
			}

			if (info.wifi || info.network) {
				// As long as _something_ exists that we tried to show, add the groups.
				for (const group of diagramGroups) {
					groups.add(group);
				}
			}
		};

		// Fill in the template strings that basically don't change
		// (and don't affect visibility).
		// They're not hard-coded so they can be translated (and for less translation
		// strings, we also don't duplicate boring strings like Ethernet).
		slots['AP_HALOW_CL1'] = _('HaLow Client');
		slots['AP_HALOW_CL2'] = _('HaLow Client');
		slots['MESH_HALOW_CL1'] = _('Mesh Point');
		slots['MESH_HALOW_CL2'] = _('Mesh Point');
		slots['AP_UPLINK_SOURCE'] = _('Internet');
		slots['AP_UPLINK_DEVICE'] = _('Existing router');
		slots['AP_UPLINK_ETH_LINK'] = _('Ethernet');
		slots['AP_MGMT_ETH_DEVICE'] = _('Laptop/Device');
		slots['AP_MGMT_ETH_LINK'] = _('Ethernet');
		slots['STA_MGMT_ETH_DEVICE'] = _('Laptop/Device');
		slots['STA_MGMT_ETH_LINK'] = _('Ethernet');
		slots['STA_WIFI_DEVICE'] = _('Laptop/Device');
		slots['AP_WIFI_DEVICE'] = _('Laptop/Device');
		slots['AP_UPLINK_WIFI_LINK'] = _('Non-HaLow Wi-Fi');
		slots['AP_WIFI_LINK'] = _('Non-HaLow Wi-Fi');
		slots['STA_WIFI_LINK'] = _('Non-HaLow Wi-Fi');
		slots['AP_SELECT_TEXT'] = _('This Device');
		slots['STA_SELECT_TEXT'] = _('This Device');

		const hostname = `<b>${config.get_first('system', 'system', 'hostname')}</b>`;

		if (enabledApWifiBands.length > 0) {
			const apWifiSlot = enabledApWifiBands.join(' + ') + ' Wi-Fi';
			slots['AP_WIFI_LINK'] = apWifiSlot;
			slots['STA_WIFI_LINK'] = apWifiSlot;
		}
		if (enabledStaWifiInterface) {
			const enabledStaWifiDevice = wifiDevices.find(s => s['.name'] === enabledStaWifiInterface.device);
			slots['AP_UPLINK_WIFI_LINK'] = `${getBandName(enabledStaWifiDevice.band)} Wi-Fi`;
		}

		// Determine which side of the diagram we're using and how to name them.
		// DEVICE.AP is the default (LHS).
		let selectedDevice = DEVICE.AP; // This is the diagram selected device.
		if (!morseInfo.wifi) {
			slots['AP_DESC'] = _('Device');
		} else if (morseInfo.wifi.disabled === '1') {
			slots['AP_DESC'] = _('HaLow <br>Device');
		} else if (config.get('prplmesh', 'config', 'enable') === '1') { // Handle all prplmesh cases here
			groups.add('MESH_HALOW');
			slots['AP_DESC'] = _('HaLow <br>Mesh <br>Controller');
			slots['STA_DESC'] = _('HaLow Mesh Agent');

			// If we're not a controller-agent, we should appear on the station
			// side of the diagran.
			if (config.get('prplmesh', 'config', 'management_mode') === 'Multi-AP-Agent') {
				selectedDevice = DEVICE.STA;

				setDiagramInterfaceText('STA_HALOW_INT', morseStaInfo, ['STA', 'STA_HALOW', 'AP_HALOW'], 'AP_HALOW_INT');
				setDiagramInterfaceText('MESH_HALOW_INT', morseApInfo, ['MESH_HALOW']);
				slots['MESH_HALOW_CL1'] = _('HaLow Client');
				slots['MESH_HALOW_CL2'] = _('HaLow Client');

				if (morseStaInfo.wifi && morseApInfo.wifi
					&& morseStaInfo.network && morseApInfo.network
					&& morseStaInfo.network.proto === 'dhcp' && morseStaInfo.network['.name'] === morseApInfo.network['.name']) {
					slots['MESH_HALOW_INT']['IPMethod'] = _('Bridged');
					/* The SSID is going to come from the prplmesh agent, and if we report it here it may be the old SSID
					* from a previous configuration (confusing for user if they're on the config page).
					*/
					slots['MESH_HALOW_INT']['SSID'] = undefined;
				}
			} else if (config.get('prplmesh', 'config', 'management_mode') === 'Multi-AP-Controller-and-Agent') {
				/* In case of a controller-agent, the HaLow clients should appear on the station
				* side of the diagram.
				*/
				slots['MESH_HALOW_CL1'] = _('HaLow Client');
				slots['MESH_HALOW_CL2'] = _('HaLow Client');
			}
		} else if (morseInfo.wifi.mode === 'ap') {
			slots['AP_DESC'] = _('HaLow <br>Access <br>Point');
			slots['STA_DESC'] = _('HaLow Client');
		} else if (morseInfo.wifi.mode === 'adhoc') {
			slots['AP_DESC'] = _('Ad-Hoc <br>HaLow <br>Device');
			slots['STA_DESC'] = _('Ad-Hoc HaLow Device');
			slots['AP_HALOW_CL1'] = _('Ad-Hoc Device');
			slots['AP_HALOW_CL2'] = _('Ad-Hoc Device');
		} else if (morseInfo.wifi.mode === 'sta') {
			slots['AP_DESC'] = _('HaLow <br>Access <br>Point');
			slots['STA_DESC'] = _('HaLow Client');
			selectedDevice = DEVICE.STA;
		} else {
			slots['AP_DESC'] = _('HaLow <br>Device');
			slots['STA_DESC'] = _('HaLow Device');
		}

		// Now we can populate the selected device with all the info.
		switch (selectedDevice) {
			case DEVICE.AP:
				groups.add('AP_SELECT');
				slots['DEVICE_AP'] = hostname;

				setDiagramInterfaceText('AP_HALOW_INT', morseInfo, ['AP_HALOW', 'STA', 'STA_HALOW'], 'STA_HALOW_INT');
				setDiagramInterfaceText('AP_UPLINK_WIFI_INT', wifiStaInfo, ['AP_UPLINK', 'AP_UPLINK_WIFI'], 'AP_UPLINK_XIP');

				if (ethWanInfo.network && !(wifiStaInfo.wifi && wifiStaInfo.wifi.disabled !== '1')) {
					// Show the ethernet devices which are participating in the WAN link
					if (wanEthernetDevices.length >= 1) {
						slots['AP_UPLINK_ETH_LINK'] += ` (${wanEthernetDevices.join('/')})`;
					} else {
						slots['AP_UPLINK_ETH_LINK'] += ` (${lanEthernetDevices.join('/')})`;
					}
					setDiagramInterfaceText('AP_UPLINK_ETH_INT', ethWanInfo, ['AP_UPLINK', 'AP_UPLINK_ETH'], 'AP_UPLINK_XIP');
					// We try to put the DHCP client info on the more likely interface if eth/halow are bridged.
					if (morseInfo.network && morseInfo.wifi && ethWanInfo.network['.name'] === morseInfo.network['.name'] && morseInfo.wifi.disabled !== '1') {
						slots['AP_HALOW_INT']['IPMethod'] = _('Bridged');
					}
				}

				setDiagramInterfaceText('AP_WIFI_INT', wifiApInfo, ['AP_WIFI'], 'AP_WIFI_XIP');

				if (ethLanInfo.network) {
					// Show the ethernet devices which are participating in the LAN link.
					slots['AP_MGMT_ETH_LINK'] += ` (${lanEthernetDevices.join('/')})`;
					setDiagramInterfaceText('AP_MGMT_ETH_INT', ethLanInfo, ['AP_MGMT_ETH'], 'AP_MGMT_ETH_XIP');
					// Only show one ethernet link as a DHCP client at a time in bridge mode (WAN preferred)
					if (wanEthernetDevices.length >= 1 && slots['AP_UPLINK_ETH_INT']['IPMethod'] == 'DHCP Client' && slots['AP_MGMT_ETH_INT']['IPMethod'] == 'DHCP Client') {
						slots['AP_MGMT_ETH_INT']['IPMethod'] = _('Bridged');
					}
				}

				if (uniqueApWifiSSIDs.length > 1) {
					slots['AP_WIFI_INT']['SSID'] = `<i>${_('multiple')}</i>`;
				}

				break;

			case DEVICE.STA:
				groups.add('STA_SELECT');
				slots['DEVICE_STA'] = hostname;

				// Show all ethernet devices as participants in the LAN link.
				slots['STA_MGMT_ETH_LINK'] += ` (${(wanEthernetDevices.concat(lanEthernetDevices)).join('/')})`;

				// We only have space for one ethernet thing here. Prefer LAN (it's a STA!) unless
				// LAN doesn't exist.
				var ethInfo = ethLanInfo.network ? ethLanInfo : ethWanInfo;
				setDiagramInterfaceText('STA_HALOW_INT', morseInfo, ['STA', 'STA_HALOW', 'AP_HALOW'], 'AP_HALOW_INT');
				setDiagramInterfaceText('STA_MGMT_ETH_INT', ethInfo, ['STA_MGMT_ETH'], 'STA_MGMT_ETH_XIP');
				setDiagramInterfaceText('STA_WIFI_INT', wifiApInfo, ['STA_WIFI'], 'STA_WIFI_XIP');
				// As above, we try to put the DHCP client info on the more likely interface if eth/halow are bridged
				// (whereas if we have a static IP, we just put that IP on both interfaces).
				if (ethInfo.network?.proto === 'dhcp') {
					if (morseInfo && ethInfo.network['.name'] === morseInfo.network['.name'] && morseInfo.wifi.disabled !== '1') {
						slots['STA_MGMT_ETH_INT']['IPMethod'] = _('Bridged');
					}
					if (wifiApInfo.wifi && wifiApInfo.wifi.disabled !== '1') {
						if (ethInfo.network['.name'] === wifiApInfo.network['.name'] && wifiApInfo.wifi.disabled !== '1') {
							slots['STA_WIFI_INT']['IPMethod'] = _('Bridged');
						} else if (morseInfo.wifi && morseInfo.network['.name'] === wifiApInfo.network['.name'] && morseInfo.wifi.disabled !== '1') {
							slots['STA_MGMT_ETH_INT']['IPMethod'] = _('Bridged');
						}
					}
				}

				if (uniqueApWifiSSIDs.length > 1) {
					slots['STA_WIFI_INT']['SSID'] = `<i>${_('multiple')}</i>`;
				}

				break;
		}

		return [groups, slots];
	}

	getMesh11sData(config, ethernetPorts) {
		const groups = new Set();
		const slots = defaultObject();

		const morseDevice = config.sections('wireless', 'wifi-device').find(s => s.type === 'morse');
		const wifiDevices = config.sections('wireless', 'wifi-device').filter(s => s.type === 'mac80211');
		const morseDeviceName = morseDevice?.['.name'];
		const wifiDeviceNames = wifiDevices.map(s => s['.name']);

		const wifiApInterfaces = config.sections('wireless', 'wifi-iface').filter(s => s.device && wifiDeviceNames.includes(s.device) && s.mode === 'ap');
		const enabledApWifiDeviceNames = wifiApInterfaces.filter(s => s.disabled !== '1').map(s => s.device);
		const enabledApWifiBands = [...new Set(wifiDevices.filter(s => enabledApWifiDeviceNames.includes(s['.name'])).map(s => getBandName(s.band)))];
		const uniqueApWifiSSIDs = [...new Set(wifiApInterfaces.filter(s => s.disabled !== '1').map(s => s.ssid))];
		const wifiStaInterfaces = config.sections('wireless', 'wifi-iface').filter(s => s.device && wifiDeviceNames.includes(s.device) && s.mode === 'sta');
		const enabledStaWifiInterface = wifiStaInterfaces.find(s => s.disabled !== '1');
		const morseInterfaces = config.sections('wireless', 'wifi-iface').filter(s => s.device && s.device === morseDeviceName);

		// Find 'best' interfaces - one that exists, and ideally is enabled...
		const wifiApInfo = this.getWifiInterfaceInfo(config, wifiApInterfaces);
		const wifiStaInfo = this.getWifiInterfaceInfo(config, wifiStaInterfaces);
		const morseApInfo = this.getWifiInterfaceInfo(config, morseInterfaces.filter(s => s.mode == 'ap'));
		const morseMeshInfo = this.getWifiInterfaceInfo(config, morseInterfaces.filter(s => s.mode == 'mesh'));

		let ethLanInfo = this.getEthernetInterfaceInfo(config, ethernetPorts.filter(p => p.role === 'lan'));
		let ethWanInfo = this.getEthernetInterfaceInfo(config, ethernetPorts.filter(p => p.role === 'wan'));
		const wanEthernetDevices = ethernetPorts.filter(p => p.role === 'wan').map(s => s.device);
		const lanEthernetDevices = ethernetPorts.filter(p => p.role === 'lan').map(s => s.device);

		const setDiagramInterfaceText = (diagramInterface, info, diagramGroups, diagramExternalInterface) => {
			const [slot, externalSlot] = this.getDiagramInterfaceText(info);
			if (!slot) {
				return;
			}
			Object.assign(slots[diagramInterface], slot);
			if (diagramExternalInterface && externalSlot) {
				if (diagramExternalInterface.endsWith('_INT')) { // i.e. it's an entire interface (i.e. AP/STA)
					Object.assign(slots[diagramExternalInterface], externalSlot);
				} else { // it's just an imaginary device with a single text field.
					slots[diagramExternalInterface] = externalSlot['IP'];
				}
			}

			if (info.wifi || info.network) {
				// As long as _something_ exists that we tried to show, add the groups.
				for (const group of diagramGroups) {
					groups.add(group);
				}
			}
		};

		// Fill in the template strings that basically don't change
		// (and don't affect visibility).
		// They're not hard-coded so they can be translated (and for less translation
		// strings, we also don't duplicate boring strings like Ethernet).
		slots['GATE_HALOW_AP_CL1'] = _('HaLow Client');
		slots['GATE_HALOW_AP_CL2'] = _('HaLow Client');
		slots['POINT_HALOW_AP_CL1'] = _('HaLow Client');
		slots['GATE_UPLINK_DEVICE'] = _('Existing router');
		slots['GATE_UPLINK_ETH_LINK'] = _('Ethernet');
		slots['GATE_UPLINK_SOURCE'] = _('Internet');
		slots['GATE_MGMT_ETH_DEVICE'] = _('Laptop/Device');
		slots['GATE_MGMT_ETH_LINK'] = _('Ethernet');
		slots['GATE_WIFI_DEVICE'] = _('Laptop/Device');
		slots['GATE_WIFI_LINK'] = _('Non-HaLow Wi-Fi');
		slots['GATE_SELECT_TEXT'] = _('This Device');
		slots['GATE_UPLINK_WIFI_LINK'] = _('Non-HaLow Wi-Fi');
		slots['POINT_MGMT_ETH_DEVICE'] = _('Laptop/Device');
		slots['POINT_MGMT_ETH_LINK'] = _('Ethernet');
		slots['POINT_WIFI_DEVICE'] = _('Laptop/Device');
		slots['POINT_WIFI_LINK'] = _('Non-HaLow Wi-Fi');
		slots['POINT_SELECT_TEXT'] = _('This Device');
		slots['POINT_DESC'] = _('Mesh Point');
		slots['OTHER_POINT_DESC'] = _('Mesh Point');

		const hostname = `<b>${config.get_first('system', 'system', 'hostname')}</b>`;

		if (enabledApWifiBands.length > 0) {
			const apWifiSlot = enabledApWifiBands.join(' + ') + ' Wi-Fi';
			slots['POINT_WIFI_LINK'] = apWifiSlot;
			slots['GATE_WIFI_LINK'] = apWifiSlot;
		}
		if (enabledStaWifiInterface) {
			const enabledStaWifiDevice = wifiDevices.find(s => s['.name'] === enabledStaWifiInterface.device);
			slots['GATE_UPLINK_WIFI_LINK'] = `${getBandName(enabledStaWifiDevice.band)} Wi-Fi`;
		}

		if (config.get('mesh11sd', 'mesh_params', 'mesh_gate_announcements') === '1') {
			groups.add('GATE_SELECT');
			slots['GATE_DESC'] = _('Mesh Gate');
			slots['DEVICE_GATE'] = hostname;

			setDiagramInterfaceText('GATE_HALOW_MESH_INT', morseMeshInfo, ['GATE_HALOW_MESH', 'OTHER_POINT', 'POINT', 'POINT_HALOW'], 'POINT_HALOW_INT');
			setDiagramInterfaceText('GATE_UPLINK_WIFI_INT', wifiStaInfo, ['GATE_UPLINK', 'GATE_UPLINK_WIFI'], 'GATE_UPLINK_XIP');
			setDiagramInterfaceText('GATE_WIFI_INT', wifiApInfo, ['GATE_WIFI'], 'GATE_WIFI_XIP');
			setDiagramInterfaceText('GATE_HALOW_AP_INT', morseApInfo, ['GATE_HALOW_AP']);

			// We try to put the DHCP client info on the more likely interface if eth/halow are bridged.
			if (morseMeshInfo.network && morseMeshInfo.network.proto === 'dhcp') {
				if (morseApInfo.network && morseMeshInfo.network['.name'] === morseApInfo.network['.name']) {
					slots['GATE_HALOW_AP_INT']['IPMethod'] = _('Bridged');
				}

				if (wifiApInfo.network && morseMeshInfo.network['.name'] === wifiApInfo.network['.name']) {
					slots['GATE_WIFI_INT']['IPMethod'] = _('Bridged');
				}
			}

			// Do not show a Wi-Fi and Ethernet uplink simultaneously
			if (ethWanInfo.network && !(wifiStaInfo.wifi && wifiStaInfo.wifi.disabled !== '1')) {
				// Show the ethernet devices which are participating in the WAN link
				if (wanEthernetDevices.length >= 1) {
					slots['GATE_UPLINK_ETH_LINK'] += ` (${wanEthernetDevices.join('/')})`;
				} else {
					slots['GATE_UPLINK_ETH_LINK'] += ` (${lanEthernetDevices.join('/')})`;
				}
				setDiagramInterfaceText('GATE_UPLINK_ETH_INT', ethWanInfo, ['GATE_UPLINK', 'GATE_UPLINK_ETH'], 'GATE_UPLINK_XIP');
				if (morseMeshInfo.network && morseMeshInfo.wifi && ethWanInfo.network['.name'] === morseMeshInfo.network['.name'] && morseMeshInfo.wifi.disabled !== '1') {
					slots['GATE_HALOW_MESH_INT']['IPMethod'] = _('Bridged');
				}
			}

			if (ethLanInfo.network) {
				// Show the ethernet devices which are participating in the LAN link.
				slots['GATE_MGMT_ETH_LINK'] += ` (${lanEthernetDevices.join('/')})`;
				setDiagramInterfaceText('GATE_MGMT_ETH_INT', ethLanInfo, ['GATE_MGMT_ETH'], 'GATE_MGMT_ETH_XIP');
				// Only show one ethernet link as a DHCP client at a time in bridge mode (WAN preferred)
				if (wanEthernetDevices.length >= 1 && slots['GATE_UPLINK_ETH_INT']['IPMethod'] == 'DHCP Client' && slots['GATE_MGMT_ETH_INT']['IPMethod'] == 'DHCP Client') {
					slots['GATE_MGMT_ETH_INT']['IPMethod'] = _('Bridged');
				}
			}

			if (uniqueApWifiSSIDs.length > 1) {
				slots['GATE_WIFI_INT']['SSID'] = `<i>${_('multiple')}</i>`;
			}
		} else {
			groups.add('POINT');
			groups.add('POINT_SELECT');
			// Confusingly, we label the mesh gate device (on the LHS) a mesh point, since
			// we don't want to imply that a mesh gate is a required device (but I still
			// like the idea of _selecting_ a different thing in the diagram).
			slots['GATE_DESC'] = _('Mesh Point');
			slots['DEVICE_POINT'] = hostname;

			// Show all ethernet devices as participants in the LAN link.
			slots['POINT_MGMT_ETH_LINK'] += ` (${(wanEthernetDevices.concat(lanEthernetDevices)).join('/')})`;

			// We only have space for one ethernet thing here. Prefer LAN (it's a STA!) unless
			// LAN doesn't exist.
			var ethInfo = ethLanInfo.network ? ethLanInfo : ethWanInfo;
			setDiagramInterfaceText('POINT_HALOW_INT', morseMeshInfo, ['POINT_HALOW', 'OTHER_POINT', 'GATE_HALOW_MESH'], 'GATE_HALOW_MESH_INT');
			setDiagramInterfaceText('POINT_MGMT_ETH_INT', ethInfo, ['POINT_MGMT_ETH'], 'POINT_MGMT_ETH_XIP');
			setDiagramInterfaceText('POINT_WIFI_INT', wifiApInfo, ['POINT_WIFI'], 'POINT_WIFI_XIP');
			setDiagramInterfaceText('POINT_HALOW_AP_INT', morseApInfo, ['POINT_HALOW_AP']);

			if (morseMeshInfo.network && morseMeshInfo.network.proto === 'dhcp') {
				if (ethInfo.network && morseMeshInfo.network['.name'] === ethInfo.network['.name']) {
					slots['POINT_MGMT_ETH_INT']['IPMethod'] = _('Bridged');
				}

				if (wifiApInfo.network && morseMeshInfo.network['.name'] === wifiApInfo.network['.name']) {
					slots['POINT_WIFI_INT']['IPMethod'] = _('Bridged');
				}

				if (morseApInfo.network && morseMeshInfo.network['.name'] === morseApInfo.network['.name']) {
					slots['POINT_HALOW_AP_INT']['IPMethod'] = _('Bridged');
				}
			}

			if (uniqueApWifiSSIDs.length > 1) {
				slots['POINT_WIFI_INT']['SSID'] = `<i>${_('multiple')}</i>`;
			}
		}

		return [groups, slots];
	}

	// To avoid re-rendering the entire config diagram each time,
	// we mutate the existing one by messing with its attributes
	// (i.e. which groups we show) and its slots.
	synchronise(groups, slots) {
		// Synchronise 'groups'
		const existingGroups = new Set();
		for (const attribute of this.attributes) {
			if (attribute.name.startsWith('show-')) {
				existingGroups.add(attribute.name.slice(5));
			}
		}
		for (const group of existingGroups) {
			if (!groups.has(group)) {
				this.hide(group);
			}
		}
		for (const group of groups) {
			if (!existingGroups.has(group)) {
				this.show(group);
			}
		}

		// Synchronise 'slots'
		let slotsToRemove = [];
		for (const element of this.children) {
			const slotName = element.getAttribute('slot');
			if (!slotName) {
				continue;
			} else if (!slots[slotName]) {
				slotsToRemove.push(element);
			} else {
				// Mutate existing slot (may be no-op).
				element.innerHTML = slotDataToHtml(slots[slotName]);
				element.setAttribute('title', slotDataToText(slots[slotName]));
				delete slots[slotName];
			}
		}
		// Can't mutate element.children while iterating.
		for (const slot of slotsToRemove) {
			slot.remove();
		}

		// Add missing slots.
		for (const [slotName, slotData] of Object.entries(slots)) {
			const slot = document.createElement('span');
			slot.setAttribute('slot', slotName);
			slot.insertAdjacentHTML('beforeend', slotDataToHtml(slotData));
			slot.setAttribute('title', slotDataToText(slotData));
			this.insertAdjacentElement('beforeend', slot);
		}
	}
}

customElements.define('morse-config-diagram', MorseConfigDiagram);

return baseclass.extend({
	async loadTemplate() {
		const responses = await Promise.all(TEMPLATES.map(
			// Use the version specific cache busting, not the 'cache bust every time'
			// ({ cache: true }).
			tn => request.get(L.resourceCacheBusted(`custom-elements/${tn}.svg`), { cache: true }),
		));

		if (responses.some(r => !r.ok)) {
			throw new Error('Unable to load diagram template.');
		}

		const templates = {};
		let i = 0;
		for (const r of responses) {
			templates[TEMPLATES[i++]] = r.text();
		}

		MorseConfigDiagram.setTemplates(templates);
	},
});
