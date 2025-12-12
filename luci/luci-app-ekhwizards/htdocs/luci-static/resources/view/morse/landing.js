/**
 * Initial landing page for devices with Morse wifi chips.
 *
 * Gives the user the option to configure the HaLow country, hostname, and password.
 * Automatically configure the TZ and time based on the browser.
 */
/* globals dom form halow rpc uci ui view wizard */
'require view';
'require form';
'require dom';
'require halow';
'require tools.morse.wizard as wizard';
'require uci';
'require rpc';
'require ui';

const DEFAULT_COUNTRY = 'US';

var callSetPassword = rpc.declare({
	object: 'luci',
	method: 'setPassword',
	params: ['username', 'password'],
	expect: { result: false },
});

const callSetLocaltime = rpc.declare({
	object: 'luci',
	method: 'setLocaltime',
	params: ['localtime'],
	expect: { result: 0 },
});

const callGetTimezones = rpc.declare({
	object: 'luci',
	method: 'getTimezones',
	expect: { '': {} },
});

return view.extend({
	load() {
		// We need the close button ASAP, because otherwise users will have no way
		// of escaping the wizard if we blow up during load.
		// It's safe to do this here without waiting for the render since luci loads the
		// view separately from the header.
		const closeButton = document.querySelector('body header button.close');
		closeButton.onclick = () => this.abort();

		this.passwordFormData = {
			password: {
				pw1: null,
				pw2: null,
			},
		};

		return Promise.all([
			callGetTimezones(),
			halow.loadChannelMap(),
			uci.load('luci'),
			uci.load('wireless').catch(() => null),
		]);
	},

	async abort() {
		if (uci.get('luci', 'main', 'homepage') === L.env.requestpath.join('/')) {
			await wizard.directUciRpc.delete('luci', 'main', 'homepage');
			await wizard.directUciRpc.commit('luci');
		}
		window.location.href = L.url();
	},

	async handleApply(_ev) {
		const mapEls = document.getElementById('maincontent').querySelectorAll('.cbi-map');
		const maps = Array.from(mapEls).map(mapEl => dom.findClassInstance(mapEl));
		const morseDeviceName = uci.sections('wireless', 'wifi-device').find(s => s.type === 'morse')['.name'];
		const wifiDevices = uci.sections('wireless', 'wifi-device').filter(s => s.type === 'mac80211');

		try {
			for (const m of maps) {
				m.checkDepends();
			}

			await Promise.all(maps.map(m => m.parse()));

			// Make sure all non-morse wifi devices are enabled where they exist.
			for (const wifiDevice of wifiDevices) {
				uci.unset('wireless', wifiDevice['.name'], 'disabled');
			}

			// Make sure our first HaLow device is enabled.
			uci.unset('wireless', morseDeviceName, 'disabled');

			// Update TZ based on browser TZ if we're on UTC.
			if (uci.get('system', '@system[0]', 'timezone') === 'UTC') {
				const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
				const tzstring = this.timezones[browserTz]?.tzstring;
				if (tzstring) {
					uci.set('system', '@system[0]', 'zonename', browserTz);
					uci.set('system', '@system[0]', 'timezone', tzstring);
				}
			}

			// If this was the homepage, we've completed it, so now set the
			// actual wizard as the homepage.
			if (uci.get('luci', 'main', 'homepage') === L.env.requestpath.join('/')) {
				uci.set('luci', 'main', 'homepage', 'admin/selectwizard');
			}

			const tasks = [];

			tasks.push(uci.save());

			if (this.passwordFormData.password.pw1 != null) {
				tasks.push(callSetPassword('root', this.passwordFormData.password.pw1));
			}

			tasks.push(callSetLocaltime(Math.floor(Date.now() / 1000)));

			await Promise.all(tasks);

			document.addEventListener('uci-applied', () => {
				window.location.href = L.url('admin', 'selectwizard');
				// A standard save triggers uci-applied then redirects
				// back to the same page after apply_display seconds. However,
				// we need to make sure _our_ redirect sticks before this happens,
				// as if the network response is slow to this request we might not
				// stop JS execution before the next window.location change. Therefore
				// we override the global (!) - but remember, we're about to reload the page,
				// so this change won't stick anywhere useful.
				L.env.apply_display = 1000;
			});
			ui.changes.apply(false /* checked */);
		} catch (e) {
			console.error(e);

			ui.showModal(_('Save error'), [
				E('p', {}, [_('An error occurred while saving the form:')]),
				E('p', {}, [E('em', { style: 'white-space:pre-wrap' }, [e.message])]),
				E('div', { class: 'right' }, [
					E('button', { class: 'cbi-button', click: ui.hideModal }, [_('Dismiss')]),
				]),
			]);
		}
	},

	render([timezones, channelMap]) {
		this.timezones = timezones;

		const morseDevice = uci.sections('wireless', 'wifi-device').find(s => s.type === 'morse');
		if (!morseDevice) {
			// If there's no morse device detected at all, we can't do anything useful in the wizard,
			// so just drop to the standard homepage.
			this.abort();
		}

		const wirelessMap = new form.Map(
			'wireless',
		);
		let section = wirelessMap.section(
			form.NamedSection, morseDevice['.name'], 'wifi-device',
			_('HaLow Configuration'),
		);

		let option = section.option(form.ListValue, 'country', _('Country'),
			_(`The country determines the capabilities of your HaLow network.
				<strong>Warning:</strong> If you are currently using HaLow, modifying this value
				may cause you to lose access to this device.
				For details, see the <a href="%s" target="_blank">regulatory data table</a>.`).format(L.url('admin', 'help', 'regulatoryinfo')),
		);
		option.default = DEFAULT_COUNTRY;
		option.rmempty = false;
		for (const countryCode of Object.keys(channelMap)) {
			option.value(countryCode, countryCode);
		}
		option.write = function (sectionId, value) {
			this.super('write', [sectionId, value]);

			// Set channel appropriately if the country was mutated
			// so we're less likely to leave this in a broken state.
			const bestChannel = Object.values(channelMap[value]).reduce((a, b) => Number(a.bw) > Number(b.bw) ? a : b);
			uci.set('wireless', morseDevice['.name'], 'channel', bestChannel['s1g_chan']);
		};

		const systemMap = new form.Map('system');
		section = systemMap.section(form.TypedSection, 'system', _('System Configuration'));
		section.anonymous = true;
		option = section.option(form.Value, 'hostname',
			_('Hostname'), _('Hostname is used for many device id purposes, including DNS.'));
		option.datatype = 'hostname';

		const passwordMap = new form.JSONMap(this.passwordFormData);
		if (document.getElementById('password-warning')) {
			section = passwordMap.section(form.NamedSection, 'password', 'password');

			const passwordOption = option = section.option(form.Value, 'pw1',
				_('Password'),
				_('We recommend setting a password. This will protect both the web interface and ssh access.'));
			option.password = true;

			option = section.option(form.Value, 'pw2', _('Confirmation'), ' ');
			option.password = true;
			option.validate = function (sectionId, value) {
				if (passwordOption.formvalue(sectionId) !== value) {
					return 'Given password confirmation doesn\'t match';
				}

				return true;
			};
		}

		return Promise.all([wirelessMap.render(), systemMap.render(), passwordMap.render()])
			.then(([wirelessHtml, systemHtml, passwordHtml]) => E('div', { class: 'wizard-contents' }, [
				E('div', { class: 'cbi-section' }, [
					E('h1', _('Welcome!')),
					E('p', _(`This wizard will guide you through the initial setup of this device.`)),
					E('p', _(`You can exit now if you'd prefer to configure manually.`)),
				]),
				wirelessHtml,
				E('div', { class: 'cbi-section' }, [
					systemHtml,
					passwordHtml,
				]),
			]));
	},

	/**
	 * Usually, addFooter deals with handleSave etc.
	 *
	 * Because we're copying the wizard approach and want to use the wizard.css,
	 * we override this to create a 'wizard-style' footer.
	 *
	 * @override
	 */
	addFooter() {
		return E('div', { class: 'cbi-page-actions' }, [
			E('div', { class: 'container' }, [
				E('div', { class: 'cbi-page-actions-flex' }, [
					E('div', { style: 'flex-grow: 1' }),
					E('button', {
						class: 'cbi-button cbi-button-apply',
						click: classes.ui.createHandlerFn(this, 'handleApply'),
					}, [_('Apply')]),
				]),
			]),
		]);
	},
});
