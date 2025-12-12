'use strict';
/* globals fs morsenetwork uci ui view */
'require view';
'require ui';
'require fs';
'require uci';
'require tools.morse.network as morsenetwork';

const dump_path = '/tmp/'; // filepath for dumping the files

return view.extend({
	load() {
		return Promise.all([
			morsenetwork.getMorseDeviceInterface(),
			uci.load(['wireless']),
		]);
	},

	dumpState() {
		ui.showModal(_('Getting snapshot...'), [
			E('p', { class: 'spinning' }, _('The system is gathering required information.')),
		]);

		const temp_filename = 'sys_dump';
		return fs.exec('/morse/scripts/mm_dumps.sh', ['-c', '-b', 'OpenWRT', '-i', this.morseDeviceInterface, '-o', temp_filename, '-d', dump_path]).then(
			(retVal) => {
				if (retVal['code'] == 0) {
					fs.read_direct(dump_path + temp_filename + '.tar.gz', 'blob').then(
						(snapshotFile) => {
							const filename = `mm_sysdump_${new Date().toISOString().split('.')[0].replaceAll(':', '_')}.tar.gz`;
							var body = [];
							var snapshot = new Blob([snapshotFile], { type: 'application/gzip' });
							var url = URL.createObjectURL(snapshot);
							body.push(E('p', _('Snapshot collected successfully.')));
							body.push(E('a', { href: url, download: filename }, E('button', { class: 'btn cbi-button-action important', click: ui.hideModal }, [_('Download')])));
							ui.showModal(_('Export snapshot'), body);
						},
					);
				} else {
					var body = [];
					body.push(E('p', _('Something went wrong, error: ' + retVal['code'] + '\n stderr:', retVal['stderr'])));
					body.push(E('button', { class: 'btn cbi-button-action important', click: ui.hideModal }, [_('Close', 'User action to close a dialog box')]));
					ui.showModal(_('Failed to gather snapshot'), body);
				}
			},
		);
	},

	render([morseDeviceInterface]) {
		if (morseDeviceInterface) {
			this.morseDeviceInterface = morseDeviceInterface;
		} else {
			this.morseDeviceInterface = 'wlan0';
		}

		var view = E([], [
			E('h2', {}, _('Support')),

			E('div', { class: 'cbi-section' }, [
				E('h3', {}, _('Snapshots')),
				E('p', _('Collect a snapshot of the system for the purpose of debugging any issues experienced. This can be sent to the support team for further analysis.')),
			]),
		]);

		return view;
	},

	addFooter() {
		return E('div', { class: 'cbi-page-actions' }, [
			E('button', { class: 'cbi-button cbi-button-action', click: ui.createHandlerFn(this, 'dumpState') }, _('Create Archive')),
		]);
	},
});
