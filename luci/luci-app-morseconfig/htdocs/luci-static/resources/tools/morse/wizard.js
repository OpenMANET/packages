'use strict';
/* globals baseclass configDiagram form morseuci morseui network rpc uci ui view */
'require baseclass';
'require view';
'require form';
'require uci';
'require ui';
'require network';
'require rpc';
'require tools.morse.uci as morseuci';
'require tools.morse.morseui as morseui';
'require custom-elements.morse-config-diagram as configDiagram';

const DEFAULT_LAN_IP = '10.40.0.1';
const DEFAULT_WLAN_IP = '10.41.254.1';
const ALTERNATE_WLAN_IP = '10.41.254.1';

const callUciCommit = rpc.declare({
	object: 'uci',
	method: 'commit',
	params: ['config'],
	reject: true,
});

const callUciDelete = rpc.declare({
	object: 'uci',
	method: 'delete',
	params: ['config', 'section', 'option'],
	reject: true,
});

const callGetBuiltinEthernetPorts = rpc.declare({
	object: 'luci',
	method: 'getBuiltinEthernetPorts',
	expect: { result: [] },
});

// Sadly, we add our own call to apply, because:
//  - the ui.changes.apply call (see ui.js) tries to do a bunch of vaguely annoying
//    things to the user interface
//  - uci.apply always uses rollback, and we can't rely on the user
//    finding us again
//  - the overridden .apply on localDevice swallows the res error code
//    and I'm scared to touch it
const callUciApply = rpc.declare({
	object: 'uci',
	method: 'apply',
	params: ['timeout', 'rollback'],
	reject: false, // So we can handle the 'nothing to do' case (returns 5).
});

const directUciRpc = {
	delete: callUciDelete,
	commit: callUciCommit,
	apply: callUciApply,
};

class WizardConfigError extends Error { }

class WizardWifiDevice {
	constructor(config = {}) {
		Object.assign(this, config);
	}

	get name() {
		return this['.name'];
	}

	get apInterfaceName() {
		return `default_${this.name}`;
	}

	get staInterfaceName() {
		return `sta_${this.name}`;
	}

	getBandName() {
		const bandNames = {
			's1g': '802.11ah HaLow',
			'2g': '2.4 GHz',
			'5g': '5 GHz',
			'6g': '6 GHz',
			'60g': '60 GHz',
		};

		return bandNames[this.band] || 'Unknown Band';
	}
}

/* Extract the most important information from UCI that we tend to use.
 *
 * This is somewhat similar to missingSections in morseconf.js, except that
 * it both validates the existence of and extracts the relevant sections.
 * It exists because the wizard was originally written independently,
 * and has significant overlap with the logic in missing sections
 * (and things like mmGetMorseDevice). We should refactor it as part of APP-2033.
 */
function readSectionInfo() {
	const morseDevice = uci.sections('wireless', 'wifi-device').find(s => s.type === 'morse');
	const morseDeviceName = morseDevice?.['.name'];
	const morseInterfaceName = `default_${morseDeviceName}`;
	const morseBackhaulStaName = `default_bh_${morseDeviceName}`;
	const morseMeshApInterfaceName = `meshap_${morseDeviceName}`;
	const morseMeshInterfaceName = `mesh_${morseDeviceName}`;

	const wifiDevices = [];
	const wifiDeviceConfigs = uci.sections('wireless', 'wifi-device').filter(s => s.type === 'mac80211');
	for (const wifiDeviceConfig of wifiDeviceConfigs) {
		wifiDevices.push(new WizardWifiDevice(wifiDeviceConfig));
	}

	// privlan has been removed from all the configs, but for those upgrading we should prefer the IP address
	// in privlan (i.e. likely 10.40.0.1) to that in lan (likely 10.40.0.1).
	const lanIp = morseuci.getFirstIpaddr('privlan') || morseuci.getFirstIpaddr('lan') || DEFAULT_LAN_IP;
	let wlanIp;
	// Likewise, we use the IP in lan here in case we got the previous ip from privlan (it's an old config).
	for (wlanIp of [morseuci.getFirstIpaddr('lan'), morseuci.getFirstIpaddr('ahwlan'), DEFAULT_WLAN_IP, ALTERNATE_WLAN_IP]) {
		if (wlanIp && wlanIp != lanIp) {
			break;
		}
	}
	if (!morseDevice) {
		throw new WizardConfigError(_('No HaLow radio found'));
	}

	if (morseDevice && !uci.get('wireless', morseInterfaceName)) {
		uci.add('wireless', 'wifi-iface', morseInterfaceName);
		uci.set('wireless', morseInterfaceName, 'device', morseDeviceName);
		uci.set('wireless', morseInterfaceName, 'mode', 'ap');
		uci.set('wireless', morseInterfaceName, 'encryption', 'sae');
		uci.set('wireless', morseInterfaceName, 'ssid', morseuci.getDefaultSSID());
		uci.set('wireless', morseInterfaceName, 'mesh_id', morseuci.getDefaultSSID());
		uci.set('wireless', morseInterfaceName, 'key', morseuci.getDefaultWifiKey());
		uci.set('wireless', morseInterfaceName, 'disabled', '1');
	}

	for (const wifiDevice of wifiDevices) {
		if (!uci.get('wireless', wifiDevice.apInterfaceName)) {
			uci.add('wireless', 'wifi-iface', wifiDevice.apInterfaceName);
			uci.set('wireless', wifiDevice.apInterfaceName, 'device', wifiDevice.name);
			uci.set('wireless', wifiDevice.apInterfaceName, 'mode', 'ap');
			uci.set('wireless', wifiDevice.apInterfaceName, 'encryption', 'psk2');
			uci.set('wireless', wifiDevice.apInterfaceName, 'ssid', morseuci.getDefaultSSID());
			uci.set('wireless', wifiDevice.apInterfaceName, 'mesh_id', morseuci.getDefaultSSID());
			uci.set('wireless', wifiDevice.apInterfaceName, 'key', morseuci.getDefaultWifiKey());
			uci.set('wireless', wifiDevice.apInterfaceName, 'disabled', '1');
		}
	}

	const checkDevices = {
		[morseDeviceName]: [morseInterfaceName, morseBackhaulStaName, morseMeshApInterfaceName, morseMeshInterfaceName],
		...wifiDevices.reduce((acc, wifiDevice) => ({
			...acc,
			[wifiDevice.name]: [wifiDevice.apInterfaceName, wifiDevice.staInterfaceName],
		}), {}),
	};

	for (const [deviceName, ifaceNames] of Object.entries(checkDevices)) {
		for (const ifaceName of ifaceNames) {
			const iface = uci.get('wireless', ifaceName);
			if (iface && iface.device != deviceName) {
				throw new WizardConfigError(_('wifi-iface %s has device %s instead of %s').format(ifaceName, iface.device, deviceName));
			}
		}
	}

	return {
		wifiDevices,
		morseDevice,
		morseDeviceName,
		morseInterfaceName,
		morseMeshInterfaceName,
		morseBackhaulStaName,
		morseMeshApInterfaceName,
		lanIp,
		wlanIp,
	};
}

