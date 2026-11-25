/* globals baseclass request */
'require baseclass';
'require request';

/* The following class is ripped off from Firefox's default controls, with _some_ of the complexity
 * removed (e.g. PIP) and our custom controls added in.
 *
 * The added controls show themselves to the outside world by interacting
 * with the attributes on the custom element so that we can use a MutationObserver
 * externally to update as necessary.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
class VideoLiveElement extends HTMLElement {
	constructor() {
		super();
		this.attachShadow({ mode: 'open' });
		this.doneInit = false;
		if (!this.constructor.template) {
			throw Error('Bad code - need to set template');
		}
		this.shadowRoot.innerHTML = this.constructor.template;
	}

	// We do this dance because we want to store this template as 'real' HTML/CSS
	// (that editors can handle), so it can't be in this JS file and has to be loaded
	// separately. Remembering that in LuCI land we only have this JS and no HTML
	// template to throw things in...
	static setTemplate(template) {
		this.template = template;
	}

	setCustomStatus(text, icon = null) {
		if (this.Utils) {
			this.Utils.setCustomStatus(text ?? '', icon);
		}
	}

	init() {
		// This hackery is because attributeChangedCallback gets
		// called before the constructor gets a chance to set these.
		if (this.doneInit) {
			return;
		}

		// These are all the 'templated' elements which we mutate/setup on attributeChangedCallback.
		this.caption = this.shadowRoot.querySelector('figcaption');
		this.video = this.shadowRoot.querySelector('video');
		this.bitrateInput = this.shadowRoot.getElementById('bitrateInput');
		this.brightnessInput = this.shadowRoot.getElementById('brightnessInput');
		this.framerateInput = this.shadowRoot.getElementById('framerateInput');
		this.resolutionSelect = this.shadowRoot.getElementById('resolutionSelect');
		this.bitrateLabel = this.shadowRoot.querySelector(`label[for="${this.bitrateInput.id}"]`);
		this.framerateLabel = this.shadowRoot.querySelector(`label[for="${this.framerateInput.id}"]`);
		this.controls = this.shadowRoot.getElementById('controls');
		this.doneInit = true;
	}

	play() {
		if (this.Utils) {
			this.Utils.startPlay();
		}
	}

	pause() {
		if (this.Utils) {
			this.Utils.pause();
		}
	}

	get paused() {
		return this.video.paused;
	}

	get ended() {
		return this.video.ended;
	}

	static observedAttributes = ['caption', 'autoplay', 'src', 'bitrate', 'bitrate-min', 'bitrate-max', 'brightness', 'brightness-min', 'brightness-max', 'framerate', 'framerate-min', 'framerate-max', 'resolution', 'resolution-options'];

	attributeChangedCallback(name, oldValue, newValue) {
		this.init();

		switch (name) {
			case 'caption':
				this.caption.textContent = newValue.textContent;
				break;
			case 'autoplay':
				this.video.autoplay = newValue;
				break;
			case 'src':
				this.video.src = newValue;
				break;
			case 'brightness':
				this.brightnessInput.value = newValue;
				break;
			case 'brightness-min':
				this.brightnessInput.min = newValue;
				break;
			case 'brightness-max':
				this.brightnessInput.max = newValue;
				break;
			case 'bitrate':
				this.bitrateInput.value = Math.log(newValue);
				this.bitrateInput.dispatchEvent(new Event('input'));
				break;
			case 'bitrate-min':
				this.bitrateInput.min = Math.log(newValue);
				break;
			case 'bitrate-max':
				this.bitrateInput.max = Math.log(newValue);
				break;
			case 'framerate':
				this.framerateInput.value = Math.log(newValue);
				this.framerateInput.dispatchEvent(new Event('input'));
				break;
			case 'framerate-min':
				this.framerateInput.min = Math.log(newValue);
				break;
			case 'framerate-max':
				this.framerateInput.max = Math.log(newValue);
				break;
			case 'resolution-options':
				this.resolutionSelect.replaceChildren(...newValue.split(',').map((option) => {
					const optionElement = document.createElement('option');
					optionElement.selected = option === this.getAttribute('resolution');
					optionElement.value = option;
					optionElement.textContent = option;
					return optionElement;
				}));
				break;
			case 'resolution':
				for (const optionElement of this.resolutionSelect.children) {
					optionElement.selected = (optionElement.value === newValue);
				}
				break;
		}
	}

	setupAttributeDefaults() {
		if (!this.hasAttribute('resolution-options')) {
			this.setAttribute('resolution-options', '640x480,1280x720');
		}
		if (!this.hasAttribute('resolution')) {
			this.setAttribute('resolution', this.getAttribute('resolution-options').split(',')[0]);
		}

		if (!this.hasAttribute('bitrate-min')) {
			this.setAttribute('bitrate-min', 100);
		}
		if (!this.hasAttribute('bitrate-max')) {
			this.setAttribute('bitrate-max', 10000);
		}
		if (!this.hasAttribute('bitrate')) {
			this.setAttribute('bitrate', this.getAttribute('bitrate-max'));
		}

		if (!this.hasAttribute('brightness-min')) {
			this.setAttribute('brightness-min', 0);
		}
		if (!this.hasAttribute('brightness-max')) {
			this.setAttribute('brightness-max', 100);
		}
		if (!this.hasAttribute('brightness')) {
			this.setAttribute('brightness', this.getAttribute('brightness-max'));
		}

		if (!this.hasAttribute('framerate-min')) {
			this.setAttribute('framerate-min', 5);
		}
		if (!this.hasAttribute('framerate-max')) {
			this.setAttribute('framerate-max', 60);
		}
		if (!this.hasAttribute('framerate')) {
			this.setAttribute('framerate', this.getAttribute('framerate-max'));
		}
	}

	setupAttributeListeners() {
		// This is the inverse of our attributeChangedCallback method,
		// pushing changes to the input/select elements back into the attributes.
		// Annoyingly, this will cause the input element to get 'set' again,
		// but it's not clear to me how to stop this (and ultimately it doesn't
		// cause any issues).
		this.resolutionSelect.addEventListener('change', (e) => {
			this.setAttribute('resolution', e.target.value);
		});

		this.bitrateInput.addEventListener('change', (e) => {
			this.setAttribute('bitrate', Math.round(Math.E ** e.target.value));
		});

		this.framerateInput.addEventListener('change', (e) => {
			this.setAttribute('framerate', Math.round(Math.E ** e.target.value));
		});

		this.brightnessInput.addEventListener('change', (e) => {
			this.setAttribute('brightness', e.target.value);
		});
	}

	setupControlLabels() {
		// Update the labels for our controls as they change.
		// Use 'input' rather than 'change' so users have feedback as it's happening.

		this.bitrateInput.addEventListener('input', (e) => {
			this.bitrateLabel.textContent = `${Math.round(Math.E ** e.target.value)}kbps`;
		});

		this.framerateInput.addEventListener('input', (e) => {
			this.framerateLabel.textContent = `${Math.round(Math.E ** e.target.value)}fps`;
		});

		this.bitrateInput.dispatchEvent(new Event('input'));
		this.framerateInput.dispatchEvent(new Event('input'));
	}

	connectedCallback() {
		this.document = document;
		this.window = this.document.defaultView;

		this.setupAttributeDefaults();
		this.setupAttributeListeners();
		this.setupControlLabels();

		this.Utils = {
			debug: false,
			elem: null,
			video: null,
			videocontrols: null,
			controlBar: null,
			playButton: null,
			resolutionSelect: null,
			bitrateControl: null,
			muteButton: null,
			volumeControl: null,
			statusOverlay: null,
			controlsSpacer: null,
			clickToPlay: null,
			controlsOverlay: null,
			fullscreenButton: null,
			layoutControls: null,

			videoEvents: [
				'play',
				'pause',
				'ended',
				'volumechange',
				'loadeddata',
				'loadstart',
				'timeupdate',
				'playing',
				'waiting',
				'canplay',
				'canplaythrough',
				'seeking',
				'seeked',
				'emptied',
				'loadedmetadata',
				'error',
				'suspend',
				'stalled',
			],

			showHours: false,
			firstFrameShown: false,
			timeUpdateCount: 0,
			maxCurrentTimeSeen: 0,
			isPausedByDragging: false,
			_isAudioOnly: false,

			get isAudioOnly() {
				return this._isAudioOnly;
			},
			set isAudioOnly(val) {
				this._isAudioOnly = val;
				this.setFullscreenButtonState();

				if (this._isAudioOnly) {
					this.video.style.height = this.controlBarMinHeight + 'px';
					this.video.style.width = '66%';
				} else {
					this.video.style.removeProperty('height');
					this.video.style.removeProperty('width');
				}
			},

			suppressError: false,

			setupStatusFader(immediate) {
				// Since the play button will be showing, we don't want to
				// show the throbber behind it. The throbber here will
				// only show if needed after the play button has been pressed.
				if (!this.clickToPlay.hidden) {
					this.startFadeOut(this.statusOverlay, true);
					return;
				}

				var show = false;

				if (
					this.video.seeking
					|| (this.statusText.innerText && !this.suppressError)
					|| this.video.networkState == this.video.NETWORK_NO_SOURCE
					|| (this.video.networkState == this.video.NETWORK_LOADING
					&& (this.video.paused || this.video.ended
						? this.video.readyState < this.video.HAVE_CURRENT_DATA
						: this.video.readyState < this.video.HAVE_FUTURE_DATA))
						|| (this.timeUpdateCount <= 1
						&& !this.video.ended
						&& this.video.readyState < this.video.HAVE_FUTURE_DATA
						&& this.video.networkState == this.video.NETWORK_LOADING)
				) {
					show = true;
				}

				// Explicitly hide the status fader if this
				// is audio only until bug 619421 is fixed.
				if (this.isAudioOnly) {
					show = false;
				}

				if (this._showThrobberTimer) {
					show = true;
				}

				this.log(
					'Status overlay: seeking='
					+ this.video.seeking
					+ ' error='
					+ this.video.error
					+ ' readyState='
					+ this.video.readyState
					+ ' paused='
					+ this.video.paused
					+ ' ended='
					+ this.video.ended
					+ ' networkState='
					+ this.video.networkState
					+ ' timeUpdateCount='
					+ this.timeUpdateCount
					+ ' _showThrobberTimer='
					+ this._showThrobberTimer
					+ ' --> '
					+ (show ? 'SHOW' : 'HIDE'),
				);
				this.startFade(this.statusOverlay, show, immediate);
			},

			hasAudio() {
				// Hard to detect on Blink - have to wait until stream started?
				// So just report true always.
				return this.video.mozHasAudio !== false;
			},

			/*
			 * Set the initial state of the controls. The UA widget is normally created along
			 * with video element, but could be attached at any point (eg, if the video is
			 * removed from the document and then reinserted). Thus, some one-time events may
			 * have already fired, and so we'll need to explicitly check the initial state.
			 */
			setupInitialState() {
				this.setPlayButtonState(this.video.paused);

				this.setFullscreenButtonState();

				// If we have metadata, check if this is a <video> without
				// video data, or a video with no audio track.
				if (this.video.readyState >= this.video.HAVE_METADATA) {
					if (
						this.video.localName == 'video'
						&& (this.video.videoWidth == 0 || this.video.videoHeight == 0)
					) {
						this.isAudioOnly = true;
					}

					// We have to check again if the media has audio here.
					if (!this.isAudioOnly && !this.hasAudio()) {
						this.muteButton.setAttribute('noAudio', 'true');
						this.muteButton.disabled = true;
					}
				}

				// The video itself might not be fullscreen, but part of the
				// document might be, in which case we set this attribute to
				// apply any styles for the DOM fullscreen case.
				if (this.document.fullscreenElement) {
					this.videocontrols.setAttribute('inDOMFullscreen', true);
				}

				if (this.isAudioOnly) {
					this.startFadeOut(this.clickToPlay, true);
				}

				// If the first frame hasn't loaded, kick off a throbber fade-in.
				if (this.video.readyState >= this.video.HAVE_CURRENT_DATA) {
					this.firstFrameShown = true;
				}

				// Set the current status icon.
				if (this.hasError()) {
					this.startFadeOut(this.clickToPlay, true);
					this.statusIcon.setAttribute('type', 'error');
					this.updateErrorText();
					this.setupStatusFader(true);
				}

				let adjustableControls = [
					...this.prioritizedControls,
					this.controlBar,
					this.clickToPlay,
				];

				for (let control of adjustableControls) {
					if (!control) {
						break;
					}

					this.defineControlProperties(control);
				}
				this.adjustControlSize();

				// Can only update the volume controls once we've computed
				// _volumeControlWidth, since the volume slider implementation
				// depends on it.
				this.updateVolumeControls();
			},

			defineControlProperties(control) {
				let throwOnGet = {
					get() {
						throw new Error('Please don\'t trigger reflow. See bug 1493525.');
					},
				};
				Object.defineProperties(control, {
					// We should directly access CSSOM to get pre-defined style instead of
					// retrieving computed dimensions from layout.
					minWidth: {
						get: () => {
							let controlId = control.id;
							let propertyName = `--${controlId}-width`;
							if (control.modifier) {
								propertyName += '-' + control.modifier;
							}
							let preDefinedSize = this.controlBarComputedStyles.getPropertyValue(
								propertyName,
							);

							// The stylesheet from <link> might not be loaded if the
							// element was inserted into a hidden iframe.
							// We can safely return 0 here for now, given that the controls
							// will be resized again, by the resizevideocontrols event,
							// from nsVideoFrame, when the element is visible.
							if (!preDefinedSize) {
								return 0;
							}

							return parseInt(preDefinedSize, 10);
						},
					},
					offsetLeft: throwOnGet,
					offsetTop: throwOnGet,
					offsetWidth: throwOnGet,
					offsetHeight: throwOnGet,
					offsetParent: throwOnGet,
					clientLeft: throwOnGet,
					clientTop: throwOnGet,
					clientWidth: throwOnGet,
					clientHeight: throwOnGet,
					getClientRects: throwOnGet,
					getBoundingClientRect: throwOnGet,
					isAdjustableControl: {
						value: true,
					},
					modifier: {
						value: '',
						writable: true,
					},
					isWanted: {
						value: true,
						writable: true,
					},
					hidden: {
						set: (v) => {
							control._isHiddenExplicitly = v;
							control._updateHiddenAttribute();
						},
						get: () => {
							return (
								control.hasAttribute('hidden')
								|| control.classList.contains('fadeout')
							);
						},
					},
					hiddenByAdjustment: {
						set: (v) => {
							control._isHiddenByAdjustment = v;
							control._updateHiddenAttribute();
						},
						get: () => control._isHiddenByAdjustment,
					},
					_isHiddenByAdjustment: {
						value: false,
						writable: true,
					},
					_isHiddenExplicitly: {
						value: false,
						writable: true,
					},
					_updateHiddenAttribute: {
						value: () => {
							control.toggleAttribute(
								'hidden',
								control._isHiddenExplicitly || control._isHiddenByAdjustment,
							);
						},
					},
				});
			},

			setupNewLoadState() {
				// For videos with |autoplay| set, we'll leave the controls initially hidden,
				// so that they don't get in the way of the playing video. Otherwise we'll
				// go ahead and reveal the controls now, so they're an obvious user cue.
				var shouldShow
					= !this.dynamicControls || (this.video.paused && !this.video.autoplay);
				// Hide the overlay if the video time is non-zero or if an error occurred to workaround bug 718107.
				let shouldClickToPlayShow
					= shouldShow
					&& !this.isAudioOnly
					&& this.video.currentTime == 0
					&& !this.hasError();
				this.startFade(this.clickToPlay, shouldClickToPlayShow, true);
				this.startFade(this.controlBar, shouldShow, true);
			},

			get dynamicControls() {
				// Don't fade controls for <audio> elements.
				var enabled = !this.isAudioOnly;

				// If the video hits an error, suppress controls if it
				// hasn't managed to do anything else yet.
				if (!this.firstFrameShown && this.hasError()) {
					enabled = false;
				}

				return enabled;
			},

			updateVolume() {
				const volume = this.volumeControl.value;
				this.setVolume(volume / 100);
			},

			updateVolumeControls() {
				var volume = this.video.muted ? 0 : this.video.volume;
				var volumePercentage = Math.round(volume * 100);
				this.updateMuteButtonState();
				this.volumeControl.value = volumePercentage;
			},

			/*
			 * We suspend a video element's video decoder if the video
			 * element is invisible. However, resuming the video decoder
			 * takes time and we show the throbber UI if it takes more than
			 * 250 ms.
			 *
			 * When an already-suspended video element becomes visible, we
			 * resume its video decoder immediately.
			 */
			SHOW_THROBBER_TIMEOUT_MS: 250,
			_showThrobberTimer: null,
			_delayShowThrobberWhileResumingVideoDecoder() {
				this._showThrobberTimer = this.window.setTimeout(() => {
					this.statusIcon.setAttribute('type', 'throbber');
					// Show the throbber immediately since we have waited for SHOW_THROBBER_TIMEOUT_MS.
					// We don't want to wait for another animation delay(750ms) and the
					// animation duration(300ms).
					this.setupStatusFader(true);
				}, this.SHOW_THROBBER_TIMEOUT_MS);
			},
			_cancelShowThrobberWhileResumingVideoDecoder() {
				if (this._showThrobberTimer) {
					this.window.clearTimeout(this._showThrobberTimer);
					this._showThrobberTimer = null;
				}
			},

			handleEvent(aEvent) {
				if (!aEvent.isTrusted) {
					this.log('Drop untrusted event ----> ' + aEvent.type);
					return;
				}

				this.log('Got event ----> ' + aEvent.type);

				if (this.videoEvents.includes(aEvent.type)) {
					this.handleVideoEvent(aEvent);
				} else {
					this.handleControlEvent(aEvent);
				}
			},

			handleVideoEvent(aEvent) {
				switch (aEvent.type) {
					case 'play':
						this.setPlayButtonState(false);
						this.setupStatusFader();
						if (
							!this._triggeredByControls
							&& this.dynamicControls
							&& this.isTouchControls
						) {
							this.startFadeOut(this.controlBar);
						}
						if (!this._triggeredByControls) {
							this.startFadeOut(this.clickToPlay, true);
						}
						this._triggeredByControls = false;
						break;
					case 'pause':
						this.setPlayButtonState(true);
						this.setupStatusFader();
						break;
					case 'ended':
						this.setPlayButtonState(true);
						this.startFadeIn(this.controlBar);
						this.setupStatusFader();
						break;
					case 'volumechange':
						this.updateVolumeControls();
						// Show the controls to highlight the changing volume,
						// but only if the click-to-play overlay has already
						// been hidden (we don't hide controls when the overlay is visible).
						if (this.clickToPlay.hidden && !this.isAudioOnly) {
							this.startFadeIn(this.controlBar);
							this.window.clearTimeout(this._hideControlsTimeout);
							this._hideControlsTimeout = this.window.setTimeout(
								() => this._hideControlsFn(),
								this.HIDE_CONTROLS_TIMEOUT_MS,
							);
						}
						break;
					case 'loadedmetadata':
					// If a <video> doesn't have any video data, treat it as <audio>
					// and show the controls (they won't fade back out)
						if (
							this.video.localName == 'video'
							&& (this.video.videoWidth == 0 || this.video.videoHeight == 0)
						) {
							this.isAudioOnly = true;
							this.startFadeOut(this.clickToPlay, true);
							this.startFadeIn(this.controlBar);
							this.setFullscreenButtonState();
						}
						if (!this.isAudioOnly && !this.hasAudio()) {
							this.muteButton.setAttribute('noAudio', 'true');
							this.muteButton.disabled = true;
						}
						this.adjustControlSize();
						break;
					case 'loadeddata':
						this.firstFrameShown = true;
						this.setupStatusFader();
						break;
					case 'loadstart':
						this.maxCurrentTimeSeen = 0;
						this.controlsSpacer.removeAttribute('aria-label');
						this.statusOverlay.removeAttribute('status');
						this.statusIcon.setAttribute('type', 'throbber');
						this.isAudioOnly = this.video.localName == 'audio';
						this.setPlayButtonState(true);
						this.setupNewLoadState();
						this.setupStatusFader();
						break;
					case 'progress':
						this.statusIcon.removeAttribute('stalled');
						this.setupStatusFader();
						break;
					case 'stalled':
						this.statusIcon.setAttribute('stalled', 'true');
						this.statusIcon.setAttribute('type', 'throbber');
						this.setupStatusFader();
						break;
					case 'suspend':
						this.setupStatusFader();
						break;
					case 'timeupdate':
					// If playing/seeking after the video ended, we won't get a "play"
					// event, so update the button state here.
						if (!this.video.paused) {
							this.setPlayButtonState(false);
						}

						this.timeUpdateCount++;
						// Whether we show the statusOverlay sometimes depends
						// on whether we've seen more than one timeupdate
						// event (if we haven't, there hasn't been any
						// "playback activity" and we may wish to show the
						// statusOverlay while we wait for HAVE_ENOUGH_DATA).
						// If we've seen more than 2 timeupdate events,
						// the count is no longer relevant to setupStatusFader.
						if (this.timeUpdateCount <= 2) {
							this.setupStatusFader();
						}

						break;
					case 'seeking':
						this.statusIcon.setAttribute('type', 'throbber');
						this.setupStatusFader();
						break;
					case 'waiting':
						this.statusIcon.setAttribute('type', 'throbber');
						this.setupStatusFader();
						break;
					case 'seeked':
					case 'playing':
					case 'canplay':
					case 'canplaythrough':
						this.setupStatusFader();
						break;
					case 'error':
					// We'll show the error status icon when we receive an error event
					// under either of the following conditions:
					// 1. The video has its error attribute set; this means we're loading
					//    from our src attribute, and the load failed, or we we're loading
					//    from source children and the decode or playback failed after we
					//    determined our selected resource was playable.
					// 2. The video's networkState is NETWORK_NO_SOURCE. This means we we're
					//    loading from child source elements, but we were unable to select
					//    any of the child elements for playback during resource selection.
						if (this.hasError()) {
							this.suppressError = false;
							this.startFadeOut(this.clickToPlay, true);
							this.statusIcon.setAttribute('type', 'error');
							this.updateErrorText();
							this.setupStatusFader(true);
							// If video hasn't shown anything yet, disable the controls.
							if (!this.firstFrameShown && !this.isAudioOnly) {
								this.startFadeOut(this.controlBar);
							}
							this.controlsSpacer.removeAttribute('hideCursor');
						}
						break;
					default:
						this.log('!!! media event ' + aEvent.type + ' not handled!');
				}
			},

			handleControlEvent(aEvent) {
				switch (aEvent.type) {
					case 'click':
						switch (aEvent.currentTarget) {
							case this.muteButton:
								this.toggleMute();
								break;
							case this.fullscreenButton:
								this.toggleFullscreen();
								break;
							case this.playButton:
							case this.clickToPlay:
							case this.controlsSpacer:
								this.clickToPlayClickHandler(aEvent);
								break;
							case this.videocontrols:
								// Prevent any click event within media controls from dispatching through to video.
								aEvent.stopPropagation();
								break;
						}
						break;
					case 'dblclick':
						this.toggleFullscreen();
						break;
					case 'resizevideocontrols':
					// Since this event come from the layout, this is the only place
					// we are sure of that probing into layout won't trigger or force
					// reflow.
						this.updateReflowedDimensions();
						this.adjustControlSize();
						break;
					case 'fullscreenchange':
						this.onFullscreenChange();
						break;
					case 'keypress':
						this.keyHandler(aEvent);
						break;
					case 'dragstart':
						aEvent.preventDefault(); // prevent dragging of controls image (bug 517114)
						break;
					case 'input':
						switch (aEvent.currentTarget) {
							case this.volumeControl:
								this.updateVolume();
								break;
						}
						break;
					case 'change':
						break;
					case 'mouseup':
						break;
					case 'focusin':
					// Show the controls to highlight the focused control, but only
					// under certain conditions:
						if (
						// The click-to-play overlay must already be hidden (we don't
						// hide controls when the overlay is visible).
							this.clickToPlay.hidden
							// Don't do this if the controls are static.
							&& this.dynamicControls
							// If the mouse is hovering over the control bar, the controls
							// are already showing and they shouldn't hide, so don't mess
							// with them.
							// We use "div:hover" instead of just ":hover" so this works in
							// quirks mode documents. See
							// https://quirks.spec.whatwg.org/#the-active-and-hover-quirk
							&& !this.controlBar.matches('div:hover')
						) {
							this.startFadeIn(this.controlBar);
							this.window.clearTimeout(this._hideControlsTimeout);
							this._hideControlsTimeout = this.window.setTimeout(
								() => this._hideControlsFn(),
								this.HIDE_CONTROLS_TIMEOUT_MS,
							);
						}
						break;
					case 'mousedown':
					// We only listen for mousedown on sliders.
					// If this slider isn't focused already, mousedown will focus it.
					// We don't want that because it will then handle additional keys.
					// For example, we don't want the up/down arrow keys to seek after
					// the scrubber is clicked. To prevent that, we need to redirect
					// focus. However, dragging only works while the slider is focused,
					// so we must redirect focus after mouseup.
						if (
							!aEvent.currentTarget.matches(':focus')
						) {
							aEvent.currentTarget.addEventListener(
								'mouseup',
								(aEvent) => {
									if (aEvent.currentTarget.matches(':focus')) {
									// We can't use target.blur() because that will blur the
									// video element as well.
										this.video.focus();
									}
								},
								{ once: true },
							);
						}
						break;
					default:
						this.log('!!! control event ' + aEvent.type + ' not handled!');
				}
			},

			terminate() {
				if (this.videoEvents) {
					for (let event of this.videoEvents) {
						try {
							this.video.removeEventListener(event, this, {
								capture: true,
								mozSystemGroup: true,
							});
						} catch (ex) { /* continue regardless of error */ }
					}
				}

				try {
					for (let { el, type, capture = false } of this.controlsEvents) {
						el.removeEventListener(type, this, {
							mozSystemGroup: true,
							capture,
						});
					}
				} catch (ex) { /* continue regardless of error */ }

				this.window.clearTimeout(this._showControlsTimeout);
				this.window.clearTimeout(this._hideControlsTimeout);
				this._cancelShowThrobberWhileResumingVideoDecoder();

				this.log('--- videocontrols terminated ---');
			},

			hasError() {
				// We either have an explicit error, or the resource selection
				// algorithm is running and we've tried to load something and failed.
				// Note: we don't consider the case where we've tried to load but
				// there's no sources to load as an error condition, as sites may
				// do this intentionally to work around requires-user-interaction to
				// play restrictions, and we don't want to display a debug message
				// if that's the case.
				return (
					this.video.error != null
					|| (this.video.networkState == this.video.NETWORK_NO_SOURCE
					&& this.hasSources())
				);
			},

			hasSources() {
				if (
					this.video.hasAttribute('src')
					&& this.video.getAttribute('src') !== ''
				) {
					return true;
				}
				for (
					var child = this.video.firstChild;
					child !== null;
					child = child.nextElementSibling
				) {
					if (child instanceof this.window.HTMLSourceElement) {
						return true;
					}
				}
				return false;
			},

			setCustomStatus(text, icon = null) {
				this.setStatusText(text);
				this.statusIcon.setAttribute('type', icon);
				this.setupStatusFader(true);
			},

			updateErrorText() {
				let error;
				let v = this.video;
				// It is possible to have both v.networkState == NETWORK_NO_SOURCE
				// as well as v.error being non-null. In this case, we will show
				// the v.error.code instead of the v.networkState error.
				if (v.error) {
					switch (v.error.code) {
						case v.error.MEDIA_ERR_ABORTED:
							error = _('Error: playback aborted');
							break;
						case v.error.MEDIA_ERR_NETWORK:
							error = _('Error: network issue');
							break;
						case v.error.MEDIA_ERR_DECODE:
							error = _('Error: decoding problem');
							break;
						case v.error.MEDIA_ERR_SRC_NOT_SUPPORTED:
							error
								= v.networkState == v.NETWORK_NO_SOURCE
									? _('Error: no source specified')
									: _('Error: unsupported source');
							break;
						default:
							error = 'errorGeneric';
							break;
					}
				} else if (v.networkState == v.NETWORK_NO_SOURCE) {
					error = _('Error: no source specified');
				} else {
					error = '';
				}

				this.setStatusText(error);
			},

			setStatusText(text) {
				this.controlsSpacer.setAttribute('aria-label', text);
				this.statusText.innerText = text;
			},

			setVolume(newVolume) {
				this.log('*** setting volume to ' + newVolume);
				this.video.volume = newVolume;
				this.video.muted = false;
			},

			_controlsHiddenByTimeout: false,
			_showControlsTimeout: 0,
			SHOW_CONTROLS_TIMEOUT_MS: 500,
			_showControlsFn() {
				if (this.video.matches('video:hover')) {
					this.startFadeIn(this.controlBar, false);
					this._showControlsTimeout = 0;
					this._controlsHiddenByTimeout = false;
				}
			},

			_hideControlsTimeout: 0,
			_hideControlsFn() {
				this.startFade(this.controlBar, false);
				this._hideControlsTimeout = 0;
				this._controlsHiddenByTimeout = true;
			},
			HIDE_CONTROLS_TIMEOUT_MS: 2000,

			// By "Video" we actually mean the video controls container,
			// because we don't want to consider the padding of <video> added
			// by the web content.
			isMouseOverVideo(event) {
				// XXX: this triggers reflow too, but the layout should only be dirty
				// if the web content touches it while the mouse is moving.
				let el = document.elementFromPoint(event.clientX, event.clientY);

				return this.shadowRoot.contains(el);
			},

			isMouseOverControlBar(event) {
				// XXX: this triggers reflow too, but the layout should only be dirty
				// if the web content touches it while the mouse is moving.
				let el = this.shadowRoot.elementFromPoint(event.clientX, event.clientY);
				while (el && el !== this.shadowRoot) {
					if (el == this.controlBar) {
						return true;
					}
					el = el.parentNode;
				}
				return false;
			},

			onMouseMove(event) {
				// If the controls are static, don't change anything.
				if (!this.dynamicControls) {
					return;
				}

				this.window.clearTimeout(this._hideControlsTimeout);

				// Suppress fading out the controls until the video has rendered
				// its first frame. But since autoplay videos start off with no
				// controls, let them fade-out so the controls don't get stuck on.
				if (!this.firstFrameShown && !this.video.autoplay) {
					return;
				}

				if (this._controlsHiddenByTimeout) {
					this._showControlsTimeout = this.window.setTimeout(
						() => this._showControlsFn(),
						this.SHOW_CONTROLS_TIMEOUT_MS,
					);
				} else {
					this.startFade(this.controlBar, true);
				}

				// Hide the controls if the mouse cursor is left on top of the video
				// but above the control bar and if the click-to-play overlay is hidden.
				if (
					(this._controlsHiddenByTimeout
					|| !this.isMouseOverControlBar(event))
					&& this.clickToPlay.hidden
				) {
					this._hideControlsTimeout = this.window.setTimeout(
						() => this._hideControlsFn(),
						this.HIDE_CONTROLS_TIMEOUT_MS,
					);
				}
			},

			onMouseInOut(event) {
				// If the controls are static, don't change anything.
				if (!this.dynamicControls) {
					return;
				}

				this.window.clearTimeout(this._hideControlsTimeout);

				let isMouseOverVideo = this.isMouseOverVideo(event);

				// Suppress fading out the controls until the video has rendered
				// its first frame. But since autoplay videos start off with no
				// controls, let them fade-out so the controls don't get stuck on.
				if (
					!this.firstFrameShown
					&& !isMouseOverVideo
					&& !this.video.autoplay
				) {
					return;
				}

				if (!isMouseOverVideo && !this.isMouseOverControlBar(event)) {
					this.adjustControlSize();

					// Keep the controls visible if the click-to-play is visible.
					if (!this.clickToPlay.hidden) {
						return;
					}

					this.startFadeOut(this.controlBar, false);
					this.window.clearTimeout(this._showControlsTimeout);
					this._controlsHiddenByTimeout = false;
				}
			},

			startFadeIn(element, immediate) {
				this.startFade(element, true, immediate);
			},

			startFadeOut(element, immediate) {
				this.startFade(element, false, immediate);
			},

			animationMap: new WeakMap(),

			animationProps: {
				clickToPlay: {
					keyframes: [
						{ transform: 'scale(3)', opacity: 0 },
						{ transform: 'scale(1)', opacity: 0.55 },
					],
					options: {
						easing: 'ease',
						duration: 400,
						// The fill mode here and below is a workaround to avoid flicker
						// due to bug 1495350.
						fill: 'both',
					},
				},
				controlBar: {
					keyframes: [{ opacity: 0 }, { opacity: 1 }],
					options: {
						easing: 'ease',
						duration: 200,
						fill: 'both',
					},
				},
				statusOverlay: {
					keyframes: [
						{ opacity: 0 },
						{ opacity: 0, offset: 0.72 }, // ~750ms into animation
						{ opacity: 1 },
					],
					options: {
						duration: 1050,
						fill: 'both',
					},
				},
			},

			startFade(element, fadeIn, immediate = false) {
				let animationProp = this.animationProps[element.id];
				if (!animationProp) {
					throw new Error(
						'Element '
						+ element.id
						+ ' has no transition. Toggle the hidden property directly.',
					);
				}

				let animation = this.animationMap.get(element);
				if (!animation) {
					animation = new this.window.Animation(
						new this.window.KeyframeEffect(
							element,
							animationProp.keyframes,
							animationProp.options,
						),
					);

					this.animationMap.set(element, animation);
				}

				if (fadeIn) {
					if (element == this.controlBar) {
						this.controlsSpacer.removeAttribute('hideCursor');
						// Ensure the Full Screen button is in the tab order.
						this.fullscreenButton.removeAttribute('tabindex');
					}

					// hidden state should be controlled by adjustControlSize
					if (element.isAdjustableControl && element.hiddenByAdjustment) {
						return;
					}

					// No need to fade in again if the hidden property returns false
					// (not hidden and not fading out.)
					if (!element.hidden) {
						return;
					}

					// Unhide
					element.hidden = false;
				} else {
					if (element == this.controlBar) {
						if (!this.hasError() && this.isVideoInFullScreen) {
							this.controlsSpacer.setAttribute('hideCursor', true);
						}
						// The Full Screen button is currently the only tabbable button
						// when the controls are shown. Remove it from the tab order when
						// visually hidden to prevent visual confusion.
						this.fullscreenButton.setAttribute('tabindex', '-1');
					}

					// No need to fade out if the hidden property returns true
					// (hidden or is fading out)
					if (element.hidden) {
						return;
					}
				}

				element.classList.toggle('fadeout', !fadeIn);
				element.classList.toggle('fadein', fadeIn);
				let finishedPromise;
				if (!immediate) {
					// At this point, if there is a pending animation, we just stop it to avoid it happening.
					// If there is a running animation, we reverse it, to have it rewind to the beginning.
					// If there is an idle/finished animation, we schedule a new one that reverses the finished one.
					if (animation.pending) {
						// Animation is running but pending.
						// Just cancel the pending animation to stop its effect.
						animation.cancel();
						finishedPromise = Promise.resolve();
					} else {
						switch (animation.playState) {
							case 'idle':
							case 'finished':
							// There is no animation currently playing.
							// Schedule a new animation with the desired playback direction.
								animation.playbackRate = fadeIn ? 1 : -1;
								animation.play();
								break;
							case 'running':
							// Allow the animation to play from its current position in
							// reverse to finish.
								animation.reverse();
								break;
							case 'pause':
								throw new Error('Animation should never reach pause state.');
							default:
								throw new Error(
									'Unknown Animation playState: ' + animation.playState,
								);
						}
						finishedPromise = animation.finished;
					}
				} else {
					// immediate
					animation.cancel();
					finishedPromise = Promise.resolve();
				}
				finishedPromise.then(
					(animation) => {
						if (element == this.controlBar) {
							this.onControlBarAnimationFinished();
						}
						element.classList.remove(fadeIn ? 'fadein' : 'fadeout');
						if (!fadeIn) {
							element.hidden = true;
						}
						if (animation) {
							// Explicitly clear the animation effect so that filling animations
							// stop overwriting stylesheet styles. Remove when bug 1495350 is
							// fixed and animations are no longer filling animations.
							// This also stops them from accumulating (See bug 1253476).
							animation.cancel();
						}
					},
					() => {
						/* Do nothing on rejection */
					},
				);
			},

			_triggeredByControls: false,

			startPlay() {
				this._triggeredByControls = true;
				this.hideClickToPlay();
				this.video.play();
			},

			togglePause() {
				if (this.video.paused || this.video.ended) {
					this.startPlay();
				} else {
					this.pause();
				}
			},

			pause() {
				this.video.pause();
			},

			get isVideoWithoutAudioTrack() {
				return (
					this.video.readyState >= this.video.HAVE_METADATA
					&& !this.isAudioOnly
					&& !this.hasAudio()
				);
			},

			toggleMute() {
				if (this.isVideoWithoutAudioTrack) {
					return;
				}
				this.video.muted = !this.isEffectivelyMuted;
				if (this.video.volume === 0) {
					this.video.volume = 0.5;
				}

				// We'll handle style changes in the event listener for
				// the "volumechange" event, same as if content script was
				// controlling volume.
			},

			get isVideoInFullScreen() {
				return this.elem.isSameNode(document.fullscreenElement || document.webkitFullscreenElement);
			},

			toggleFullscreen() {
				if (this.isVideoInFullScreen) {
					if (this.document.exitFullscreen) {
						this.document.exitFullscreen();
					} else if (this.document.webkitExitFullscreen) {
						this.document.webkitExitFullscreen();
					}
				} else {
					const figure = this.shadowRoot.lastElementChild;
					if (figure.requestFullscreen) {
						figure.requestFullscreen();
					} else if (figure.webkitRequestFullscreen) {
						figure.webkitRequestFullscreen();
					}
				}
			},

			setFullscreenButtonState() {
				if (this.isAudioOnly || !(this.document.fullscreenEnabled || this.document.webkitFullscreenEnabled)) {
					this.controlBar.setAttribute('fullscreen-unavailable', true);
					this.adjustControlSize();
					return;
				}
				this.controlBar.removeAttribute('fullscreen-unavailable');
				this.adjustControlSize();

				if (this.isVideoInFullScreen) {
					this.fullscreenButton.setAttribute('fullscreened', 'true');
				} else {
					this.fullscreenButton.removeAttribute('fullscreened');
				}
			},

			onFullscreenChange() {
				if (this.document.fullscreenElement) {
					this.videocontrols.setAttribute('inDOMFullscreen', true);
				} else {
					this.videocontrols.removeAttribute('inDOMFullscreen');
				}

				if (this.isVideoInFullScreen) {
					this.startFadeOut(this.controlBar, true);
				}

				this.setFullscreenButtonState();
			},

			clickToPlayClickHandler(e) {
				if (e.button != 0) {
					return;
				}
				if (this.hasError() && !this.suppressError) {
					// Errors that can be dismissed should be placed here as we discover them.
					if (this.video.error.code != this.video.error.MEDIA_ERR_ABORTED) {
						return;
					}
					this.startFadeOut(this.statusOverlay, true);
					this.suppressError = true;
					return;
				}
				if (e.defaultPrevented) {
					return;
				}
				if (this.playButton.hasAttribute('paused')) {
					this.elem.dispatchEvent(new Event('userplay'));
					this.startPlay();
				} else {
					this.elem.dispatchEvent(new Event('userpause'));
					this.pause();
				}
			},
			hideClickToPlay() {
				let videoHeight = this.reflowedDimensions.videoHeight;
				let videoWidth = this.reflowedDimensions.videoWidth;

				// The play button will animate to 3x its size. This
				// shows the animation unless the video is too small
				// to show 2/3 of the animation.
				let animationScale = 2;
				let animationMinSize = this.clickToPlay.minWidth * animationScale;

				let immediate
					= animationMinSize > videoWidth
					|| animationMinSize > videoHeight - this.controlBarMinHeight;
				this.startFadeOut(this.clickToPlay, immediate);
			},

			setPlayButtonState(aPaused) {
				if (aPaused) {
					this.playButton.setAttribute('paused', 'true');
				} else {
					this.playButton.removeAttribute('paused');
				}
			},

			get isEffectivelyMuted() {
				return this.video.muted || !this.video.volume;
			},

			updateMuteButtonState() {
				var muted = this.isEffectivelyMuted;

				if (muted) {
					this.muteButton.setAttribute('muted', 'true');
				} else {
					this.muteButton.removeAttribute('muted');
				}
			},

			keyboardVolumeDecrease() {
				const oldval = this.video.volume;
				this.video.volume = oldval < 0.1 ? 0 : oldval - 0.1;
				this.video.muted = false;
			},

			keyboardVolumeIncrease() {
				const oldval = this.video.volume;
				this.video.volume = oldval > 0.9 ? 1 : oldval + 0.1;
				this.video.muted = false;
			},

			keyHandler(event) {
				// Ignore keys when content might be providing its own.
				if (!this.video.hasAttribute('controls')) {
					return;
				}

				let keystroke = '';
				if (event.altKey) {
					keystroke += 'alt-';
				}
				if (event.shiftKey) {
					keystroke += 'shift-';
				}
				if (this.window.navigator.platform.startsWith('Mac')) {
					if (event.metaKey) {
						keystroke += 'accel-';
					}
					if (event.ctrlKey) {
						keystroke += 'control-';
					}
				} else {
					if (event.metaKey) {
						keystroke += 'meta-';
					}
					if (event.ctrlKey) {
						keystroke += 'accel-';
					}
				}
				if (event.key == ' ') {
					keystroke += 'Space';
				} else {
					keystroke += event.key;
				}

				this.log('Got keystroke: ' + keystroke);

				// If unmodified cursor keys are pressed when a slider is focused, we
				// should act on that slider. For example, if we're focused on the
				// volume slider, rightArrow should increase the volume, not seek.
				// Normally, we'd just pass the keys through to the slider in this case.
				// However, the native adjustment is too small, so we override it.
				try {
					// TODO: originalTarget is a mozilla specific thing...
					const target = event.originalTarget;
					switch (keystroke) {
						case 'Space' /* Play */:
							if (target.localName === 'button' && !target.disabled) {
								break;
							}
							this.togglePause();
							break;
						case 'ArrowDown' /* Volume decrease */:
							this.keyboardVolumeDecrease();
							break;
						case 'ArrowUp' /* Volume increase */:
							this.keyboardVolumeIncrease();
							break;
						case 'accel-ArrowDown' /* Mute */:
							this.video.muted = true;
							break;
						case 'accel-ArrowUp' /* Unmute */:
							this.video.muted = false;
							break;
						case 'ArrowLeft':
							this.keyboardVolumeDecrease();
							break;
						case 'ArrowRight':
							this.keyboardVolumeIncrease();
							break;
						default:
							return;
					}
				} catch (e) {
					/* ignore any exception from setting .currentTime */
				}

				event.preventDefault(); // Prevent page scrolling
			},

			onControlBarAnimationFinished() {
				this.video.dispatchEvent(
					new this.window.CustomEvent('controlbarchange'),
				);
				this.adjustControlSize();
			},

			log(msg) {
				if (this.debug) {
					this.window.console.log('videoctl: ' + msg + '\n');
				}
			},

			controlBarMinHeight: 40,
			controlBarMinVisibleHeight: 28,

			reflowedDimensions: {
				// Set the dimensions to intrinsic <video> dimensions before the first
				// update.
				// These values are not picked up by <audio> in adjustControlSize()
				// (except for the fact that they are non-zero),
				// it takes controlBarMinHeight and the value below instead.
				videoHeight: 150,
				videoWidth: 300,

				// <audio> takes this width to grow/shrink controls.
				// The initial value has to be smaller than the calculated minRequiredWidth
				// so that we don't run into bug 1495821 (see comment on adjustControlSize()
				// below)
				videocontrolsWidth: 0,
			},

			updateReflowedDimensions() {
				this.reflowedDimensions.videoHeight = this.video.clientHeight;
				this.reflowedDimensions.videoWidth = this.video.clientWidth;
				this.reflowedDimensions.videocontrolsWidth = this.videocontrols.clientWidth;
			},

			/**
			 * adjustControlSize() considers outer dimensions of the <video>/<audio> element
			 * from layout, and accordingly, sets/hides the controls, and adjusts
			 * the width/height of the control bar.
			 *
			 * It's important to remember that for <audio>, layout (specifically,
			 * nsVideoFrame) rely on us to expose the intrinsic dimensions of the
			 * control bar to properly size the <audio> element. We interact with layout
			 * by:
			 *
			 * 1) When the element has a non-zero height, explicitly set the height
			 *    of the control bar to a size between controlBarMinHeight and
			 *    controlBarMinVisibleHeight in response.
			 *    Note: the logic here is flawed and had caused the end height to be
			 *    depend on its previous state, see bug 1495817.
			 * 2) When the element has a outer width smaller or equal to minControlBarPaddingWidth,
			 *    explicitly set the control bar to minRequiredWidth, so that when the
			 *    outer width is unset, the audio element could go back to minRequiredWidth.
			 *    Otherwise, set the width of the control bar to be the current outer width.
			 *    Note: the logic here is also flawed; when the control bar is set to
			 *    the current outer width, it never go back when the width is unset,
			 *    see bug 1495821.
			 */
			adjustControlSize() {
				const minControlBarPaddingWidth = 18;

				this.fullscreenButton.isWanted = !this.controlBar.hasAttribute(
					'fullscreen-unavailable',
				);

				let minRequiredWidth = this.prioritizedControls
					.filter(control => control && control.isWanted)
					.reduce(
						(accWidth, cc) => accWidth + cc.minWidth,
						minControlBarPaddingWidth,
					);
				// Skip the adjustment in case the stylesheets haven't been loaded yet.
				if (!minRequiredWidth) {
					return;
				}

				let givenHeight = this.reflowedDimensions.videoHeight;
				let videoWidth
					= (this.isAudioOnly
						? this.reflowedDimensions.videocontrolsWidth
						: this.reflowedDimensions.videoWidth) || minRequiredWidth;
				let videoHeight = this.isAudioOnly
					? this.controlBarMinHeight
					: givenHeight;
				let videocontrolsWidth = this.reflowedDimensions.videocontrolsWidth;

				let widthUsed = minControlBarPaddingWidth;
				let preventAppendControl = false;

				for (let control of this.prioritizedControls.values()) {
					if (!control.isWanted) {
						control.hiddenByAdjustment = true;
						continue;
					}

					control.hiddenByAdjustment
						= preventAppendControl || widthUsed + control.minWidth > videoWidth;

					if (control.hiddenByAdjustment) {
						preventAppendControl = true;
					} else {
						widthUsed += control.minWidth;
					}
				}

				// Since the size of videocontrols is expanded with controlBar in <audio>, we
				// should fix the dimensions in order not to recursively trigger reflow afterwards.
				if (this.video.localName == 'audio') {
					if (givenHeight) {
						// The height of controlBar should be capped with the bounds between controlBarMinHeight
						// and controlBarMinVisibleHeight.
						let controlBarHeight = Math.max(
							Math.min(givenHeight, this.controlBarMinHeight),
							this.controlBarMinVisibleHeight,
						);
						this.controlBar.style.height = `${controlBarHeight}px`;
					}
					// Bug 1367875: Set minimum required width to controlBar if the given size is smaller than padding.
					// This can help us expand the control and restore to the default size the next time we need
					// to adjust the sizing.
					if (videocontrolsWidth <= minControlBarPaddingWidth) {
						this.controlBar.style.width = `${minRequiredWidth}px`;
					} else {
						this.controlBar.style.width = `${videoWidth}px`;
					}
					return;
				}

				if (
					videoHeight < this.controlBarMinHeight
					|| widthUsed === minControlBarPaddingWidth
				) {
					this.controlBar.setAttribute('size', 'hidden');
					this.controlBar.hiddenByAdjustment = true;
				} else {
					this.controlBar.removeAttribute('size');
					this.controlBar.hiddenByAdjustment = false;
				}

				// Adjust clickToPlayButton size.
				const minVideoSideLength = Math.min(videoWidth, videoHeight);
				const clickToPlayViewRatio = 0.15;
				const clickToPlayScaledSize = Math.max(
					this.clickToPlay.minWidth,
					minVideoSideLength * clickToPlayViewRatio,
				);

				if (
					clickToPlayScaledSize >= videoWidth
					|| clickToPlayScaledSize + this.controlBarMinHeight / 2
					>= videoHeight / 2
				) {
					this.clickToPlay.hiddenByAdjustment = true;
				} else {
					if (
						this.clickToPlay.hidden
						&& this.video.paused
					) {
						this.clickToPlay.hiddenByAdjustment = false;
					}
					this.clickToPlay.style.width = `${clickToPlayScaledSize}px`;
					this.clickToPlay.style.height = `${clickToPlayScaledSize}px`;
				}
			},

			init(elem, video, controls) {
				this.elem = elem;
				this.shadowRoot = elem.shadowRoot;
				this.video = video;
				this.videocontrols = controls;
				this.document = this.videocontrols.ownerDocument;
				this.window = this.document.defaultView;
				this.shadowRoot = elem.shadowRoot;

				this.controlsContainer = this.shadowRoot.getElementById(
					'controlsContainer',
				);
				this.statusIcon = this.shadowRoot.getElementById('statusIcon');
				this.statusText = this.shadowRoot.getElementById('statusText');
				this.controlBar = this.shadowRoot.getElementById('controlBar');
				this.playButton = this.shadowRoot.getElementById('playButton');
				this.controlBarSpacer = this.shadowRoot.getElementById('controlBarSpacer');
				this.muteButton = this.shadowRoot.getElementById('muteButton');
				this.volumeControl = this.shadowRoot.getElementById('volumeControl');
				this.statusOverlay = this.shadowRoot.getElementById('statusOverlay');
				this.controlsOverlay = this.shadowRoot.getElementById('controlsOverlay');
				this.controlsSpacer = this.shadowRoot.getElementById('controlsSpacer');
				this.clickToPlay = this.shadowRoot.getElementById('clickToPlay');
				this.fullscreenButton = this.shadowRoot.getElementById('fullscreenButton');

				const isMobile = this.window.matchMedia('screen and (pointer: coarse) and (hover: none)').matches;
				if (isMobile) {
					this.controlsContainer.classList.add('mobile');
				}

				// TODO: Switch to touch controls on touch-based desktops (bug 1447547)
				this.isTouchControls = isMobile;
				if (this.isTouchControls) {
					this.controlsContainer.classList.add('touch');
				}

				// XXX: Calling getComputedStyle() here by itself doesn't cause any reflow,
				// but there is no guard proventing accessing any properties and methods
				// of this saved CSSStyleDeclaration instance that could trigger reflow.
				this.controlBarComputedStyles = this.window.getComputedStyle(
					this.controlBar,
				);

				// Hide and show control in certain order.
				this.prioritizedControls = [
					this.playButton,
					this.muteButton,
					this.fullscreenButton,
					this.volumeControl,
				];

				this.isAudioOnly = this.video.localName == 'audio';
				this.setupInitialState();
				this.setupNewLoadState();

				// Use the handleEvent() callback for all media events.
				// Only the "error" event listener must capture, so that it can trap error
				// events from <source> children, which don't bubble. But we use capture
				// for all events in order to simplify the event listener add/remove.
				for (let event of this.videoEvents) {
					this.video.addEventListener(event, this, { capture: true });
				}

				this.controlsEvents = [
					{ el: this.muteButton, type: 'click' },
					{ el: this.fullscreenButton, type: 'click' },
					{ el: this.playButton, type: 'click' },
					{ el: this.clickToPlay, type: 'click' },

					// On touch videocontrols, tapping controlsSpacer should show/hide
					// the control bar, instead of playing the video or toggle fullscreen.
					{ el: this.controlsSpacer, type: 'click', nonTouchOnly: true },
					{ el: this.controlsSpacer, type: 'dblclick', nonTouchOnly: true },

					{ el: this.videocontrols, type: 'resizevideocontrols' },

					{ el: this.document, type: 'fullscreenchange' },
					{ el: this.video, type: 'keypress', capture: true },

					// Prevent any click event within media controls from dispatching through to video.
					{ el: this.videocontrols, type: 'click', mozSystemGroup: false },

					// prevent dragging of controls image (bug 517114)
					{ el: this.videocontrols, type: 'dragstart' },

					// add mouseup listener additionally to handle the case that `change` event
					// isn't fired when the input value before/after dragging are the same. (bug 1328061)
					{ el: this.volumeControl, type: 'input' },

					{ el: this.controlBar, type: 'focusin' },
					{ el: this.volumeControl, type: 'mousedown' },
				];

				for (let {
					el,
					type,
					nonTouchOnly = false,
					touchOnly = false,
					capture = false,
				} of this.controlsEvents) {
					if (
						(this.isTouchControls && nonTouchOnly)
						|| (!this.isTouchControls && touchOnly)
					) {
						continue;
					}
					el.addEventListener(type, this, { capture });
				}

				this.log('--- videocontrols initialized ---');
			},
		};

		this.TouchUtils = {
			videocontrols: null,
			video: null,
			controlsTimer: null,
			controlsTimeout: 5000,

			get visible() {
				return (
					!this.Utils.controlBar.hasAttribute('fadeout')
					&& !this.Utils.controlBar.hidden
				);
			},

			firstShow: false,

			toggleControls() {
				if (!this.Utils.dynamicControls || !this.visible) {
					this.showControls();
				} else {
					this.delayHideControls(0);
				}
			},

			showControls() {
				if (this.Utils.dynamicControls) {
					this.Utils.startFadeIn(this.Utils.controlBar);
					this.delayHideControls(this.controlsTimeout);
				}
			},

			clearTimer() {
				if (this.controlsTimer) {
					this.window.clearTimeout(this.controlsTimer);
					this.controlsTimer = null;
				}
			},

			delayHideControls(aTimeout) {
				this.clearTimer();
				this.controlsTimer = this.window.setTimeout(
					() => this.hideControls(),
					aTimeout,
				);
			},

			hideControls() {
				if (!this.Utils.dynamicControls) {
					return;
				}
				this.Utils.startFadeOut(this.Utils.controlBar);
			},

			handleEvent(aEvent) {
				switch (aEvent.type) {
					case 'click':
						switch (aEvent.currentTarget) {
							case this.Utils.playButton:
								if (!this.video.paused) {
									this.delayHideControls(0);
								} else {
									this.showControls();
								}
								break;
							case this.Utils.muteButton:
								this.delayHideControls(this.controlsTimeout);
								break;
						}
						break;
					case 'touchstart':
						this.clearTimer();
						break;
					case 'touchend':
						this.delayHideControls(this.controlsTimeout);
						break;
					case 'mouseup':
					// TODO: originalTarget is a mozilla specific thing...
					// if (aEvent.originalTarget == this.Utils.controlsSpacer) {
						if (this.firstShow) {
							this.Utils.video.play();
							this.firstShow = false;
						}
						this.toggleControls();
						break;
				}
			},

			terminate() {
				try {
					for (let { el, type, mozSystemGroup = true } of this.controlsEvents) {
						el.removeEventListener(type, this, { mozSystemGroup });
					}
				} catch (ex) { /* continue regardless of error */ }

				this.clearTimer();
			},

			init(elem, utils) {
				this.Utils = utils;
				this.videocontrols = this.Utils.videocontrols;
				this.video = this.Utils.video;
				this.document = this.videocontrols.ownerDocument;
				this.window = this.document.defaultView;
				this.shadowRoot = elem.shadowRoot;

				this.controlsEvents = [
					{ el: this.Utils.playButton, type: 'click' },
					{ el: this.Utils.muteButton, type: 'click' },
					{ el: this.Utils.controlsSpacer, type: 'mouseup' },
				];

				for (let { el, type, mozSystemGroup = true } of this.controlsEvents) {
					el.addEventListener(type, this, { mozSystemGroup });
				}

				// The first time the controls appear we want to just display
				// a play button that does not fade away. The firstShow property
				// makes that happen. But because of bug 718107 this init() method
				// may be called again when we switch in or out of fullscreen
				// mode. So we only set firstShow if we're not autoplaying and
				// if we are at the beginning of the video and not already playing
				if (
					!this.video.autoplay
					&& this.Utils.dynamicControls
					&& this.video.paused
					&& this.video.currentTime === 0
				) {
					this.firstShow = true;
				}

				// If the video is not at the start, then we probably just
				// transitioned into or out of fullscreen mode, and we don't want
				// the controls to remain visible. this.controlsTimeout is a full
				// 5s, which feels too long after the transition.
				if (this.video.currentTime !== 0) {
					this.delayHideControls(this.Utils.HIDE_CONTROLS_TIMEOUT_MS);
				}
			},
		};

		this.Utils.init(this, this.video, this.controls);
		if (this.Utils.isTouchControls) {
			this.TouchUtils.init(this, this.Utils);
		}

		this._setupEventListeners();
	}

	onDisconnectedCallback() {
		this.Utils.terminate();
		this.TouchUtils.terminate();
	}

	_setupEventListeners() {
		this.Utils.videocontrols.addEventListener('mouseover', (event) => {
			if (!this.Utils.isTouchControls) {
				this.Utils.onMouseInOut(event);
			}
		});

		this.Utils.videocontrols.addEventListener('mouseout', (event) => {
			if (!this.Utils.isTouchControls) {
				this.Utils.onMouseInOut(event);
			}
		});

		this.Utils.videocontrols.addEventListener('mousemove', (event) => {
			if (!this.Utils.isTouchControls) {
				this.Utils.onMouseMove(event);
			}
		});
	}
}

customElements.define('video-live', VideoLiveElement);

return baseclass.extend({
	async loadTemplate() {
		// Use the version specific cache busting, not the 'cache bust every time'
		// ({ cache: true }).
		const response = await request.get(L.resourceCacheBusted('view/cameras/custom-elements/video-live.html'), { cache: true });

		if (!response.ok)
			throw new Error(response.statusText);

		VideoLiveElement.setTemplate(response.text());
	},
});
