'use strict';
/* globals baseclass rpc ui */
'require baseclass';
'require ui';
'require rpc';

const callUciSet = rpc.declare({
	object: 'uci',
	method: 'set',
	params: ['config', 'section', 'values'],
	reject: true,
});

const callUciCommit = rpc.declare({
	object: 'uci',
	method: 'commit',
	params: ['config'],
	reject: true,
});

// Items that appear in basic mode.
const BASIC_MODE_MENU = new Set([
	'Home', 'Wizards', 'Wizard', 'Upgrade', 'Help', 'Log out',
]);

function slideUp(target, duration = 500, cb) {
	if (target.dataset.transitionTimeout) {
		clearTimeout(target.dataset.transitionTimeout);
	}

	target.classList.remove('active');

	target.style.display = 'block';
	target.style.transitionProperty = 'height, margin, padding';
	target.style.transitionDuration = duration + 'ms';
	target.style.boxSizing = 'border-box';
	target.style.height = target.offsetHeight + 'px';
	target.offsetHeight;

	target.style.overflow = 'hidden';
	target.style.height = 0;
	target.style.paddingTop = 0;
	target.style.paddingBottom = 0;
	target.style.marginTop = 0;
	target.style.marginBottom = 0;
	target.dataset.transitionTimeout = window.setTimeout(() => {
		if (target.classList.contains('active')) {
			// Another click has happened - abort.
			return;
		}
		delete target.dataset.transitionTimeout;
		target.style.display = 'none';
		target.style.removeProperty('height');
		target.style.removeProperty('padding-top');
		target.style.removeProperty('padding-bottom');
		target.style.removeProperty('margin-top');
		target.style.removeProperty('margin-bottom');
		target.style.removeProperty('overflow');
		target.style.removeProperty('transition-duration');
		target.style.removeProperty('transition-property');
		if (cb) {
			cb();
		}
	}, duration);
}

function slideDown(target, duration = 500, cb) {
	if (target.dataset.transitionTimeout) {
		clearTimeout(target.dataset.transitionTimeout);
	}
	target.classList.add('active');

	target.style.removeProperty('display');
	let display = window.getComputedStyle(target).display;
	if (display === 'none') display = 'block';
	target.style.display = display;
	target.style.removeProperty('height');
	let height = target.offsetHeight;
	target.style.overflow = 'hidden';
	target.style.height = 0;
	target.style.paddingTop = 0;
	target.style.paddingBottom = 0;
	target.style.marginTop = 0;
	target.style.marginBottom = 0;
	target.offsetHeight;
	target.style.boxSizing = 'border-box';
	target.style.transitionProperty = 'height, margin, padding';
	target.style.transitionDuration = duration + 'ms';
	target.style.height = height + 'px';
	target.style.removeProperty('padding-top');
	target.style.removeProperty('padding-bottom');
	target.style.removeProperty('margin-top');
	target.style.removeProperty('margin-bottom');

	target.dataset.transitionTimeout = window.setTimeout(() => {
		if (!target.classList.contains('active')) {
			// Another click has happened - abort.
			return;
		}
		delete target.dataset.transitionTimeout;
		target.style.removeProperty('height');
		target.style.removeProperty('overflow');
		target.style.removeProperty('transition-duration');
		target.style.removeProperty('transition-property');
		if (cb) {
			cb();
		}
	}, duration);
}

