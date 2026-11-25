/* This provides an interface to cameras on the local network.
 *
 * Main functionality:
 *  - discover cameras via ONVIF and show info
 *  - use MediaMTX to create proxy streams on the AP
 *    (so they're viewable in the browser and can
 *    be reliably accessed in case the IP cameras
 *    aren't accessible by the client)
 *  - provide a live view of the camera stream
 *    that allows tweaking of parameters via ONVIF
 *
 * It looks a bit like this:
 *
 *     camera.js -> openwrt_ap:8889/* (WebRTC video streams)
 *      |
 *     ubus (on openwrt_ap) -> /usr/lib/rpcd/onvif.so -> ONVIF IP cameras on network
 *                          -> /usr/libexec/mediamtx -> openwrt_ap:9997 (mediamtx API)
 *
 * i.e. we communicate with both (remote) ONVIF cameras and MediaMTX (on the AP)
 * via rpcd plugins.
 */

'use strict';

/* globals form rpc uci ui videolive view */
'require form';
'require rpc';
'require view';
'require uci';
'require ui';

'require view.cameras.videolive as videolive';

document.querySelector('head').appendChild(E('link', {
	rel: 'stylesheet',
	type: 'text/css',
	href: L.resourceCacheBusted('view/cameras/css/custom.css'),
}));

const RESTART_PAUSE = 1000;

var callLuciNetworkDevices = rpc.declare({
	object: 'luci-rpc',
	method: 'getNetworkDevices',
	expect: { '': {} },
	reject: true,
});

const onvif = {
	probe: rpc.declare({
		object: 'onvif',
		method: 'probe',
		params: ['multicast_ip', 'clear_cache'],
		expect: { devices: [] },
		reject: true,
	}),

	info: rpc.declare({
		object: 'onvif',
		method: 'info',
		params: ['device_url', 'username', 'password'],
		expect: { '': {} },
		reject: true,
	}),

	set_encoder: rpc.declare({
		object: 'onvif',
		method: 'set_encoder',
		params: ['media_url', 'username', 'password', 'encoder_token', 'config'],
		expect: { '': {} },
		reject: true,
	}),

	set_imaging: rpc.declare({
		object: 'onvif',
		method: 'set_imaging',
		params: ['imaging_url', 'username', 'password', 'source_token', 'settings'],
		expect: { '': {} },
		reject: true,
	}),

	get_stream: rpc.declare({
		object: 'onvif',
		method: 'get_stream',
		params: ['media_url', 'username', 'password', 'encoder_token', 'source_config_token'],
		expect: { stream_url: '' },
		reject: true,
	}),
};

const mediamtx = {
	set_proxy: rpc.declare({
		object: 'mediamtx',
		method: 'set_proxy',
		params: ['stream_url'],
		reject: true,
	}),

	get_ports: rpc.declare({
		object: 'mediamtx',
		method: 'get_ports',
		params: [],
		reject: true,
	}),
};

// Load uci section style config (flat object), and make it nested by interpreting '__'
// as a reference to a dict field. i.e. resolution__height => {resolution: {height: ...}}
// Also find things that look like numbers and make them numbers, which is a terrible
// idea that I will probably curse myself for.
function uciToJson(o, target = {}) {
	for (const [k, v] of Object.entries(o || {})) {
		const loc = k.split('__');
		const finalField = loc.pop();
		let currTarget = target;
		for (const field of loc) {
			currTarget = (currTarget[field] ??= {});
		}
		currTarget[finalField] = /^\d+$/.test(v) ? Number(v) : v;
	}

	return target;
}

function jsonToUci(o, key = null, target = {}) {
	// Turn {resolution: {height: ...}} into resolution__height ...
	if (!(o instanceof Object)) {
		target[key] = o;
		return target;
	}

	for (const [subKey, subValue] of Object.entries(o)) {
		jsonToUci(subValue, key ? `${key}__${subKey}` : subKey, target);
	}

	return target;
}

function makeSimpleErrorString(err) {
	// Frustratingly, luci's raise decides to attach the stack to the message
	// and the rpcd error handling code doesn't set the original error
	// on the object.
	return err.message.split('\n')[0].split(':').pop();
}

const ENCODER_DEFAULT_FIELDS = new Set([
	'resolution__width', 'resolution__height', 'quality', 'bitrate', 'govlength',
	'encoding', 'profile', 'framerate',
]);
class EncoderDefaults {
	constructor() {
		this.observers = [];
		this.load();
	}

	registerObserver(o) {
		this.observers.push(o);
	}

	get() {
		return this.config;
	}

	load() {
		this.config = uciToJson(uci.get('cameras', 'encoder_defaults'));
	}

	save(c) {
		for (const [k, v] of Object.entries(jsonToUci(c))) {
			if (ENCODER_DEFAULT_FIELDS.has(k)) {
				uci.set('cameras', 'encoder_defaults', k, v);
			}
		}

		this.config = c;
		for (const o of this.observers) {
			o();
		}
		// TODO handle failure.
		uci.save();
	}
}

function getSectionNameFromUrl(streamUrl) {
	// regular expression to extract IP address and port from stream URL
	const regex = /\/\/(\d+\.\d+\.\d+\.\d+):(\d+)\//;
	const match = streamUrl.match(regex);
	var resultString = null;

	if (match) {
		const ipAddress = match[1].replace(/\./g, ''); // Remove dots from IP address
		const port = match[2];
		resultString = `${ipAddress}_${port}`;
	}
	return resultString;
}

let NEXT_ID = 1;

class ONVIFDevice {
	constructor(encoderDefaults, endpointReferenceAddress, deviceUrl, username, password) {
		this.id = NEXT_ID++;
		this.encoderDefaults = encoderDefaults;
		this.endpointReferenceAddress = endpointReferenceAddress;
		this.deviceUrl = deviceUrl;
		const url = new URL(deviceUrl);
		this.webUrl = `${url.protocol}//${url.host}/`;
		this.username = username;
		this.password = password;
		this.info = null;
		this.streamUrl = null;
		this.awsStreamId = null;
		this.receiver = null;
		this.encoderToken = null;
		this.sourceToken = null;
		this.sourceConfigToken = null;
		this.videoElement = null;
		this.queryFailure = null;
		this.proxyUrls = {};

		this.encoderDefaults.registerObserver(() => {
			if (this.encoderInfoCell) {
				this.encoderInfoCell.replaceChildren(...this.renderEncoderInfo());
			}
		});
	}

