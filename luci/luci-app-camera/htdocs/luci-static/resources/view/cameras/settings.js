'use strict';
'require view';
'require form';
'require rpc';
'require poll';
'require uci';
'require ui';
'require view.cameras.transport as transport';

const ports = rpc.declare({ object: 'mediamtx', method: 'get_ports', reject: true });
const connections = rpc.declare({ object: 'mediamtx', method: 'srt_connections', reject: true });
const open = rpc.declare({ object: 'mediamtx', method: 'open_transfer', params: ['kind', 'source'], reject: true });
const closeTransfer = rpc.declare({ object: 'mediamtx', method: 'close_transfer', params: ['kind'], reject: true });

function showURL(label, url) {
	return E('label', { class: 'cbi-value' }, [
		E('span', { class: 'cbi-value-title' }, label),
		E('input', { type: 'text', readonly: true, value: url, click: ev => ev.target.select() })
	]);
}

function transferButton(label, action, status, message) {
	return E('button', { type: 'button', class: 'cbi-button', click: ui.createHandlerFn(null, async () => {
		try {
			const result = await action();
			status.textContent = result.error || message;
		} catch (err) {
			status.textContent = err.message;
		}
	}) }, label);
}

function sourceURL(value) {
	const url = new URL(value.trim());
	if (url.protocol !== 'srt:' || !url.hostname || !url.port)
		throw new Error(_('Enter an SRT URL with a hostname and port.'));
	// The copyable playback URLs use FFmpeg units. MediaMTX uses gosrt,
	// which expects milliseconds for the same URL parameter.
	if (url.searchParams.has('mode') && url.searchParams.get('mode') !== 'caller')
		throw new Error(_('Use caller mode to connect to the remote listener.'));
	if (url.searchParams.has('latency')) {
		const us = Number(url.searchParams.get('latency'));
		if (!Number.isSafeInteger(us) || us < 1000 || us > 8000000)
			throw new Error(_('Enter a URL latency between 1000 and 8000000 microseconds.'));
		url.searchParams.set('latency', String(Math.ceil(us / 1000)));
	}
	return url.href;
}

function transfers(port) {
	const source = E('input', { type: 'text', placeholder: 'srt://host:8890?streamid=read:camera' });
	const status = E('p', { role: 'status' });
	return E('section', { class: 'cbi-section' }, [
		E('h3', {}, _('SRT transfers')),
		E('p', {}, _('Players can pull each camera using its SRT link on the Cameras page. To receive a push from an encoder, open the ingest path and give the encoder the publish URL. Anyone with access to a publishing protocol on this node can send to the open path.')),
		transferButton(_('Open ingest'), () => open('publish', ''), status, _('Ingest is open.')),
		transferButton(_('Close ingest'), () => closeTransfer('publish'), status, _('Ingest is closed.')),
		showURL(_('Encoder publish URL'), transport.url(port, 'publish', 'srt-ingest')),
		showURL(_('Ingest playback URL'), transport.url(port, 'read', 'srt-ingest')),
		E('p', {}, _('This node can also pull an MPEG-TS stream from a remote SRT listener when a player opens the relay playback URL. Transfer paths close when MediaMTX restarts.')),
		E('label', {}, [_('Remote SRT source URL (FFmpeg units)'), ' ', source]),
		transferButton(_('Open relay'), () => open('pull', sourceURL(source.value)), status, _('Relay is ready for a reader.')),
		transferButton(_('Close relay'), () => closeTransfer('pull'), status, _('Relay is closed.')),
		showURL(_('Relay playback URL'), transport.url(port, 'read', 'srt-relay')),
		status
	]);
}

