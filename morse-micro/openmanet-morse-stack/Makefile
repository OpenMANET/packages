include $(TOPDIR)/rules.mk

PKG_NAME:=openmanet-morse-stack
PKG_VERSION:=1.0
PKG_RELEASE:=1
PKG_LICENSE:=Apache-2.0

include $(INCLUDE_DIR)/package.mk

define Package/openmanet-morse-stack
  SECTION:=net
  CATEGORY:=Network
  TITLE:=OpenMANET Morse HaLow userspace stack (metapackage)
  # Every member of the Morse userspace stack is listed explicitly, even
  # those already reachable transitively, so this package is the single
  # authoritative definition of the stack. Radio drivers (kmod-mm6108,
  # kmod-mm8108, chip firmware) are deliberately NOT listed: which radio
  # ships in an image is per-board policy in boards/*/target_diffconfig.
  # Generic third-party libraries (libnl, qrencode, rsync, ...) stay as
  # DEPENDS of the individual packages that use them.
  # NOTE: wpa_event_listener is deliberately absent - it does not exist at
  # the morse feed revision pinned in feeds.conf.default. Re-add it when
  # the feed pin is bumped to a revision that provides it.
  DEPENDS:= \
	+netifd-morse \
	+morse-mode \
	+morse-boot-prints \
	+morse-regdb \
	+morsecli \
	+hostapd_s1g \
	+wpa_supplicant_s1g \
	+libwpa_client_s1g \
	+smart_manager \
	+morse-copy-coredump \
	+morse-bundle \
	+morse-button \
	+morse-leds \
	+morse_mesh11sd \
	+morse-board-config \
	+morse-board-config-hotplug-model \
	+luci-lib-morseui \
	+luci-lib-vivagraphjs \
	+luci-app-morseconfig \
	+luci-app-ekhwizards \
	+luci-mod-home \
	+luci-theme-openmanetargon
endef

define Package/openmanet-morse-stack/description
 Meta-package selecting the complete radio-agnostic Morse Micro HaLow
 userspace and LuCI stack used on all OpenMANET boards. Enabled once in
 boards/common/openmanet_diffconfig via
 CONFIG_PACKAGE_openmanet-morse-stack=y.
endef

define Build/Compile
endef

define Package/openmanet-morse-stack/install
	:
endef

$(eval $(call BuildPackage,openmanet-morse-stack))