function readEthernetPortInfo(ethernetPorts) {
	let ethStaticNetwork, ethDHCPNetwork, ethDHCPPort;

	for (const network of uci.sections('network', 'interface')) {
		for (const deviceName of morseuci.getNetworkDevices(network['.name'])) {
			if (ethernetPorts.some(p => p.device === deviceName)) {
				if (network.proto === 'static') {
					ethStaticNetwork = network['.name'];
				} else if (network.proto === 'dhcp') {
					ethDHCPNetwork = network['.name'];
					ethDHCPPort = deviceName;
				}
			}
		}
	}

	return { ethStaticNetwork, ethDHCPPort, ethDHCPNetwork };
}

function whitelistFields(conf, section, whitelist) {
	whitelist = new Set(whitelist);

	for (const field of Object.keys(section)) {
		if (!whitelist.has(field)) {
			uci.unset(conf, section['.name'], field);
		}
	}
}

/* Set default firewall rules for a non-local zone (i.e. if you're rejecting
 * almost all traffic, these are the accept rules).
 */
function setDefaultWanFirewallRules(zone) {
	/* These were auto-generated from the default firewall rules in 23.05,
	 * extracted via # ubus call uci get '{"config":"firewall","type":"rule"}'
	 *
	 * for rule in x["values"].values():
	 *   print(f"sid = uci.add('firewall', 'rule');")
	 *   for k, v in rule.items():
	 *     if not k.startswith('.'):
	 *       if v == 'lan':
	 *         v = '*'
	 *       print(f"uci.set('firewall', sid, '{k}', {repr(v) if v != 'wan' else 'zone'});")
	 *
	 * All 'wan' references are changed to zone, and the IPSec rules are changed to
	 * allow any destination zone instead of just lan (cf Allow-ICMPv6-Forward),
	 * as this makes our setup independent of the other zones in the system.
	 */
	let sid;
	sid = uci.add('firewall', 'rule');
	uci.set('firewall', sid, 'name', 'Allow-DHCP-Renew');
	uci.set('firewall', sid, 'src', zone);
	uci.set('firewall', sid, 'proto', 'udp');
	uci.set('firewall', sid, 'dest_port', '68');
	uci.set('firewall', sid, 'target', 'ACCEPT');
	uci.set('firewall', sid, 'family', 'ipv4');
	sid = uci.add('firewall', 'rule');
	uci.set('firewall', sid, 'name', 'Allow-Ping');
	uci.set('firewall', sid, 'src', zone);
	uci.set('firewall', sid, 'proto', 'icmp');
	uci.set('firewall', sid, 'icmp_type', 'echo-request');
	uci.set('firewall', sid, 'family', 'ipv4');
	uci.set('firewall', sid, 'target', 'ACCEPT');
	sid = uci.add('firewall', 'rule');
	uci.set('firewall', sid, 'name', 'Allow-IGMP');
	uci.set('firewall', sid, 'src', zone);
	uci.set('firewall', sid, 'proto', 'igmp');
	uci.set('firewall', sid, 'family', 'ipv4');
	uci.set('firewall', sid, 'target', 'ACCEPT');
	sid = uci.add('firewall', 'rule');
	uci.set('firewall', sid, 'name', 'Allow-DHCPv6');
	uci.set('firewall', sid, 'src', zone);
	uci.set('firewall', sid, 'proto', 'udp');
	uci.set('firewall', sid, 'dest_port', '546');
	uci.set('firewall', sid, 'family', 'ipv6');
	uci.set('firewall', sid, 'target', 'ACCEPT');
	sid = uci.add('firewall', 'rule');
	uci.set('firewall', sid, 'name', 'Allow-MLD');
	uci.set('firewall', sid, 'src', zone);
	uci.set('firewall', sid, 'proto', 'icmp');
	uci.set('firewall', sid, 'src_ip', 'fe80::/10');
	uci.set('firewall', sid, 'icmp_type', ['130/0', '131/0', '132/0', '143/0']);
	uci.set('firewall', sid, 'family', 'ipv6');
	uci.set('firewall', sid, 'target', 'ACCEPT');
	sid = uci.add('firewall', 'rule');
	uci.set('firewall', sid, 'name', 'Allow-ICMPv6-Input');
	uci.set('firewall', sid, 'src', zone);
	uci.set('firewall', sid, 'proto', 'icmp');
	uci.set('firewall', sid, 'icmp_type', ['echo-request', 'echo-reply', 'destination-unreachable', 'packet-too-big', 'time-exceeded', 'bad-header', 'unknown-header-type', 'router-solicitation', 'neighbour-solicitation', 'router-advertisement', 'neighbour-advertisement']);
	uci.set('firewall', sid, 'limit', '1000/sec');
	uci.set('firewall', sid, 'family', 'ipv6');
	uci.set('firewall', sid, 'target', 'ACCEPT');
	sid = uci.add('firewall', 'rule');
	uci.set('firewall', sid, 'name', 'Allow-ICMPv6-Forward');
	uci.set('firewall', sid, 'src', zone);
	uci.set('firewall', sid, 'dest', '*');
	uci.set('firewall', sid, 'proto', 'icmp');
	uci.set('firewall', sid, 'icmp_type', ['echo-request', 'echo-reply', 'destination-unreachable', 'packet-too-big', 'time-exceeded', 'bad-header', 'unknown-header-type']);
	uci.set('firewall', sid, 'limit', '1000/sec');
	uci.set('firewall', sid, 'family', 'ipv6');
	uci.set('firewall', sid, 'target', 'ACCEPT');
	sid = uci.add('firewall', 'rule');
	uci.set('firewall', sid, 'name', 'Allow-IPSec-ESP');
	uci.set('firewall', sid, 'src', zone);
	uci.set('firewall', sid, 'dest', '*');
	uci.set('firewall', sid, 'proto', 'esp');
	uci.set('firewall', sid, 'target', 'ACCEPT');
	sid = uci.add('firewall', 'rule');
	uci.set('firewall', sid, 'name', 'Allow-ISAKMP');
	uci.set('firewall', sid, 'src', zone);
	uci.set('firewall', sid, 'dest', '*');
	uci.set('firewall', sid, 'dest_port', '500');
	uci.set('firewall', sid, 'proto', 'udp');
	uci.set('firewall', sid, 'target', 'ACCEPT');
	sid = uci.add('firewall', 'rule');
	uci.set('firewall', sid, 'name', 'Allow Batman Mesh TCP 4242');
	uci.set('firewall', sid, 'src', '*');
	uci.set('firewall', sid, 'dest', '*');
	uci.set('firewall', sid, 'dest_port', '4242');
	uci.set('firewall', sid, 'proto', 'tcp');
	uci.set('firewall', sid, 'target', 'ACCEPT');
}