function statsPanel() {
	const body = E('div', { style: 'overflow-x:auto' });
	const push = E('p', { role: 'status' });
	const refresh = async () => {
		try {
			const data = await connections();
			if (data.error) throw new Error(data.error);
			const active = data.push;
			push.textContent = active && active.state === 'Sending'
				? _('Outgoing push to %s · RTT %s ms · send buffer %s ms · %s bytes sent · %s packet retransmissions')
					.format(active.remoteAddr, active.rttMillis.toFixed(1), active.sendBufferMillis, active.bytesSent, active.retransmissions)
				: active ? _('Outgoing push: %s').format(active.state) : '';
			const rows = Object.values(data.items || {});
			if (!rows.length) {
				body.textContent = _('No active SRT connections.');
				return;
			}
			const headers = [_('Path'), _('Peer'), _('Role'), _('RTT (ms)'), _('Send buffer (ms)'), _('Sent (bytes)'), _('Received (bytes)')];
			const table = E('table', { class: 'table' }, [
				E('tr', {}, headers.map(h => E('th', {}, h))),
				...rows.map(r => E('tr', {}, [r.path, r.remoteAddr, r.state, r.rttMillis == null ? null : r.rttMillis.toFixed(1),
					r.sendBufferMillis, r.bytesSent, r.bytesReceived].map(v => E('td', {}, v == null ? '—' : String(v)))))
			]);
			body.replaceChildren(table);
			if (data.total > rows.length) body.appendChild(E('p', {}, _('Showing the first 1000 connections.')));
		} catch (err) {
			body.textContent = err.message;
			push.textContent = '';
		}
	};
	poll.add(refresh, 3);
	return E('section', { class: 'cbi-section' }, [E('h3', {}, _('Connections to this SRT listener')), body, push]);
}

return view.extend({
	load() {
		return Promise.all([uci.load('cameras'), ports().catch(err => ({ error: err.message }))]);
	},

	async render([, listeners]) {
		const m = new form.Map('cameras', _('Video transport'));
		const s = m.section(form.NamedSection, 'luci', 'interface');
		const protocol = s.option(form.ListValue, 'transport', _('Preferred camera link'));
		protocol.value('srt', _('SRT'));
		protocol.value('rtsp', _('RTSP'));
		protocol.default = 'srt';

		const latency = s.option(form.Value, 'srt_latency_ms', _('SRT caller latency (ms)'),
			_('For FFmpeg-compatible clients. A longer retransmission window can recover more late packets and adds playback delay. Leave blank for the client default. Reconnect with the updated URL after applying.'));
		latency.datatype = 'and(uinteger,range(20,8000))';
		latency.placeholder = _('Client default');

		const enabled = s.option(form.Flag, 'push_enabled', _('Push video to a remote SRT listener'),
			_('Starts an outgoing MPEG-TS stream and reconnects if the receiver drops. The local encoder settings also apply to this stream.'));
		enabled.default = '0';
		const path = s.option(form.Value, 'push_path', _('Local path to push'));
		path.depends('push_enabled', '1');
		path.placeholder = listeners.cameraPath || 'rpicamera';
		path.validate = (section, v) => !v || /^[a-zA-Z0-9_.~-]+(?:\/[a-zA-Z0-9_.~-]+)*$/.test(v) || _('Enter a MediaMTX path.');
		const dest = s.option(form.Value, 'push_destination', _('Remote publish URL (FFmpeg units)'));
		dest.depends('push_enabled', '1');
		dest.rmempty = false;
		dest.retain = true;
		path.retain = true;
		dest.placeholder = 'srt://host:8890?streamid=publish:srt-ingest';
		dest.validate = (section, v) => {
			try { sourceURL(v); return true; } catch (err) { return err.message; }
		};

		return E('div', {}, [
			await m.render(),
			listeners.cameraPath && (listeners.srt || listeners.rtsp) ? showURL(_('Local camera playback URL'),
				(transport.preferred() === 'srt' || !listeners.rtsp) && listeners.srt
					? transport.url(listeners.srt, 'read', listeners.cameraPath)
					: 'rtsp://' + window.location.hostname + ':' + listeners.rtsp + '/' + listeners.cameraPath) : [],
			listeners.srt ? transfers(listeners.srt) : E('p', {}, listeners.error || _('SRT listener disabled.')),
			statsPanel()
		]);
	}
});
