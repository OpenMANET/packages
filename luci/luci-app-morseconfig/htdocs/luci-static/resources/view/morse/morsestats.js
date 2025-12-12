'use strict';
/* globals dom fs morsenetwork ui view */
'require fs';
'require view';
'require dom';
'require ui';
'require tools.morse.network as morsenetwork';

var MorseStats = view.extend({
	handleSaveApply: null,
	handleReset: null,
	handleSave: null,

	logAction: function (iface, action, log) {
		var params = ['-i', iface, 'stats'];
		var log_title = document.querySelector('#syslog_title');
		var title = '';
		if (action == 'reset')
			params.push('-r');

		switch (log) {
			case 'uphy':
				params.push('-u');
				title = _('UPhy Statistics', 'Statistics from a chip component');
				break;
			case 'mac':
				title = _('MAC Statistics', 'Statistics from a chip component');
				params.push('-m');
				break;
			case 'app':
			default:
				title = _('Application Statistics', 'Statistics from a chip component');
				params.push('-a');
				break;
		}

		dom.content(log_title, title);

		fs.exec_direct('/sbin/morse_cli', params).then((output) => {
			var log_area = document.querySelector('#syslog');
			log_area.rows = output.match(/\n/g)?.length ?? 1;
			dom.content(log_area, output);
			if (action == 'reset') {
				this.logAction(iface, 'read', log);
			}
		},
		);
	},

	load: function () {
		return Promise.all([
			morsenetwork.getMorseDeviceInterface(),
		]);
	},

	render: function ([iface]) {
		var rows = [];

		if (!iface) {
			iface = 'wlan0';
		}

		var table = E('table', { class: 'table' }, [
			E('tr', { class: 'tr table-titles' }, [
				E('th', { class: 'th' }, _('Log')),
				E('th', { class: 'th nowrap' }, _('Action', 'Prompting the user to take an action')),
			]),
		]);

		rows.push([
			'Application Core Stats',
			E('div', [
				E('button', { class: 'btn cbi-button-action', click: ui.createHandlerFn(this, 'logAction', iface, 'read', 'app') }, _('Read')),
				E('button', { class: 'btn cbi-button-action', click: ui.createHandlerFn(this, 'logAction', iface, 'reset', 'app') }, _('Reset')),
			]),
		]);

		rows.push([
			'MAC Core Stats',
			E('div', [
				E('button', { class: 'btn cbi-button-action', click: ui.createHandlerFn(this, 'logAction', iface, 'read', 'mac') }, _('Read')),
				E('button', { class: 'btn cbi-button-action', click: ui.createHandlerFn(this, 'logAction', iface, 'reset', 'mac') }, _('Reset')),
			]),
		]);

		rows.push([
			'UPhy Core Stats',
			E('div', [
				E('button', { class: 'btn cbi-button-action', click: ui.createHandlerFn(this, 'logAction', iface, 'read', 'uphy') }, _('Read')),
				E('button', { class: 'btn cbi-button-action', click: ui.createHandlerFn(this, 'logAction', iface, 'reset', 'uphy') }, _('Reset')),
			]),
		]);

		cbi_update_table(table, rows);

		var view = E([], [
			E('h2', {}, _('Morse Statistics')),
			table,
			E('h3', { id: 'syslog_title' }, ''),
			E('textarea', { id: 'syslog', style: 'font-size:12px;font-family:monospace;', readonly: 'readonly', wrap: 'off', rows: 50 },
				[]),
		]);

		return view;
	},
});

return MorseStats;
