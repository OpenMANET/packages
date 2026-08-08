#
# Copyright 2022 Morse Micro
#
# This is free software, licensed under the GNU General Public License v2.
# See /LICENSE for more information.
#

include $(TOPDIR)/rules.mk

PKG_NAME:=netifd-morse
PKG_RELEASE=2

PKG_LICENSE:=GPLv2
PKG_LICENSE_FILES:=

PKG_MAINTAINER:=Morse Micro <info@morsemicro.com>

include $(INCLUDE_DIR)/package.mk

define Package/netifd-morse
  SECTION:=net
  CATEGORY:=Morse Micro
  SUBMENU:=Essentials
  TITLE:=Morse Micro HaLow support for netifd

  # This package is also depends on netifd and kmod-cfg80211.
  # These are already pulled in by hostapd_s1g. Listing them
  # explicitly here creates a recursive dependency.
  DEPENDS:= +kmod-dot11ah +morse-regdb +wpa_supplicant_s1g +hostapd_s1g +morsecli
endef

define Build/Compile
endef

define Package/netifd-morse/install
	$(INSTALL_DIR) $(1)/lib/
	$(INSTALL_DIR) $(1)/usr/libexec/rpcd
	$(INSTALL_DIR) $(1)/etc/uci-defaults
	$(INSTALL_DIR) $(1)/etc/hotplug.d/ieee80211
	$(CP) ./lib/* $(1)/lib/
	$(INSTALL_BIN) ./usr/libexec/rpcd/* $(1)/usr/libexec/rpcd/
	$(CP) ./etc/uci-defaults/* $(1)/etc/uci-defaults/
	$(CP) ./etc/hotplug.d/ieee80211/* $(1)/etc/hotplug.d/ieee80211/
endef

$(eval $(call BuildPackage,netifd-morse))
