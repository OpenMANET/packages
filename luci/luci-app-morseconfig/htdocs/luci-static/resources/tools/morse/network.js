'use strict';
/* globals baseclass network */
'require network';
'require baseclass';

/* Helpers to interact with actual device info.
 * (cf uci.js, which is purely UCI config manipulation).
 */

/**
 * Find the Morse device physical interface name (not the uci name)
 * by checking for the MorseMicro OUI.
 *
 * @returns {Promise<String>} interface name (e.g. wlan0)
 */
async function getMorseDeviceInterface() {
	const devices = await network.getDevices();
	const morseDevice = devices.find(d => d.getWifiNetwork() && d.getWifiNetwork().ubus('dev', 'iwinfo', 'hwmodes')?.includes('ah'));

	return morseDevice?.device;
}

return baseclass.extend({
	getMorseDeviceInterface,
});