	get hostname() {
		return this.info?.hostname;
	}

	get model() {
		return this.info?.model;
	}

	get firmware_version() {
		return this.info?.firmware_version;
	}

	get encoder() {
		return this.info.media.encoders[this.encoderToken];
	}

	get source() {
		return this.info.media.sources[this.sourceToken];
	}

	get source_config() {
		return this.info.media.sources[this.sourceToken].configs[this.sourceConfigToken];
	}

	get endpointReference() {
		return `${this.endpointReferenceAddress}`.replace(/\W/, '_');
	}

	async requestInfo() {
		try {
			this.info = await onvif.info(this.deviceUrl, this.username, this.password);
			this.encoderToken = Object.keys(this.info.media.encoders)[0];
			this.sourceToken = Object.keys(this.info.media.sources)[0];
			this.sourceConfigToken = Object.keys(this.source.configs)[0];
		} catch (e) {
			this.reportQueryFailure(e);
		}
	}

	async requestStream() {
		try {
			this.streamUrl = await onvif.get_stream(this.info.media_url, this.username, this.password, this.encoderToken, this.sourceConfigToken);
		} catch (e) {
			this.reportQueryFailure(e);
		}
	}

	// this.queryFailure retains the _first_ query failure. Call discardQueryFailure if we want to start
	// a new set of queries.
	resetQueryFailure() {
		this.queryFailure = null;
	}

	reportQueryFailure(e) {
		console.error(e);
		this.queryFailure ??= makeSimpleErrorString(e);
	}

	async updateEncoderConfig(config, attributeChange = false) {
		// TODO don't attempt invalid settings? Or adjust to closest?
		await onvif.set_encoder(this.info.media_url, this.username, this.password, this.encoderToken, config);
		Object.assign(this.encoder, config);

		if (this.encoderInfoCell) {
			this.encoderInfoCell.replaceChildren(...this.renderEncoderInfo());
		}

		// If it's _not_ an attribute change on our video live elemnent that caused this,
		// then we should update the attributes on the video live element as they'll
		// be out of sync. But we have to stop observing them to avoid a loop...
		if (this.videoElement && !attributeChange) {
			this.stopSettingsObserver();
			for (const field of ['bitrate', 'framerate', 'resolution']) {
				if (!config[field]) {
					continue;
				}

				this.videoLive.setAttribute(field,
					field === 'resolution'
						? `${config[field].width}x${config[field].height}`
										   : config[field]);
			}
			this.startSettingsObserver();
		}
	}

	async updateImagingConfig(config) {
		await onvif.set_imaging(this.info.imaging_url, this.username, this.password, this.sourceToken, config);
		Object.assign(this.source.imaging, config);
	}

	stopSettingsObserver() {
		this.settingsObserver.disconnect();
	}

	startSettingsObserver() {
		this.settingsObserver.observe(this.videoLive, { attributeFilter: ['bitrate', 'brightness', 'framerate', 'resolution'] });
	}

	setProxyUrls(proxyUrls) {
		this.proxyUrls = proxyUrls;
	}

	renderInfoRow(liveViewElement) {
		const cells = [
			E('td', { class: 'td cbi-section-table-cell' }, E('a', { href: this.webUrl }, this.hostname ?? 'Unknown')),
			E('td', { class: 'td hide-sm cbi-section-table-cell' }, this.model ?? ''),
			E('td', { class: 'td hide-sm cbi-section-table-cell' }, this.firmware_version ?? ''),
		];

		if (this.queryFailure) {
			cells.push(E('td', { class: 'td center cbi-section-table-cell', colspan: '3' }, _('Error: %s').format(this.queryFailure)));
			this.encoderInfoCell = null;
		} else {
			this.encoderInfoCell = E('td', { class: 'td center' }, this.renderEncoderInfo());
			cells.push(this.encoderInfoCell);
			cells.push(E('td', { class: 'td center cbi-section-table-cell' }, this.renderStreamLinks()));
			cells.push(E('td', { class: 'td center cbi-section-table-cell' }, this.renderAwsInfo()));
		}

		cells.push(E('td', { class: 'td center cbi-section-table-cell' }, liveViewElement));
		return E('tr', { 'class': 'row cbi-section-table-row', 'data-url': this.deviceUrl, 'data-sortkey': this.hostname }, cells);
	}

