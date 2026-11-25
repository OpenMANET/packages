'use strict';
'require baseclass';
'require uci';

return baseclass.extend({
	preferred() {
		return uci.get('cameras', 'luci', 'transport') === 'rtsp' ? 'rtsp' : 'srt';
	},

	url(port, action, path) {
		const base = 'srt://' + window.location.hostname + ':' + port;
		let url = base + '?streamid=' + action + ':' + path.split('/').map(encodeURIComponent).join('/');
		const latency = Number(uci.get('cameras', 'luci', 'srt_latency_ms'));
		// FFmpeg's SRT URL uses microseconds. Omit it for client defaults.
		if (Number.isInteger(latency) && latency >= 20 && latency <= 8000)
			url += '&latency=' + (latency * 1000);
		return url;
	}
});
