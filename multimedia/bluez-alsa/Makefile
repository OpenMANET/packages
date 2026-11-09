include $(TOPDIR)/rules.mk

PKG_NAME:=bluez-alsa
PKG_VERSION:=4.3.1
PKG_RELEASE:=1

PKG_SOURCE:=bluez-alsa-$(PKG_VERSION).tar.gz
PKG_SOURCE_URL:=https://codeload.github.com/arkq/bluez-alsa/tar.gz/refs/tags/
PKG_SOURCE_URL_FILE:=v$(PKG_VERSION)
PKG_HASH:=933fe898dfac21fdfeb5f4ffa685c2aa2db9c064d639170ac2652f156e956a2a
PKG_LICENSE:=MIT
PKG_LICENSE_FILES:=LICENSE

PKG_BUILD_DEPENDS:=glib2/host
PKG_BUILD_PARALLEL:=1
PKG_FIXUP:=autoreconf
PKG_INSTALL:=1

include $(INCLUDE_DIR)/package.mk

define Package/bluez-alsa
  SECTION:=sound
  CATEGORY:=Sound
  TITLE:=BlueALSA Bluetooth audio backend
  URL:=https://github.com/arkq/bluez-alsa
  DEPENDS:=+alsa-lib +bluez-daemon +bluez-libs +dbus +libdbus +glib2 +sbc
endef

CONFIGURE_ARGS += \
	--enable-cli \
	--with-alsaplugindir=/usr/lib/alsa-lib \
	--with-dbusconfdir=/etc/dbus-1/system.d

define Package/bluez-alsa/install
	$(INSTALL_DIR) $(1)/usr/bin
	$(INSTALL_BIN) $(PKG_INSTALL_DIR)/usr/bin/bluealsa $(1)/usr/bin/
	$(INSTALL_BIN) $(PKG_INSTALL_DIR)/usr/bin/bluealsa-cli $(1)/usr/bin/
	$(INSTALL_DIR) $(1)/usr/lib/alsa-lib
	$(INSTALL_BIN) $(PKG_INSTALL_DIR)/usr/lib/alsa-lib/libasound_module_*_bluealsa.so $(1)/usr/lib/alsa-lib/
	$(INSTALL_DIR) $(1)/etc/alsa/conf.d $(1)/etc/dbus-1/system.d
	$(INSTALL_DATA) $(PKG_INSTALL_DIR)/etc/alsa/conf.d/20-bluealsa.conf $(1)/etc/alsa/conf.d/
	$(INSTALL_DATA) $(PKG_INSTALL_DIR)/etc/dbus-1/system.d/bluealsa.conf $(1)/etc/dbus-1/system.d/
	$(INSTALL_DIR) $(1)/etc/init.d
	$(INSTALL_BIN) ./files/bluealsa.init $(1)/etc/init.d/bluealsa
endef

$(eval $(call BuildPackage,bluez-alsa))