	async renderEncoderForm() {
		const formFields = ['resolution', 'bitrate', 'framerate', 'profile', 'quality', 'govlength'];
		const encodingOptions = this.encoder.options.encoding[this.encoder.encoding];

		const name = _('Encoder configuration: ') + this.hostname;
		const config = { encoder_config: {} };
		for (const field of formFields) {
			if (field === 'resolution') {
				config.encoder_config.resolution = `${this.encoder.resolution.width}x${this.encoder.resolution.height}`;
			} else {
				config.encoder_config[field] = this.encoder[field];
			}
		}
		const m = new form.JSONMap(config);
		const s = m.section(form.NamedSection, 'encoder_config');
		let o;

		if (encodingOptions.resolution.length > 1) {
			o = s.option(form.ListValue, 'resolution', _('Resolution'));
			for (const resolution of encodingOptions.resolution) {
				const v = `${resolution.width}x${resolution.height}`;
				o.value(v, v);
			}
		}

		o = s.option(form.Value, 'bitrate', _('Bitrate (kbps)'));
		// Ideally, this should come from the ONVIF server, but it requires an extension, so for now...
		// These 'defaults' are also in videolive.js.
		o.datatype = 'range(100, 10000)';

		if (encodingOptions.framerate_range.min < encodingOptions.framerate_range.max) {
			o = s.option(form.Value, 'framerate', _('Framerate (fps)'));
			o.datatype = `range(${encodingOptions.framerate_range.min}, ${encodingOptions.framerate_range.max})`;
		}

		if (encodingOptions.profile.length > 1) {
			o = s.option(form.ListValue, 'profile', _('Profile'));
			for (const profile of encodingOptions.profile) {
				o.value(profile, profile);
			}
		}

		if (this.encoder.options.quality_range.min < this.encoder.options.quality_range.max) {
			o = s.option(form.Value, 'quality', _('Quality'));
			o.datatype = `range(${this.encoder.options.quality_range.min}, ${this.encoder.options.quality_range.max})`;
		}

		if (encodingOptions.govlength_range.min < encodingOptions.govlength_range.max) {
			o = s.option(form.Value, 'govlength', _('GOV length (key frame interval)'));
			o.datatype = `range(${encodingOptions.govlength_range.min}, ${encodingOptions.govlength_range.max})`;
		}

		const save = () => {
			m.save();
			const orig_config = Object.assign({}, config.encoder_config);
			const [width, height] = orig_config.resolution.split('x').map(Number);
			orig_config.resolution = { width, height };
			for (const field of ['bitrate', 'quality', 'framerate', 'govlength']) {
				orig_config[field] = Number(orig_config[field]);
			}

			// TODO handleError...
			this.updateEncoderConfig(orig_config);
			ui.hideModal();
			return orig_config;
		};

		const saveAsDefault = () => {
			this.encoderDefaults.save(save());
		};

		ui.showModal(name, [
			await m.render(),
			E('div', { class: 'right' }, [
				E('button', { class: 'cbi-button', click: ui.hideModal }, _('Dismiss')), ' ',
				E('button', { class: 'cbi-button cbi-button-positive', click: save }, _('Save')), ' ',
				E('button', { class: 'cbi-button cbi-button-action', click: saveAsDefault }, _('Save as Default')),
			]),
		]);
	}

	renderEncoderInfo() {
		if (!this?.info?.media) {
			return [this.queryFailure || _('Unavailable')];
		}

		const infoString = `${this.encoder.resolution.width}x${this.encoder.resolution.height}@${this.encoder.bitrate}kbps`;

		const diffs = [];
		for (const [key, val] of Object.entries(this.encoderDefaults.get())) {
			// uci info fields start with '.' (e.g. .type, .name)
			if (!key.startsWith('.') && JSON.stringify(val) !== JSON.stringify(this.encoder[key])) {
				diffs.push('%s is %s and not %s'.format(key, JSON.stringify(this.encoder[key]), JSON.stringify(val)));
			}
		}

		const info = E('a', { style: 'cursor: pointer', click: () => this.renderEncoderForm() }, infoString);

		if (diffs.length === 0) {
			return [info];
		} else {
			return [
				info, ' ',
				E('b', { style: 'cursor: help', title: _('Non-default settings:\n') + diffs.join('\n') }, '(!)'),
			];
		}
	}

	async renderAwsInfoForm() {
		const m = new form.Map('aws_kvs');
		const s = m.section(form.NamedSection, this.awsStreamId);
		let o;
		o = s.option(form.Flag, 'enable', _('AWS Stream On'));
		o = s.option(form.Value, 'access_key', _('AWS Access Key'));
		o = s.option(form.Value, 'secret_key', _('AWS Secret Key'));
		o.password = true;
		o = s.option(form.Value, 'stream_name', _('AWS Stream Name'));
		o = s.option(form.Value, 'region', _('AWS Region'));
		o = s.option(form.Value, 'storage_size', _('AWS Storage Size in MB'), _('Recommended storage size is 64MB'));
		o.datatype = 'range(10, 64)';
		o = s.option(form.Value, 'stream_url', _('AWS Stream URL'), _('RTSP URL of the stream'));
		o.default = this.streamUrl;

		const save = async () => {
			m.save();
			ui.changes.apply();
			ui.hideModal();
		};

		const name = _('AWS Video Stream Configuration: ');
		ui.showModal(name, [
			await m.render(),
			E('div', { class: 'right' }, [
				E('button', { class: 'cbi-button', click: ui.hideModal }, _('Dismiss')), ' ',
				E('button', { class: 'cbi-button cbi-button-positive', click: save }, _('Save')), ' ',
			]),
		]);
	}

	renderAwsInfo() {
		this.awsStreamId = getSectionNameFromUrl(this.streamUrl);
		var streamStateStr = 'OFF';
		var streamSection = uci.get('aws_kvs', this.awsStreamId);
		if (streamSection) {
			var streamState = String(uci.get('aws_kvs', this.awsStreamId, 'enable'));
			if (streamState == '1') {
				streamStateStr = 'ON';
			}
		} else {
			uci.add('aws_kvs', 'kvs_stream', this.awsStreamId);
		}
		const info = E('a', { style: 'cursor: pointer', click: () => this.renderAwsInfoForm() }, 'AWS KVS - ' + streamStateStr);
		return info;
	}

	renderStreamLinks() {
		const streamLinks = [];

		if (this.streamUrl) {
			streamLinks.push(E('a', { href: this.streamUrl }, _('RTSP')));
		}

		if (this.proxyUrls.rtsp) {
			streamLinks.push(' | ');
			streamLinks.push(E('a', { href: this.proxyUrls.rtsp }, _('Proxy RTSP')));
		}

		if (this.proxyUrls.webrtc) {
			streamLinks.push(' | ');
			streamLinks.push(E('a', { href: this.proxyUrls.webrtc }, _('WebRTC')));
		}

		if (this.proxyUrls.hls) {
			streamLinks.push(' | ');
			streamLinks.push(E('a', { href: this.proxyUrls.hls }, _('HLS')));
		}

		return streamLinks;
	}

