/**
 * Wizard selection page.
 */
/* globals uci view wizard */
'require view';
'require tools.morse.wizard as wizard';
'require uci';

return view.extend({
	async load() {
		const closeButton = document.querySelector('body header button.close');
		closeButton.onclick = () => this.abort();
		return await Promise.all([
			//uci.load('prplmesh').then(() => true).catch(() => false),
			uci.load('mesh11sd').then(() => true).catch(() => false),
			//uci.load('matter').then(() => true).catch(() => false),
			uci.load('luci'),
		]);
	},

	async abort() {
		if ([L.env.requestpath.join('/'), 'admin/selectwizard'].includes(uci.get('luci', 'main', 'homepage'))) {
			await wizard.directUciRpc.delete('luci', 'main', 'homepage');
			await wizard.directUciRpc.commit('luci');
		}
		window.location.href = L.url();
	},

	card(url, heading, text, picture) {
		return E('a', { class: 'card', href: url }, [
			E('h3', heading),
			E('img', { src: picture }),
			E('p', text),
		]);
	},

	render([hasPrplmesh, hasMesh11sd, hasMatter]) {
		const cards = [
			this.card(
				L.url('admin', 'morse', 'wizard'),
				_('Standard Wi-Fi HaLow'),
				_('Setup your device as a normal Access Point (AP) or Client (Station).'),
				L.resourceCacheBusted('view/morse/images/wizard.svg'),
			),
		];
		if (hasMesh11sd) {
			cards.push(this.card(
				L.url('admin', 'morse', 'meshwizard'),
				_('802.11s Mesh'),
				_('Setup your device as part of an 802.11s Mesh (either as a Mesh Point or a Mesh Gate).'),
				L.resourceCacheBusted('view/morse/images/meshwizard.svg'),
			));
		}
		return E('div', { class: 'wizard-contents' }, [
			E('h2', 'Select a Wizard'),
			E('div', { class: 'cards' }, cards),
		]);
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
		return E('div', [
			E('div', { class: 'container' }),
		]);
	},
});