/* Modify/add a network iface with the appropriate firewall zones/rules.
 *
 * Assumes that resetUciNetworkTopology has been called, as it does not
 * check to see if the added firewall rules are already there.
 *
 * local: Add a 'local' network to specific configurations, similar to OpenWrt's 'lan'.
 * It is a purely semantic label, indicating that no firewall/restrictions should be
 * applied.
 *
 * primaryLocal: Identify the singular primary local network in specific configurations.
 * It is currently only used to identify the interface for camera-onvif-server.
 */
function setupNetworkIface(sectionId, { local, primaryLocal } = {}) {
	if (!uci.sections('network', 'interface').find(s => s['.name'] === sectionId)) {
		uci.add('network', 'interface', sectionId);
		// If we don't give the iface a proto the quick config page recognises,
		// and it's never subsequently configured in the wizard,
		// it won't show up there.
		uci.set('network', sectionId, 'proto', 'dhcp');
	}

	morseuci.getOrCreateZone(sectionId);
	const zoneSection = uci.sections('firewall', 'zone').find(z => L.toArray(z.network).includes(sectionId));

	let umdnsNetworkList = L.toArray(uci.get_first('umdns', 'umdns', 'network'));
	if (local) {
		uci.set('firewall', zoneSection['.name'], 'input', 'ACCEPT');
		uci.set('firewall', zoneSection['.name'], 'output', 'ACCEPT');
		uci.set('firewall', zoneSection['.name'], 'forward', 'ACCEPT');

		if (!umdnsNetworkList.includes(sectionId)) {
			umdnsNetworkList.push(sectionId);
			uci.set_first('umdns', 'umdns', 'network', umdnsNetworkList);
		}
	} else {
		uci.set('firewall', zoneSection['.name'], 'input', 'ACCEPT');
		uci.set('firewall', zoneSection['.name'], 'output', 'ACCEPT');
		uci.set('firewall', zoneSection['.name'], 'forward', 'ACCEPT');

		setDefaultWanFirewallRules(zoneSection.name);

		if (umdnsNetworkList.includes(sectionId)) {
			umdnsNetworkList = umdnsNetworkList.filter(n => n !== sectionId);
			uci.set_first('umdns', 'umdns', 'network', umdnsNetworkList.length > 0 ? umdnsNetworkList : null);
		}
	}

	if (primaryLocal) {
		uci.set('camera-onvif-server', 'rpicamera', 'interface', sectionId);
	}
}
/**
 * Remove any leftover disabled wifi ifaces (that aren't the default).
 *
 * Users find it confusing when 'extra' interfaces are left around in a disabled
 * state after running the wizard (in particular with prplmesh). Therefore we
 * delete them.
 *
 * Note this can only be run safely at the end of the wizard, as before this point
 * it's not clear which interfaces are safe to remove.
 */
function removeExtraWifiIfaces() {
	for (const iface of uci.sections('wireless', 'wifi-iface')) {
		if (iface.disabled !== '1' || iface['.name'] === `default_${iface.device}`) {
			continue;
		}

		uci.remove('wireless', iface['.name']);
	}
}

/* When we first load the wizard, we attempt a partial reset of the uci config.
 *
 * However, we only reset what we think we understand, primarily making sure:
 *  - every wifi device is enabled, and a whitelist is applied based on type
 *    (i.e. to only include fields we want to persist, like country/channel/bcf;
 *    primarily, whatever hotplug sets up)
 *  - all wifi ifaces are disabled (wizard should control any enablement)
 *  - any proto batadv network is disabled
 *  - prplmesh is disabled
 *  - all forwarding rules are disabled (enabled 0)
 *  - all dnsmasq instances are disabled
 */