	renderVideo() {
		const autoplay = true;

		let videoAttributes = {
			autoplay: autoplay,
		};

		if (this.info.media) {
			const encodingOptions = this.encoder.options.encoding[this.encoder.encoding];
			Object.assign(videoAttributes, {
				'brightness': this.source.imaging.brightness,
				'brightness-min': this.source.imaging.options.brightness_range.min,
				'brightness-max': this.source.imaging.options.brightness_range.max,
				'bitrate': this.encoder.bitrate,
				'framerate': this.encoder.framerate,
				'framerate-min': encodingOptions.framerate_range.min,
				'framerate-max': encodingOptions.framerate_range.max,
				'resolution': `${this.encoder.resolution.width}x${this.encoder.resolution.height}`,
				'resolution-options': encodingOptions.resolution.map(({ width, height }) => `${width}x${height}`).join(','),
			});
		}

		this.videoLive = E('video-live', videoAttributes);

		this.receiver = new Receiver(this.videoLive, this.proxyUrls.webrtc);

		// We stop/start the receiver so we don't stream things unnecessarily.
		// Note that mediamtx will also stop proxying once it has no connections.
		this.videoLive.addEventListener('userplay', () => this.receiver.start());
		this.videoLive.addEventListener('userpause', () => this.receiver.stop());

		if (this.info.media) {
			// Watch 'external' custom controls for change so we can call the device.
			this.settingsObserver = new MutationObserver((mutationList) => {
				const handleError = (e) => {
					ui.addNotification(_('ONVIF error'), E('pre', {}, e.message), 'warning');
				};

				for (const mutation of mutationList) {
					switch (mutation.attributeName) {
						case 'bitrate':
							this.updateEncoderConfig({ bitrate: Number(mutation.target.getAttribute('bitrate')) }, true)
								.catch(handleError);
							break;
						case 'framerate':
							this.updateEncoderConfig({ framerate: Number(mutation.target.getAttribute('framerate')) }, true)
								.catch(handleError);
							break;
						case 'brightness':
							this.updateImagingConfig({ brightness: Number(mutation.target.getAttribute('brightness')) }, true)
								.catch(handleError);
							break;
						case 'resolution': {
							const [width, height] = mutation.target.getAttribute('resolution').split('x');
							this.updateEncoderConfig({ resolution: { width: Number(width), height: Number(height) } }, true)
								.catch(handleError);
							break;
						}
					}
				}
			});
			this.startSettingsObserver();
		}

		if (autoplay) {
			this.receiver.start();
		}

		return E('div', {}, [
			E('div', { class: 'video-header' }, [
				E('h4', {}, [E('a', { href: this.webUrl }, this.hostname), ` (${this.model})`]),
			]),
			this.videoLive,
		]);
	}

	addVideoElement(videoGridElement) {
		if (!this.videoElement) {
			this.videoElement = this.renderVideo();
			videoGridElement.append(this.videoElement);
			videoGridElement.closest('section').classList.remove('hidden');
		}
	}

	removeVideoElement(videoGridElement) {
		if (this.videoElement) {
			this.receiver.stop();
			this.videoElement.remove();
			this.videoElement = null;
			if (videoGridElement.children.length === 0) {
				videoGridElement.closest('section').classList.add('hidden');
			}
		}
	}
}

// Adapted from the MediaMTX example code here (MIT):
// https://github.com/bluenviron/mediamtx/blob/09f43d976437aedbf2c5ffcd80086f914e80a6ea/internal/core/webrtc_read_index.html
// Almost identical, aside from slight constructor argument tweaking
// (taking url rather than from location.href) and adding stop()/this.stopped.

const unquoteCredential = v => (
	JSON.parse(`"${v}"`)
);

const linkToIceServers = links => (
	(links !== null)
		? links.split(', ').map((link) => {
			const m = link.match(/^<(.+?)>; rel="ice-server"(; username="(.*?)"; credential="(.*?)"; credential-type="password")?/i);
			const ret = {
				urls: [m[1]],
			};

			if (m[3] !== undefined) {
				ret.username = unquoteCredential(m[3]);
				ret.credential = unquoteCredential(m[4]);
				ret.credentialType = 'password';
			}

			return ret;
		})
		: []
);

const parseOffer = (offer) => {
	const ret = {
		iceUfrag: '',
		icePwd: '',
		medias: [],
	};

	for (const line of offer.split('\r\n')) {
		if (line.startsWith('m=')) {
			ret.medias.push(line.slice('m='.length));
		} else if (ret.iceUfrag === '' && line.startsWith('a=ice-ufrag:')) {
			ret.iceUfrag = line.slice('a=ice-ufrag:'.length);
		} else if (ret.icePwd === '' && line.startsWith('a=ice-pwd:')) {
			ret.icePwd = line.slice('a=ice-pwd:'.length);
		}
	}

	return ret;
};

const enableStereoOpus = (section) => {
	let opusPayloadFormat = '';
	let lines = section.split('\r\n');

	for (let i = 0; i < lines.length; i++) {
		if (lines[i].startsWith('a=rtpmap:') && lines[i].toLowerCase().includes('opus/')) {
			opusPayloadFormat = lines[i].slice('a=rtpmap:'.length).split(' ')[0];
			break;
		}
	}

	if (opusPayloadFormat === '') {
		return section;
	}

	for (let i = 0; i < lines.length; i++) {
		if (lines[i].startsWith('a=fmtp:' + opusPayloadFormat + ' ')) {
			if (!lines[i].includes('stereo')) {
				lines[i] += ';stereo=1';
			}
			if (!lines[i].includes('sprop-stereo')) {
				lines[i] += ';sprop-stereo=1';
			}
		}
	}

	return lines.join('\r\n');
};

const editOffer = (offer) => {
	const sections = offer.sdp.split('m=');

	for (let i = 0; i < sections.length; i++) {
		const section = sections[i];
		if (section.startsWith('audio')) {
			sections[i] = enableStereoOpus(section);
		}
	}

	offer.sdp = sections.join('m=');
};

