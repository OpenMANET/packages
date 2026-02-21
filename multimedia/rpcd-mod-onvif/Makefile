#
# Copyright (C) 2023-2024 Morse Micro
#
# This is free software, licensed under the GNU General Public License v2.
# See /LICENSE for more information.
#

include $(TOPDIR)/rules.mk

PKG_NAME:=rpcd-mod-onvif
PKG_RELEASE:=1

PKG_SOURCE_PROTO:=git
PKG_SOURCE_VERSION:=1.0.4
PKG_VERSION=$(PKG_SOURCE_VERSION)
PKG_SOURCE_URL:=https://github.com/MorseMicro/rpcd-mod-onvif.git
PKG_MIRROR_HASH:=cf68a2aab51e8cc1390aa9cd8e524defce6f75abe34197a17f89940bbc1abb77

PKG_LICENSE:=GPL-2.0

include $(INCLUDE_DIR)/package.mk

define Package/rpcd-mod-onvif
  SECTION:=multimedia
  CATEGORY:=Multimedia
  TITLE:=rpcd module for ONVIF devices
  DEPENDS:=+rpcd +libubox +libubus +libopenssl +zlib
endef

define Package/rpcd-mod-onvif/description
  Communication with with ONVIF devices via ubus.
endef

define Package/rpcd-mod-onvif/install
	$(INSTALL_DIR) $(1)/usr/lib/rpcd
	$(INSTALL_BIN) $(PKG_BUILD_DIR)/onvif.so $(1)/usr/lib/rpcd/
endef

define Package/rpcd-mod-onvif/postinst
#!/bin/sh
[ -n "$$IPKG_INSTROOT" ] || /etc/init.d/rpcd reload
endef

$(eval $(call BuildPackage,rpcd-mod-onvif))