function resetUci() {
	for (const device of uci.sections('wireless', 'wifi-device')) {
		// NB leaving 'disabled' out of the whitelist ensures the device is enabled.
		whitelistFields('wireless', device, [
			'type', 'path', 'band', 'hwmode', 'htmode', 'reconf', 'bcf', 'country', 'channel',
			'cell_density', 'txpower',
		]);
	}

	// Remove all dnsmasqs that are limited to particular interfaces
	// (this makes the configuration complicated for us to deal with).
	for (const dnsmasq of uci.sections('dhcp', 'dnsmasq')) {
		if (dnsmasq['interface'] || L.toArray(dnsmasq['notinterface']).find(iface => iface != 'loopback')) {
			uci.remove('dhcp', dnsmasq['.name']);
		}
	}

	if (uci.sections('dhcp', 'dnsmasq').length > 1) {
		// Even after we've removed all the scoped ones, we still have multiple. This
		// is probably a broken configuration, so let's just remove everything.
		for (const dnsmasq of uci.sections('dhcp', 'dnsmasq')) {
			uci.remove('dhcp', dnsmasq['.name']);
		}
	}

	const remainingDnsmasq = uci.sections('dhcp', 'dnsmasq');
	if (remainingDnsmasq.length === 1) {
		// The dubious rationale for this whitelist is 'fields that are set in the default
		// OpenWrt conf that are different from the default dnsmasq conf'.
		// Basically, this prevents us arbitrarily mutating config without having
		// to know these defaults.
		whitelistFields('dhcp', remainingDnsmasq[0], [
			'authoritative', 'domainneeded', 'localise_queries', 'readethers',
			'local', 'domain', 'expandhosts', 'localservice', 'cachesize',
			'ednspacket_max', 'rebind_localhost',
		]);
	}

	// If it's a known interface that the wizard likes to use, clean out anything that
	// could interfere. We can leave the other interfaces alone after disabling them
	// (which will allow people to keep non-wizard interfaces around safely).
	const { morseMeshApInterfaceName, morseInterfaceName, wifiDevices } = readSectionInfo();
	const knownInterfaces = new Set([morseMeshApInterfaceName, morseInterfaceName, ...wifiDevices.map(s => s.apInterfaceName), ...wifiDevices.map(s => s.staInterfaceName)]);

	for (const iface of uci.sections('wireless', 'wifi-iface')) {
		if (knownInterfaces.has(iface['.name'])) {
			whitelistFields('wireless', iface, ['network', 'device', 'key', 'encryption', 'mode', 'ssid', 'mesh_id']);
		}

		// Set all interfaces to disabled. This has to occur after white-listing,
		// since white-listing might try to remove 'disabled'.
		uci.set('wireless', iface['.name'], 'disabled', '1');
	}

	uci.set('prplmesh', 'config', 'enable', '0');
	uci.set('matter', 'config', 'enable', '0');
	resetUciNetworkTopology();
}

/**
 * This function resets only the parts of UCI that are touched by the complex wizard options.
 *
 * It's currently called every time an option changes so that parseWizardOptions is easier
 * to reason about, not having to consider interference from previous settings
 * OR interference from its own behaviour as different options are selected
 * (since it's frequently re-evaluated as the diagram is rerendered before the end
 * of the wizard).
 *
 * WARNING: one should never have an option that's directly part of the normal form here unless
 * using .forcewrite, as resetting may change the value underneath and cause it to
 * not write a 'new' value since it thinks it's unnecessary (isEqual check).
 *
 * (remembering that both AbstractValue and uci.js have a caching layer over
 * the actual data)
 */
function resetUciNetworkTopology() {
	// Disable all forwarding.
	for (const forwarding of uci.sections('firewall', 'forwarding')) {
		uci.set('firewall', forwarding['.name'], 'enabled', '0');
	}

	// Remove all rules.
	for (const rule of uci.sections('firewall', 'rule')) {
		uci.remove('firewall', rule['.name']);
	}

	// Remove any masquerade/mtu_fix.
	for (const zone of uci.sections('firewall', 'zone')) {
		uci.unset('firewall', zone['.name'], 'mtu_fix');
		uci.unset('firewall', zone['.name'], 'masq');
	}

	// Ignore all dhcp range sections (effectively disabling dhcp on all interfaces).
	for (const dhcp of uci.sections('dhcp', 'dhcp')) {
		// We keep the basic ip ranges, though. This means that wizards
		// are less likely to mess with custom configured ranges, at
		// the risk of persisting broken ranges.
		whitelistFields('dhcp', dhcp, [
			'start', 'leasetime', 'limit', 'interface',
		]);
		uci.set('dhcp', dhcp['.name'], 'ignore', '1');
	}

	// Remove any bridges; they might cause unexpected devices to be instantiated,
	// or be carrying confusing names/properties (e.g. br-prpl with forced MAC).
	for (const device of uci.sections('network', 'device')) {
		if (device.type === 'bridge') {
			uci.remove('network', device['.name']);
		}
	}

	for (const iface of uci.sections('network', 'interface')) {
		// Do not mess with the loopback device.
		if (iface['device'] === 'lo') {
			continue;
		}

		// Remove any ad-hoc things.
		// Remove batman device and interfaces
		if (iface['proto'] == 'batadv') {
			uci.remove('network', iface['.name']);
		}

		if (iface['proto'] == 'batadv_hardif') {
			uci.remove('network', iface['.name']);
		}

		uci.unset('network', iface['.name'], 'gateway');
		uci.unset('network', iface['.name'], 'device');
	}
}

/**
 * Represents a page in the wizard.
 *
 * Add options to the page in the same way you would with a section,
 * calling `.option`.
 *
 * Usage:
 *
 *   page = new WizardPage(section, 'Blah', 'Some useful info')
 *   page.option(...);
 *
 * Currently only supports NamedSections, as we rely on an explicit
 * section_id. Could be relatively trivially extending to support
 * multiple sections in the same page, but for now we don't need this.
 */