return baseclass.extend({
	__init__: function () {
		if (document.getElementById('mainmenu')) {
			ui.menu.load().then(L.bind(this.render, this));
		}

		this.attachLanguageHandlers();

		let uimode;
		if (window.advancedModeToggle) {
			uimode = localStorage.getItem('uimode');
			if (!['normal', 'advanced'].includes(uimode)) {
				uimode = 'normal';
			}
		} else {
			uimode = 'advanced';
		}
		document.body.classList.add(`uimode-${uimode}`);
	},

	switchUIMode: function () {
		let newmode;
		if (document.body.classList.contains('uimode-advanced')) {
			document.body.classList.remove('uimode-advanced');
			newmode = 'normal';
		} else {
			document.body.classList.remove('uimode-normal');
			newmode = 'advanced';
		}
		document.body.classList.add(`uimode-${newmode}`);
		localStorage.setItem('uimode', newmode);
	},

	attachLanguageHandlers() {
		for (let elem of document.querySelectorAll('.language-change')) {
			elem.onclick = async () => {
				await callUciSet('luci', 'main', { lang: elem.dataset['lang'] });
				await callUciCommit('luci');
				window.location.reload();
			};
		}
	},

	// Perform minor simplifications so our menu is a bit cleaner.
	tweakMenu(tree) {
		// Move VPN to Services.
		const vpn = tree.children?.admin?.children?.vpn;
		const services = tree.children?.admin?.children?.services;

		if (vpn?.children && services) {
			services.children ??= {};
			for (const [k, v] of Object.entries(vpn.children)) {
				v.url = `admin/vpn/${k}`;
				services.children[k] = v;
			}

			delete tree.children.admin.children.vpn;
		}
		return tree;
	},

	render: function (tree) {
		tree = this.tweakMenu(tree);

		var node = tree,
			url = '',
			children = ui.menu.getChildren(tree);

		for (let i = 0; i < children.length; i++) {
			var isActive = (L.env.requestpath.length ? children[i].name == L.env.requestpath[0] : i == 0);

			if (isActive)
				this.renderMainMenu(children[i], children[i].name);
		}

		if (L.env.dispatchpath.length >= 3) {
			for (let i = 0; i < 3 && node; i++) {
				node = node.children[L.env.dispatchpath[i]];
				url = url + (url ? '/' : '') + L.env.dispatchpath[i];
			}

			if (node)
				this.renderTabMenu(node, url);
		}

		document.querySelector('a.showSide')
			.addEventListener('click', ui.createHandlerFn(this, 'handleSidebarToggle'));
		document.querySelector('.darkMask')
			.addEventListener('click', ui.createHandlerFn(this, 'handleSidebarToggle'));
	},

	handleMenuExpand: function (ev) {
		var a = ev.target, slide_menu = a.nextElementSibling;

		if (!slide_menu) {
			return;
		}

		if (slide_menu.classList.contains('active')) {
			slideUp(slide_menu, 500);
			a.classList.remove('active');
		} else {
			slideDown(slide_menu, 500);
			a.classList.add('active');
			a.blur();
		}

		ev.preventDefault();
		ev.stopPropagation();
	},

	renderMainMenu: function (tree, url, level) {
		var l = (level || 0) + 1,
			ul = E('ul', { class: level ? 'slide-menu' : 'nav' }),
			children = ui.menu.getChildren(tree);

		if (children.length == 0 || l > 2)
			return E([]);

		let advancedModeRendered = false;

		for (var i = 0; i < children.length; i++) {
			var isActive = ((L.env.dispatchpath[l] == children[i].name) && (L.env.dispatchpath[l - 1] == tree.name)),
				submenu = this.renderMainMenu(children[i], url + '/' + children[i].name, l),
				hasChildren = submenu.children.length,
				slideClass = hasChildren ? 'slide' : null,
				menuClass = hasChildren ? 'menu' : 'food';
			if (isActive) {
				ul.classList.add('active');
				slideClass += ' active';
				menuClass += ' active';
			}

			if (window.advancedModeToggle && l === 1 && !advancedModeRendered && !BASIC_MODE_MENU.has(children[i].title)) {
				// The first time we see a non-basic mode element, add the advanced menu toggle
				// (we don't want the advanced toggle to jump around as we add in the other items).
				ul.appendChild(E('li', { 'style': 'display: block', 'data-title': 'Advanced' }, [
					E('a', { click: this.switchUIMode }, _('Advanced Config')),
				]));
				advancedModeRendered = true;
			}

			ul.appendChild(E('li', {
				'style': BASIC_MODE_MENU.has(children[i].title) && 'display: block',
				'class': slideClass,
				'data-title': children[i].title.replace(' ', '_'),
			}, [
				E('a', {
					href: children[i].url ? L.url(children[i].url) : L.url(url, children[i].name),
					click: (l == 1) ? ui.createHandlerFn(this, 'handleMenuExpand') : null,
					class: menuClass,
				}, [_(children[i].title)]),
				submenu,
			]));
		}

		if (l == 1) {
			document.querySelector('#mainmenu').appendChild(ul);
		}
		return ul;
	},

	renderTabMenu: function (tree, url, level) {
		var container = document.querySelector('#tabmenu'),
			l = (level || 0) + 1,
			ul = E('ul', { class: 'tabs' }),
			children = ui.menu.getChildren(tree),
			activeNode = null;

		if (children.length == 0)
			return E([]);

		for (var i = 0; i < children.length; i++) {
			var isActive = (L.env.dispatchpath[l + 2] == children[i].name),
				activeClass = isActive ? ' active' : '',
				className = 'tabmenu-item-%s %s'.format(children[i].name, activeClass);

			ul.appendChild(E('li', { class: className }, [
				E('a', { href: L.url(url, children[i].name) }, [_(children[i].title)]),
			]));

			if (isActive)
				activeNode = children[i];
		}

		container.appendChild(ul);
		container.style.display = '';

		if (activeNode)
			container.appendChild(this.renderTabMenu(activeNode, url + '/' + activeNode.name, l));

		return ul;
	},

	handleSidebarToggle: function (_ev) {
		var showside = document.querySelector('a.showSide'),
			sidebar = document.querySelector('#mainmenu'),
			darkmask = document.querySelector('.darkMask'),
			scrollbar = document.querySelector('.main-right');

		if (showside.classList.contains('active')) {
			showside.classList.remove('active');
			sidebar.classList.remove('active');
			scrollbar.classList.remove('active');
			darkmask.classList.remove('active');
		} else {
			showside.classList.add('active');
			sidebar.classList.add('active');
			scrollbar.classList.add('active');
			darkmask.classList.add('active');
		}
	},
});