const generateSdpFragment = (offerData, candidates) => {
	const candidatesByMedia = {};
	for (const candidate of candidates) {
		const mid = candidate.sdpMLineIndex;
		if (candidatesByMedia[mid] === undefined) {
			candidatesByMedia[mid] = [];
		}
		candidatesByMedia[mid].push(candidate);
	}

	let frag = 'a=ice-ufrag:' + offerData.iceUfrag + '\r\n'
		+ 'a=ice-pwd:' + offerData.icePwd + '\r\n';

	let mid = 0;

	for (const media of offerData.medias) {
		if (candidatesByMedia[mid] !== undefined) {
			frag += 'm=' + media + '\r\n'
			+ 'a=mid:' + mid + '\r\n';

			for (const candidate of candidatesByMedia[mid]) {
				frag += 'a=' + candidate.candidate + '\r\n';
			}
		}
		mid++;
	}

	return frag;
};

class Receiver {
	constructor(videoElement, url) {
		this.videoElement = videoElement;
		this.pc = null;
		this.restartTimeout = null;
		this.sessionUrl = '';
		this.queuedCandidates = [];
		this.url = new URL('whep', url);
		this.stopped = true;
		this.statsInterval = null;
	}

	start() {
		if (!this.stopped) {
			return;
		}
		this.stopped = false;
		console.log('requesting ICE servers');

		this.videoElement.play();
		this.videoElement.setCustomStatus('Loading...', 'throbber');

		fetch(this.url, {
			method: 'OPTIONS',
		})
			.then(res => this.onIceServers(res))
			.catch((err) => {
				console.log('error: ' + err);
				this.scheduleRestart();
			});
	}

	stop() {
		if (this.restartTimeout !== null) {
			clearTimeout(this.restartTimeout);
		}

		if (this.statsInterval !== null) {
			clearInterval(this.statsInterval);
			this.statsInterval = null;
		}

		this.videoElement.setCustomStatus('Stream stopped.');

		if (this.stopped) {
			return;
		}

		this.stopped = true;

		if (this.pc !== null) {
			this.pc.close();
			this.pc = null;
		}

		// This is in the mediamtx example code, so it should be right,
		// but currently it always seems to 500 (and returns that the
		// path doesn't exist).
		// At any rate, MediaMTX is smart enough to shut down the RTSP
		// stream when there are no webrtc peers.
		/*
		if (this.sessionUrl) {
			fetch(this.sessionUrl, {
				method: 'DELETE',
			})
				.then((res) => {
					if (res.status !== 200) {
						throw new Error('bad status code');
					}
				})
				.catch((err) => {
					console.log('delete session error: ' + err);
				});
		}
		*/
	}

	onIceServers(res) {
		this.videoElement.setCustomStatus(_('Loading...'), 'throbber');

		this.pc = new RTCPeerConnection({
			iceServers: linkToIceServers(res.headers.get('Link')),
		});

		const direction = 'sendrecv';
		this.pc.addTransceiver('video', { direction });
		this.pc.addTransceiver('audio', { direction });

		this.pc.onicecandidate = evt => this.onLocalCandidate(evt);
		this.pc.oniceconnectionstatechange = () => this.onConnectionState();

		this.pc.ontrack = (evt) => {
			console.log('new track:', evt.track.kind);
			this.videoElement.video.srcObject = evt.streams[0];
		};

		this.pc.createOffer()
			.then(offer => this.onLocalOffer(offer));
	}

	onLocalOffer(offer) {
		editOffer(offer);

		this.offerData = parseOffer(offer.sdp);
		this.pc.setLocalDescription(offer);

		console.log('sending offer');

		fetch(this.url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/sdp',
			},
			body: offer.sdp,
		})
			.then((res) => {
				if (res.status !== 201) {
					throw new Error('bad status code');
				}
				this.sessionUrl = new URL(res.headers.get('location'), this.url).toString();
				return res.text();
			})
			.then(sdp => this.onRemoteAnswer(new RTCSessionDescription({
				type: 'answer',
				sdp,
			})))
			.catch((err) => {
				console.log('error: ' + err);
				this.scheduleRestart();
			});
	}

	trackStatistics() {
		if (this.statsInterval) {
			return;
		}

		let oldPacketsReceived = 0;
		let oldPacketsLost = 0;
		let interruptions = 0;
		this.statsInterval = setInterval(() => {
			if (!this.pc || this.pc.iceConnectionState === 'closed') {
				clearInterval(this.timer);
				this.timer = null;
				return;
			}

			// If we're hardly receiving any packets, or if for every 100
			// received packets we lose 10 packets, we start displaying
			// an error message. This is experimentally determined to be the
			// point where the stream is hardly showing any frames.
			// It would be nicer to just use s.framesPerSecond, but Safari doesn't support this.
			const PACKET_LOSS_RATIO = 0.10;
			const MIN_PACKETS_RECEIVED = 50;
			const MAX_INTERRUPTIONS = 3;
			this.pc.getStats().then((stats) => {
				const s = Array.from(stats.values()).find(s => s.type == 'inbound-rtp');
				if (!s) {
					console.error('no stats');
					this.videoElement.setCustomStatus();
					return;
				}

				if (
					(s.packetsLost - oldPacketsLost) / (s.packetsReceived - oldPacketsReceived) > PACKET_LOSS_RATIO
					|| (s.packetsReceived - oldPacketsReceived < MIN_PACKETS_RECEIVED)
					|| (s.framesPerSecond === 0)
				) {
					interruptions += 1;
					if (interruptions > MAX_INTERRUPTIONS) {
						this.stop();
						// Without explicitly pausing the video, Chrome only sends a 'suspend'
						// event when we kill the webrtc stream, which leaves our video still
						// notionally running (such that the user can't use the play button
						// to restart it without pausing it themselves).
						this.videoElement.pause();
						this.videoElement.setCustomStatus(_('Disconnected bad stream. Consider decreasing bitrate before restarting.'), 'error');
					} else if (interruptions > 1) {
						this.videoElement.setCustomStatus(_('Interrupted stream. Consider decreasing bitrate.'), 'throbber');
					} else {
						this.videoElement.setCustomStatus();
					}
				} else {
					interruptions = 0;
					this.videoElement.setCustomStatus();
				}
				oldPacketsReceived = s.packetsReceived;
				oldPacketsLost = s.packetsLost;
			});
		}, 2000);
	}

	onConnectionState() {
		if (this.restartTimeout !== null) {
			return;
		}

		if (this.pc.iceConnectionState === 'connected') {
			// Statistic tracking will also remove our loading message.
			this.trackStatistics();
		}

		console.log('peer connection state:', this.pc.iceConnectionState);

		switch (this.pc.iceConnectionState) {
			case 'disconnected':
				this.scheduleRestart();
		}
	}

	onRemoteAnswer(answer) {
		if (this.restartTimeout !== null) {
			return;
		}

		this.pc.setRemoteDescription(answer);

		if (this.queuedCandidates.length !== 0) {
			this.sendLocalCandidates(this.queuedCandidates);
			this.queuedCandidates = [];
		}
	}

	onLocalCandidate(evt) {
		if (this.restartTimeout !== null) {
			return;
		}

		if (evt.candidate !== null) {
			if (this.sessionUrl === '') {
				this.queuedCandidates.push(evt.candidate);
			} else {
				this.sendLocalCandidates([evt.candidate]);
			}
		}
	}

	sendLocalCandidates(candidates) {
		fetch(this.sessionUrl, {
			method: 'PATCH',
			headers: {
				'Content-Type': 'application/trickle-ice-sdpfrag',
				'If-Match': '*',
			},
			body: generateSdpFragment(this.offerData, candidates),
		})
			.then((res) => {
				if (res.status !== 204) {
					throw new Error('bad status code');
				}
			})
			.catch((err) => {
				console.log('error: ' + err);
				this.scheduleRestart();
			});
	}

	scheduleRestart() {
		if (this.restartTimeout !== null) {
			return;
		}

		this.stop();
		this.videoElement.play();
		this.videoElement.setCustomStatus('Loading...', 'throbber');

		this.restartTimeout = window.setTimeout(() => {
			this.restartTimeout = null;
			this.start();
		}, RESTART_PAUSE);

		this.sessionUrl = '';

		this.queuedCandidates = [];
	}
}