let wpId = 0;
class WizardPage {
	constructor(section, title, infobox) {
		this.title = title;
		this.infobox = infobox;
		this.options = [];
		this.section = section;
		this.wpId = ++wpId;
		this.diagramArgs = null;
	}

	enableDiagram(args = {}) {
		this.diagramArgs = args;
	}

	updateInfoText(infoText, wizardView) {
		// Update both the page and the currently displayed element
		wizardView.infoboxEl.innerHTML = infoText;
		this.infobox = infoText;
	}

	setNavActive(active) {
		for (const option of this.options) {
			const el = document.getElementById(option.cbid(option.section.section));
			if (el) {
				el.closest('.cbi-value').classList[active ? 'remove' : 'add']('hidden-nav');
			} else {
				console.error('Internal error - missing cbid:', option.cbid(option.section.section));
			}

			// At the moment, we only update 'dynamic' options when shown on a page
			// (since they're currently only used for the final messages).
			// If it was important to do it in a general way, we could copy the approach
			// from config.js (attachDynamicUpdateHandlers).
			if (option.dynamic) {
				option.renderUpdate(option.section.section);
			}
		}
	}

	// Page is active if any options on the page are active.
	isActive() {
		for (const option of this.options) {
			if (option.isActive(option.section.section)) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Add an option; passes through to the current section.
	 *
	 * Warning: this pretends that it will display options in the order
	 * added, but because the Section actually renders the options
	 * the actual order will be determined by the section order.
	 */
	option(...args) {
		const option = this.section.option(...args);
		option.page = this;
		this.options.push(option);

		return option;
	}

	html(html) {
		// This just has to be distinct.
		const fakeId = `__dummy_${this.wpId}-${this.options.length}`;
		let val;
		if (typeof html === 'function') {
			val = this.option(morseui.DynamicDummyValue, fakeId);
			val.cfgvalue = html;
		} else {
			val = this.option(form.DummyValue, fakeId);
			val.cfgvalue = _ => html;
		}
		val.rawhtml = true;
		return val;
	}

	message(contents, messageType = 'warning') {
		return this.html(E('div', { class: `alert-message ${messageType}` }, contents));
	}

	step(contents) {
		return this.html(E('div', { class: 'wizard-step' }, ['· ', E('span', {}, contents)]));
	}

	heading(contents) {
		return this.html(E('h3', {}, contents));
	}
}

/**
 * View which provides a 'wizard' view of a map.
 *
 * This works by pushing the actions into a buttom navbar and
 * showing only one page at a time.
 *
 * How to use:
 *  - create an ordinary map and sections in that map
 *  - call .page with a section (different pages can refer to the same section)
 *  - rather than calling section.option, call page.option which will
 *    attach options to both the section and the page
 *
 * Pages are only visible if an option in the page is visible
 * (i.e. they can be hidden if all included options are failing dependency checks).
 */
const AbstractWizardView = view.extend({
	__init__(title, description, diagramName, map /* , ... */) {
		this.pages = [];
		this.title = title;
		this.description = description;
		this.finished = false;
		this.diagramName = diagramName;
		this.diagram = null;
		this.map = map;

		// We need the close button ASAP, because otherwise users will have no way
		// of escaping the wizard if we blow up during load.
		// It's safe to do this here without waiting for the render since luci loads the
		// view separately from the header.
		this.closeButton = document.querySelector('body header button.close');
		this.closeButton.onclick = () => this.exit();

		return this.super('__init__', this.varargs(arguments, 3));
	},

	/* When an option relevant to the diagram changes, call this
	 * from the onchange handler.
	 *
	 * If anything fails here (i.e. usually an option parse)
	 * we want to ignore it, as we can't sensibly update the diagram
	 * and if the option is bad the standard form elements will
	 * give feedback to the user.
	 */
	onchangeOptionUpdateDiagram(option) {
		if (!option.page.diagramArgs) {
			// i.e. if page doesn't have diagram enabled, nothing to do here.
			return;
		}

		const sectionId = option.section.section;
		option.parse(sectionId)
			.then(() => {
				// Unfortunately, after parsing we have to redo the load to ensure
				// the cached value in AbstractValue is correct.
				option.cfgvalue(sectionId, option.load(sectionId));
				this.updateDiagram(option.page);
			})
			// ignore errors - if the parse failed, we can't update the diagram,
			// and user should be notified of failure by ordinary form validation errors.
			// Note that parse is a bit of a misnomer - it both parses the options
			// and writes it if necessary.
			.catch(e => e);
	},

	/* Returns the result of getBuiltinEthernetPorts.
	 */
	getEthernetPorts() {
		return this.ethernetPorts;
	},

	getEthernetStaticIpOriginal() {
		return this.ethernetStaticIpOriginal;
	},

	updateDiagram(page) {
		if (!page.diagramArgs) {
			// i.e. if page doesn't have diagram enabled, nothing to do here.
			return;
		}

		this.parseWizardOptions();
		this.diagram.updateFrom(uci, this.ethernetPorts, page.diagramArgs);
	},

	/**
	 * Adds a WizardPage to our view.
	 *
	 * Arguments are passed through to WizardPage.
	 *
	 * @param  {...any} args
	 * @returns {WizardPage}
	 */
	page(...args) {
		const page = new WizardPage(...args);
		this.pages.push(page);
		return page;
	},

	exit() {
		if (this.finished) {
			// If we're finished, we should have reset the homepage so we can redirect to there.
			const homepage = L.url();
			const originalIp = this.getEthernetStaticIpOriginal();
			const newIp = morseuci.getEthernetStaticIp(this.getEthernetPorts());

			// TODO: See APP-2041 for improving IP change logic.
			if (newIp && window.location.hostname === originalIp && originalIp !== newIp) {
				// Not explicitly setting homepage forces the login redirect to happen.
				// If we immediately send to the correct page, the sysauth_http cookie is
				// not included.
				window.location.href = `${window.location.protocol}//${newIp}`;
			} else {
				window.location = homepage;
			}
			return;
		}

		if (this.currentPageIndex !== 0) {
			ui.showModal(_('Abort HaLow Configuration Wizard'), [
				E('p', _(`Leaving the wizard will discard any selections you've made.
					  You can return to the wizard by going to the 'Wizards' menu item.`)),
				E('div', { class: 'right' }, [
					E('button', {
						class: 'btn',
						click: ui.hideModal,
					}, _('Cancel')), ' ',
					E('button', {
						class: 'btn cbi-button cbi-button-negative important',
						click: ui.createHandlerFn(this, 'abort'),
					}, _('Proceed')),
				]),
			]);
		} else {
			this.abort();
		}
	},

	async abort() {
		if ([L.env.requestpath.join('/'), 'admin/selectwizard'].includes(uci.get('luci', 'main', 'homepage'))) {
			await directUciRpc.delete('luci', 'main', 'homepage');
			await directUciRpc.commit('luci');
		}
		window.location.href = L.url();
	},

	renderBadConfigError(errorMessage) {
		return E('div', { id: 'wizard-bad-config', class: 'alert-message warning' }, _(`
			Configuration incompatible with config wizard detected (%s). If you wish
			to use the wizard, you should <a href="%s">reset or reflash your device</a>.
		`).format(errorMessage, L.url('admin', 'system', 'flash')));
	},

	renderIPChangeAlert() {
		const originalStaticIp = this.getEthernetStaticIpOriginal();
		const staticIp = morseuci.getEthernetStaticIp(this.getEthernetPorts());
		let text;
		if (originalStaticIp && !staticIp) {
			text = _(`
				The IP associated with your ethernet port(s) will now be obtained via DHCP.
				To access this admin interface after clicking <b>Apply</b>, you should find
				the IP address allocated by your network's DHCP server, and enter the
				new location in your browser.
			`);
		} else if (originalStaticIp && staticIp && staticIp !== originalStaticIp) {
			text = _(`
				The static IPv4 address of this device is changing! It was previously
				%s. To access this admin interface, you may need to
				disconnect and reconnect, then check your new router address from DHCP.
			`).format(this.getEthernetStaticIpOriginal(), staticIp);
		} else if (!originalStaticIp && staticIp) {
			text = _(`
				This device has a new static IPv4 address, %s! 
				To access this admin interface over ethernet, you may need to
				disconnect and reconnect, then go to the new IP.
			`).format(staticIp);
		}

		if (text) {
			return E('div', { class: `alert-message warning` }, text + _(`
				If you lose access,
				see the <a target="_blank" href="%s">User Guide</a> for reset instructions.
			`).format(L.url('admin', 'help', 'guide')));
		} else {
			return E('div');
		}
	},

	async render(loadPagesResults) {
		if (this.configLoadError) {
			return this.renderBadConfigError(this.configLoadError);
		}

		const {
			morseDevice,
			wifiDevices,
		} = readSectionInfo();

		// If our wifi devices aren't enabled/configured, force the user
		// back to the landing page (which will do this for us).
		if (morseDevice.disabled === '1' || !morseDevice.country || wifiDevices.some(s => s.disabled === '1')) {
			window.location = L.url('admin', 'morse', 'landing');
			return;
		}

		// Clean out anything interesting looking from UCI so the wizard has a clean-ish run
		// at the config. Note that this does preserve some user set data
		// (e.g. IPs, SSIDs, keys) but generally removes any networking topology
		// or complex wifi options.
		//
		// It will also disable all wifi-ifaces.
		resetUci();

		// Construct our diagram.
		this.diagram = E(this.diagramName);

		let pages;
		try {
			pages = await this.renderPages(loadPagesResults);
		} catch (e) {
			if (!(e instanceof WizardConfigError)) {
				throw e;
			}

			return this.renderBadConfigError(e.message);
		}

		if (!pages) {
			return;
		}

		const html = E('div', { class: 'wizard-contents' }, [
			E('div', { class: 'header-section' }, [
				this.titleEl = E('h1', {}, this.title),
				this.descriptionEl = E('div', {}, this.description),
				this.pageTitleEl = E('h2'),
				this.diagram,
			]),
			pages,
			this.infoboxEl = E('div', { class: 'wizard-infobox alert-message notice' }),
		]);

		return html;
	},

	async load() {
		this.configLoadError = false;
		const criticalConfig = ['wireless', 'network', 'firewall', 'dhcp', 'system'];
		criticalConfig.push(...this.getExtraConfigFiles());

		const [builtinEthernetPorts, networkDevices] = await Promise.all([
			callGetBuiltinEthernetPorts(),
			network.getDevices(),
			uci.load(['luci']).catch((e) => {
				// If we don't even have luci, we won't be able to remove our homepage override!
				// We load this one separately so other breakages don't interfere with this,
				// since we want to try to persist the new homepage on abort().
				console.error(e);
				this.configLoadError = _('Missing critical configuration file');
			}),
			uci.load(criticalConfig).catch((e) => {
				console.error(e);
				this.configLoadError = _('Missing critical configuration file');
			}),
			// We need this so if prplmesh is enabled we can disable in the reset.
			uci.load('prplmesh').catch(() => null),
			// This allows us to switch the broadcast interface for camera-onvif-server
			// (again, if enabled).
			uci.load('camera-onvif-server').catch(() => null),
			// This will enable automated discovery of HaLow devices in applications
			// such as the range testing UI.
			uci.load('umdns').catch(() => null),
			configDiagram.loadTemplate(),
		]);

		this.ethernetPorts = morseuci.getEthernetPorts(builtinEthernetPorts, networkDevices);
		this.ethernetStaticIpOriginal = morseuci.getEthernetStaticIp(this.ethernetPorts);

		if (this.configLoadError) {
			return;
		}

		try {
			const result = await this.loadPages();
			this.loadWizardOptions();
			return result;
		} catch (e) {
			this.configLoadError = e;
			console.error(e);
		}
	},

	getExtraConfigFiles() {
		return [];
	},

	loadPages() {
		return Promise.resolve();
	},

	renderPages(_loadPagesResult) {
		L.error('InternalError', 'Not implemented');
	},

	/* This parses the 'fake' multi-options which are primarily about
	 * setting the network topology.
	 *
	 * This is called quite frequently to update the diagram, so it must
	 * take care that it can handle varying options (i.e. perform its
	 * own resets of its own options if necessary).
	 */
	parseWizardOptions() {
		L.error('InternalError', 'Not implemented');
	},

	loadWizardOptions() {
		L.error('InternalError', 'Not implemented');
	},

	/**
	 * Usually, addFooter deals with handleSave etc.
	 *
	 * In our case, we want the progress bar and nav controls in the footer,
	 * and want to turn the footer into a fixed navbar type thing (see wizard.css).
	 *
	 * It would be possible to reinstate the normal actions here
	 * by copying them from the existing addFooter, but for now we keep
	 * it simple (YAGNI?).
	 *
	 * @override
	 */
	addFooter() {
		if (document.getElementById('wizard-bad-config')) {
			return E('div');
		}

		const footer = E('div', { class: 'cbi-page-actions' }, [
			E('div', { class: 'container' }, [
				this.progressBarContainer = E('div', { class: 'cbi-progressbar' }, this.progressBar = E('div', { style: 'width: 50%' })),
				E('div', { class: 'cbi-page-actions-flex' }, [
					this.backButton = E('button', {
						class: 'cbi-button',
						click: classes.ui.createHandlerFn(this, 'handleBack'),
					}, [_('Back', 'Navigate backwards through a process')]),
					E('div', { style: 'flex-grow: 1' }),
					this.nextButton = E('button', {
						class: 'cbi-button cbi-button-action',
						click: classes.ui.createHandlerFn(this, 'handleNext'),
					}, [_('Next', 'Navigate forwards through a process')]),
					// This button should only be visible when next is not visible.
					this.applyButton = E('button', {
						class: 'cbi-button cbi-button-apply',
						click: classes.ui.createHandlerFn(this, 'handleApply'),
					}, [_('Apply')]),
					this.exitButton = E('button', {
						class: 'cbi-button cbi-button-action hidden',
						click: classes.ui.createHandlerFn(this, 'exit'),
					}, [_('Leave wizard', 'Exit a configuration wizard')]),
				]),
			]),
		]);

		for (const page of this.pages) {
			page.setNavActive(false);
		}

		this.gotoPage(this.getActivePages(), 0);

		return footer;
	},

	/** @private */
	getActivePages() {
		return this.pages.filter(page => page.isActive());
	},

	/** @private */
	gotoPage(pages, i) {
		if (i < 0 || i >= pages.length) {
			return;
		}

		const first = i === 0;

		// Creating a last page in the configuration as a second to last from
		// the exit page, which is to show up after Apply.
		const last = i === pages.length - 2;
		const exit = i === pages.length - 1;

		if (this.currentPage) {
			this.currentPage.setNavActive(false);
		}

		this.currentPage = pages[i];
		this.currentPage.setNavActive(true);
		this.currentPageIndex = i;
		// Silly hack to make sure we have progress at the start (when most pages
		// are not visible due to options not being selected).
		const perc = (i === 1 && pages.length === 3) ? 30 : i / (pages.length - 1) * 100;
		this.progressBar.style.width = `${perc}%`;

		this.titleEl.classList[first ? 'remove' : 'add']('hidden');
		this.descriptionEl.classList[first ? 'remove' : 'add']('hidden');
		this.diagram.classList[exit ? 'add' : 'remove']('hidden-nav');

		this.backButton.classList[first || exit ? 'add' : 'remove']('hidden');
		this.nextButton.classList[last || exit ? 'add' : 'remove']('hidden');
		this.applyButton.classList[last ? 'remove' : 'add']('hidden');
		this.exitButton.classList[exit ? 'remove' : 'add']('hidden');
		this.closeButton.classList[exit ? 'add' : 'remove']('hidden');

		if (this.currentPage.title) {
			this.pageTitleEl.innerHTML = this.currentPage.title;
			this.pageTitleEl.style.display = 'block';
		} else {
			this.pageTitleEl.style.display = 'none';
		}
		this.infoboxEl.innerHTML = this.currentPage.infobox;

		// Parse any options on the current page. This means that quirky things
		// that are happening - ok, we do some .loads which don't
		// properly reflect the underlying UCI for our default wifi SSID/keys
		// - are immediately pushed into uci when the page renders
		// so that the diagram will update.
		this.parseCurrentPage().then(() => this.updateDiagram(this.currentPage));
	},

	async parseCurrentPage() {
		const errs = [];
		await Promise.allSettled(this.currentPage.options.map(async (option) => {
			const sectionId = option.section.section;
			try {
				// Note that parse is a bit of a misnomer - it both
				// checks/reads the form value and writes it if necessary.
				await option.parse(sectionId);
			} catch (e) {
				errs.push(e.message);
				return;
			}

			// Usually, a parse is followed by a save and then options are
			// reloaded. In our situation, we aren't using this mechanism,
			// so we manually repopulate the form value with the updated
			// value in UCI. This makes sure that any subsequent AbstractValue.parse
			// doesn't get confused and think that something doesn't need
			// to be persisted because it's already that value.
			// IMO this is a bug in AbstractValue - parse should call .cfgvalue
			// after calling .write.
			option.cfgvalue(sectionId, option.load(sectionId));
		}));
		return errs;
	},

	async handleNext() {
		const pages = this.getActivePages();
		const i = pages.indexOf(this.currentPage);
		if (i === -1 || i === pages.length - 1) {
			return;
		}

		const errs = await this.parseCurrentPage();
		if (errs.length === 0) {
			this.gotoPage(pages, i + 1);
		} else {
			// Initially, I disabled the Next button if parse failed. This has a couple of problems:
			// - it's messy hooking into into LuCI, as there's no clean way to
			//   list to all widget-changes in the section (unless we modify upstream).
			//   A quick hack would be to override checkDepends in the map and then
			//   add an onchange callback to this, but we still end up with a lot of unnecessary
			//   parse() and it's pretty ugly.
			// - disabled buttons currently don't show tooltips.
			ui.showModal(_('Selections not completed'), [
				E('div', {}, errs.map(err => E('p', {}, [E('em', { style: 'white-space:pre-wrap' }, err)]))),
				E('div', { class: 'right' }, [
					E('button', { class: 'cbi-button', click: ui.hideModal }, [_('Dismiss')]),
				]),
			]);
		}
	},

	/**
	 * Save and immediately commit/apply the changes.
	 *
	 * Unlike the standard handleSaveApply, this does _not_ attempt any rollbacks.
	 * Because of the way we reconfigure the device in the wizard, either the user
	 * is likely be able to use the existing IP or it's hard to predict the IP
	 * (DHCP). We could attempt to use the hostname (i.e. myhostname.privlan
	 * or myhostname.lan), but for now we don't attempt anything fancy.
	 *
	 * @param {Event} ev
	 */
	async handleApply(_ev) {
		try {
			// Start of the this.map.save logic, but we don't load/renderContents afterwards.
			this.map.checkDepends();

			await this.map.parse();
			await this.save();

			if (!(new URL(document.location).searchParams.get('debug'))) {
				const res = await callUciApply(0, false);
				// 5 is no data - i.e. nothing to apply.
				// It's hard to detect this otherwise with the existing calls
				// (changes will return all the changes, which we don't need).
				if (![0, 5].includes(res)) {
					L.raise('RPCError', 'RPC call to uci/apply failed with ubus code %d: %s',
						res, rpc.getStatusText(res));
				}
			}
		} catch (e) {
			ui.showModal(_('Save error'), [
				E('p', {}, [_('An error occurred while saving the form:')]),
				E('p', {}, [E('em', { style: 'white-space:pre-wrap' }, [e.message])]),
				E('div', { class: 'right' }, [
					E('button', { class: 'cbi-button', click: () => window.location = window.location.href }, [_('Reload')]),
				]),
			]);
			console.error(e);
			return;
		}

		this.finished = true;

		// Remove the apply and infobox instruction and start fake timer.
		this.nextButton.classList.add('hidden');
		this.backButton.classList.add('hidden');
		this.applyButton.classList.add('hidden');
		this.progressBarContainer.classList.add('hidden');
		this.infoboxEl.classList.add('hidden');

		ui.changes.displayStatus('notice spinning', E('p', _('Applying configuration changes…')));

		// A usual LuCI apply waits for apply_holdoff (default 4 secs) then starts checking
		// whether the device is live. Since we _don't_ check whether the device is live,
		// as there's a decent chance that network reconfigurations will make us lose the
		// connection, we cross our fingers and wait for twice apply_holdoff.
		setTimeout(() => {
			const pages = this.getActivePages();
			document.dispatchEvent(new CustomEvent('uci-applied'));

			ui.changes.setIndicator(0);
			ui.changes.displayStatus(false);

			this.gotoPage(pages, pages.length - 1);
		}, L.env.apply_holdoff * 2 * 1000);
	},

	handleBack() {
		const pages = this.getActivePages();
		const i = pages.indexOf(this.currentPage);
		if (i === -1 || i === 0) {
			return;
		}

		this.gotoPage(pages, i - 1);
	},

	async save() {
		// Parse/uci.set our fake wizard section...
		this.parseWizardOptions();

		// Configure B.A.T.M.A.N. advanced
		let batmanDeviceName;
		let isMeshGate = uci.get('mesh11sd', 'mesh_params', 'mesh_gate_announcements') === '1';
		if (isMeshGate) {
			// Setup batman device & interface
			// Note that we always call the batman device 'bat0' and the interface 'batmesh0'
			// so that scripts and firewall rules etc. can rely on these names.
			// Batman will be configured as server (i.e. gateway mode) because we're a mesh gate.
			batmanDeviceName = morseuci.setupBatmanDeviceOnNetwork('server');
			// We have to call save here so that the device is present
			// when we call setupBatmanInterfaceOnDevice.
			await uci.save();
		} else {
			// Setup batman device & interface
			// Note that we always call the batman device 'bat0' and the interface 'batmesh0'
			// so that scripts and firewall rules etc. can rely on these names.
			batmanDeviceName = morseuci.setupBatmanDeviceOnNetwork('client');
			// We have to call save here so that the device is present
			// when we call setupBatmanInterfaceOnDevice.
			await uci.save();
		}

		// Setup the batman interface on the batman device.
		// Attach it to the ahwlan device.
		// Attach the halow mesh interface to the batman device.
		morseuci.setupBatmanInterfaceOnDevice();

		// And now we can remove it.
		uci.remove('network', 'wizard', 'wizard');

		// Wipe out custom homepage.
		// We don't want this in parseWizardOptions because it shouldn't be done
		// every time for the diagram, only when we actually go to save
		// (otherwise it will mess up the .abort logic).
		if ([L.env.requestpath.join('/'), 'admin/selectwizard'].includes(uci.get('luci', 'main', 'homepage'))) {
			uci.set('luci', 'main', 'homepage', null);
		}

		if (!uci.get('luci', 'wizard')) {
			uci.add('luci', 'wizard', 'wizard');
		}

		uci.set('luci', 'wizard', 'used', '1');

		removeExtraWifiIfaces();

		await uci.save();
	},
});

return baseclass.extend({
	AbstractWizardView,
	readSectionInfo,
	readEthernetPortInfo,
	directUciRpc,
	resetUci,
	resetUciNetworkTopology,
	setupNetworkIface,
	WizardConfigError,
});