return view.extend({
	handleSaveApply: null,
	handleSave: null,
	handleReset: null,
	devices: {},

	load() {
		return Promise.all([
			callLuciNetworkDevices(),
			uci.load('cameras', 'wireless'),
			uci.load('aws_kvs'),
			videolive.loadTemplate(),
		]);
	},

	setupVideoGridChildrenUpdate() {
		// Hackery since Firefox doesn't yet have support for 'has()', so we attach
		// classes to the video-grid to indicate the number of children.

		const updateGridClasses = () => {
			const videoCount = this.videoGridElement.childElementCount;

			for (let i = 0; i <= 9; ++i) {
				if (videoCount === i) {
					this.videoGridElement.classList.add(`children-${i}`);
				} else {
					this.videoGridElement.classList.remove(`children-${i}`);
				}
			}

			if (videoCount > 9) {
				this.videoGridElement.classList.add('children-10-or-more');
			} else {
				this.videoGridElement.classList.remove('children-10-or-more');
			}
		};

		updateGridClasses();

		const observer = new MutationObserver(updateGridClasses);
		observer.observe(this.videoGridElement, { childList: true });
	},

	async convertPathToProxyUrls(path) {
		if (!this._mediamtx_ports) {
			this._mediamtx_ports = await mediamtx.get_ports();
		}

		if (this._mediamtx_ports.error) {
			throw new Error(_('MediaMTX port failure: ') + this._mediamtx_ports.error);
		}

		const ports = this._mediamtx_ports;
		const host = window.location.hostname;

		return {
			webrtc: ports.webrtc && `http://${host}:${ports.webrtc}/${path}/`,
			rtsp: ports.rtsp && `rtsp://${host}:${ports.rtsp}/${path}`,
			hls: ports.hls && `http://${host}:${ports.hls}/${path}/`,
		};
	},

	async handleProbeResponse(device, allowRetry = false) {
		let changed = false;

		if (!this.devices[device.device_url]) {
			changed = true;
			this.devices[device.device_url] = new ONVIFDevice(this.encoderDefaults, device.endpoint_reference_address, device.device_url, '', '');
		} else {
			this.devices[device.device_url].resetQueryFailure();
		}
		const onvifVideo = this.devices[device.device_url];

		/* Update any necessary data via ONVIF
		 * (currently necessary is data we don't have; in the future, may want to
		 * update stale-ish data... the problem is that the backend is synchronous,
		 * so updating data makes things slow).
		 */
		if (onvifVideo.info == null) {
			changed = true;
			await onvifVideo.requestInfo();
		}

		if (onvifVideo.info != null && onvifVideo.streamUrl == null) {
			changed = true;
			await onvifVideo.requestStream();
		}

		if (onvifVideo.streamUrl != null && !onvifVideo.proxyUrls.webrtc) {
			changed = true;
			try {
				const setProxyResult = await mediamtx.set_proxy(onvifVideo.streamUrl);
				if (setProxyResult.error) {
					onvifVideo.reportQueryFailure(new Error(setProxyResult.error));
				} else {
					onvifVideo.setProxyUrls(await this.convertPathToProxyUrls(setProxyResult.path));
				}
			} catch (e) {
				onvifVideo.reportQueryFailure(e);
			}
		}

		/* If we've already rendered this, we may have an existing row to deal with.
		 */
		const existingRow = this.cameraTable.querySelector(`[data-url="${device.device_url}"]`);

		/* If nothing changed about our data, rendering the row again is sort of annoying
		 * and causes the retry button to be a bit strange.
		 */
		if (!changed) {
			return;
		}

		/* The final column (live view) has global-ish interactions, so we setup the
		 * elements/handlers in this odd spot.
		 */
		const timeLastSeenMinutes = Math.max(0, Math.floor((new Date() - new Date(device.last_seen_time * 1000)) / 1000 / 60));
		let liveViewElement;
		if (onvifVideo.queryFailure) {
			liveViewElement = E('button', {
				class: 'cbi-button cbi-button-action live-view-reload ' + (allowRetry ? '' : 'hidden'),
				click: ui.createHandlerFn(this, () => this.handleProbeResponse(device, true)),
				title: N_(timeLastSeenMinutes, 'Last seen 1 minute ago', 'Last seen %s minutes ago').format(timeLastSeenMinutes),
			}, [_('Retry')]);
		} else {
			const liveViewCheckbox = existingRow?.querySelector('.live-view-checkbox');
			const liveViewEnabled = liveViewCheckbox
				? liveViewCheckbox.checked
				: Object.keys(this.devices).length <= this.numAutoplay;
			liveViewElement = E('input', { class: 'live-view-checkbox', type: 'checkbox', checked: liveViewEnabled || undefined });
			liveViewElement.addEventListener('change', (e) => {
				if (e.target.checked) {
					onvifVideo.addVideoElement(this.videoGridElement);
				} else {
					onvifVideo.removeVideoElement(this.videoGridElement);
				}
				this.updateLiveViewCheckbox();
			});

			if (liveViewEnabled) {
				onvifVideo.addVideoElement(this.videoGridElement);
			}
		}

		/* Finally, render our row and put it into the table in the right spot.
		 */
		const row = onvifVideo.renderInfoRow(liveViewElement);
		if (existingRow) {
			existingRow.replaceWith(row);
		} else {
			for (const r of this.cameraTable.children) {
				if (r.dataset.sortkey && r.dataset.sortkey.localeCompare(row.dataset.sortkey) > 0) {
					this.cameraTable.insertBefore(row, r);
					break;
				}
			}

			if (!this.cameraTable.contains(row)) {
				this.cameraTable.append(row);
			}
		}

		/* Adjust page level state after we've added/amended our row.
		 */
		this.cameraTable.classList.remove('hidden');
		this.discoveryText.classList.add('hidden');
		this.updateLiveViewCheckbox();
	},

	async discover(probeIP, clear = false) {
		if (this._mediamtx_ports?.error) {
			// Reset port info cache in error case in case MediaMTX is now up.
			this._mediamtx_ports = null;
		}

		if (Object.keys(this.devices).length === 0) {
			this.discoveryText.classList.remove('hidden');
			this.noCamerasText.classList.add('hidden');
		}

		// This is all a bit messy:
		// - we do multiple probes here to increase our chances of finding devices
		// - every probe will block up rpcd for a second (default timeout)
		//   since it's a synchronous call (ouch)
		// - every subsequent probe will return all results from previous
		//   probes (basically guaranteed now rpcd-mod-onvif caches results)
		let clearCache = clear ? 1 : 0;
		for (let i = 0; i < this.numProbes; ++i) {
			for (const device of await onvif.probe(probeIP, clearCache)) {
				await this.handleProbeResponse(device);
			}

			clearCache = 0;
		}

		if (Object.keys(this.devices).length === 0) {
			this.discoveryText.classList.add('hidden');
			this.noCamerasText.classList.remove('hidden');
		}
	},

	renderDiscovery(devices) {
		// Hack: privilege wlan as it's more likely to have connected IP cameras.
		const orderedDeviceKeys = [];
		orderedDeviceKeys.push(...Object.keys(devices).filter(k => k.startsWith('wlan')));
		orderedDeviceKeys.push(...Object.keys(devices).filter(k => !k.startsWith('wlan')));

		const probeIPs = [];
		for (const deviceKey of orderedDeviceKeys) {
			for (const ipaddr of devices[deviceKey].ipaddrs) {
				if (ipaddr.address !== '127.0.0.1') {
					probeIPs.push([deviceKey, ipaddr.address]);
				}
			}
		}

		if (probeIPs.length === 0) {
			// Just to do _something_ in the UI. This shouldn't happen.
			probeIPs.push(['unknown', '127.0.0.1']);
		}

		const selectProbeIPs = E('select', { class: 'cbi-select' }, probeIPs.map(
			([deviceName, ip]) => E('option', { value: ip }, `${ip} (${deviceName})`),
		));

		this.discoverButton = E('button', {
			class: 'cbi-button cbi-button-action',
			click: ui.createHandlerFn(this, () => this.handleDiscover(selectProbeIPs.value)),
		}, [_('Discover')]);
		this.reloadButton = E('button', {
			class: 'cbi-button cbi-button-action',
			style: 'margin-right: 10px',
			title: _('Clear cache and redo discovery'),
			click: ui.createHandlerFn(this, () => this.handleReload(selectProbeIPs.value)),
		}, [_('Reload all')]);

		return [
			selectProbeIPs,
			this.discoverButton,
			this.reloadButton,
		];
	},

	async handleDiscover(probeIPs) {
		try {
			for (const el of this.cameraTable.querySelectorAll('.live-view-reload')) {
				el.classList.add('hidden');
			}
			this.reloadButton.disabled = true;
			await this.discover(probeIPs);
		} finally {
			for (const el of this.cameraTable.querySelectorAll('.live-view-reload')) {
				el.classList.remove('hidden');
			}
			this.reloadButton.disabled = false;
		}
	},

	async handleReload(probeIPs) {
		// Remove any live videos (removeVideoElement is a no-op if they're not active).
		for (const device of Object.values(this.devices)) {
			device.removeVideoElement(this.videoGridElement);
		}

		this.devices = [];

		// Remove all rows except the header row.
		while (this.cameraTable.lastElementChild != this.cameraTable.firstElementChild) {
			this.cameraTable.removeChild(this.cameraTable.lastElementChild);
		}
		// But the table starts off invisible, so...
		this.cameraTable.classList.add('hidden');

		try {
			for (const el of this.cameraTable.querySelectorAll('.live-view-reload')) {
				el.setAttribute('disabled', '');
			}
			this.discoverButton.disabled = true;
			await this.discover(probeIPs, true);
		} finally {
			this.discoverButton.disabled = false;
			for (const el of this.cameraTable.querySelectorAll('.live-view-reload')) {
				el.removeAttribute('disabled');
			}
		}
	},

	updateLiveViewCheckbox() {
		let checked = false;
		let unchecked = false;
		for (const node of this.cameraTable.querySelectorAll('.live-view-checkbox')) {
			if (node.checked) {
				checked = true;
			} else {
				unchecked = true;
			}
		}

		if (checked && unchecked) {
			this.allLiveViewCheckbox.checked = false;
			this.allLiveViewCheckbox.indeterminate = true;
		} else if (checked) {
			this.allLiveViewCheckbox.checked = true;
			this.allLiveViewCheckbox.indeterminate = false;
		} else if (unchecked) {
			this.allLiveViewCheckbox.checked = false;
			this.allLiveViewCheckbox.indeterminate = false;
		} else {
			this.allLiveViewCheckbox.checked = false;
			this.allLiveViewCheckbox.indeterminate = true;
		}
	},

	async setDefaults() {
		for (const onvifDevice of Object.values(this.devices)) {
			await onvifDevice.updateEncoderConfig(this.encoderDefaults.get());
		}
	},

	renderSetDefaultsTitle() {
		const defaults = this.encoderDefaults.get();
		return _('Reset all devices to %sx%s@%skbps').format(
			defaults.resolution.width, defaults.resolution.height, defaults.bitrate);
	},

	renderSetDefaults() {
		return E('button', {
			class: 'cbi-button cbi-button-action',
			style: 'margin-right: 10px',
			title: this.renderSetDefaultsTitle(),
			click: ui.createHandlerFn(this, () => this.setDefaults()),
		}, [_('Force Configs to Default')]);
	},

	render([devices]) {
		if (window.location.protocol === 'https:') {
			// The interface will work fine except that the live view will fail
			// (due to mixed content blocking affecting the WebRTC requests).
			const httpUrl = new URL(window.location);
			httpUrl.protocol = 'http:';
			return E('div', { class: 'alert-message error' }, _(`
				Camera viewing is currently not supported via https.
				<a href="%s">Connect via http</a>.
			`).format(httpUrl));
		}

		this.numProbes = Number(uci.get('cameras', 'luci', 'num_probes') || 10);
		this.numAutoplay = Number(uci.get('cameras', 'luci', 'num_autoplay') || 3);
		this.encoderDefaults = new EncoderDefaults();

		this.discoveryText = E('p', { class: 'hidden' }, _('Discovering cameras...'));
		this.noCamerasText = E('p', { class: 'hidden' }, _('No ONVIF-compatible cameras found.'));
		this.allLiveViewCheckbox = E('input', { class: 'live-view-checkbox', type: 'checkbox' });
		this.allLiveViewCheckbox.indeterminate = true;
		this.allLiveViewCheckbox.addEventListener('change', (e) => {
			const val = e.target.checked;
			for (const node of this.cameraTable.querySelectorAll('.live-view-checkbox')) {
				node.checked = val;
				node.dispatchEvent(new Event('change'));
			}
		});

		let fullscreenButton = '';
		if (document.fullscreenEnabled || document.webkitFullscreenEnabled) {
			fullscreenButton = E('button', { class: 'cbi-button cbi-button-action' }, _('Fullscreen')),
			fullscreenButton.addEventListener('click', () => {
				if (this.videoGridElement.requestFullscreen) {
					this.videoGridElement.requestFullscreen();
				} else if (this.videoGridElement.webkitRequestFullscreen) {
					this.videoGridElement.webkitRequestFullscreen();
				}
			});
		}

		let setDefaultsButton = this.renderSetDefaults();
		this.encoderDefaults.registerObserver(() => {
			setDefaultsButton.title = this.renderSetDefaultsTitle();
		});

		this.videoGridElement = E('div', { class: 'video-grid' });
		this.setupVideoGridChildrenUpdate();

		const halowDevice = uci.sections('wireless', 'wifi-device').find(s => s.type === 'morse');
		if (halowDevice && halowDevice.disabled !== '1') {
			// Find any enabled halow wifi-interface in sta mode.
			const halowStaIface = uci.sections('wireless', 'wifi-iface')
				.find(s => s.device === halowDevice['.name'] && s.disabled !== '1' && s.mode === 'sta');
			if (halowStaIface) {
				ui.addNotification(_('Cameras page is intended for Access Points'),
					E('p', {}, _('Your device currently operates as a HaLow client. Because the Cameras page is intended to view all cameras on your network and proxies streams via the device you\'re using, for the best performance you should only use this page on your HaLow Access Point.')),
				);
			}
		}

		const res = [
			E('section', { class: 'cbi-section' }, [
				E('h2', {}, _('Cameras')),
				E('div', { class: 'button-row' }, [
					...this.renderDiscovery(devices),
					setDefaultsButton,
				]),
				E('div', [
					this.discoveryText,
					this.noCamerasText,
					this.cameraTable = E('table', { class: 'cbi-section-table table hidden' }, [
						E('tr', { class: 'tr cbi-section-table-titles table-titles' }, [
							E('th', { class: 'th cbi-section-table-cell' }, [_('Hostname')]),
							E('th', { class: 'th hide-sm cbi-section-table-cell' }, [_('Model')]),
							E('th', { class: 'th hide-sm cbi-section-table-cell' }, [_('Firmware')]),
							E('th', { class: 'th center cbi-section-table-cell' }, [_('Config')]),
							E('th', { class: 'th center cbi-section-table-cell' }, [_('Streams')]),
							E('th', { class: 'th center cbi-section-table-cell' }, [_('AWS KVS')]),
							E('th', { class: 'th center cbi-section-table-cell' }, [_('Live view'), this.allLiveViewCheckbox]),
						]),
					]),
				]),
			]),
			E('section', { class: 'hidden cbi-section' }, [
				E('div', { class: 'heading-with-buttons' }, [
					E('h3', {}, _('Live view')),
					fullscreenButton,
				]),
				this.videoGridElement,
			]),
		];

		this.discoverButton.click();
		return res;
	},
});
