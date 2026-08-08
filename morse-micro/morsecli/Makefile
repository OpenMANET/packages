#
# Copyright 2023 Morse Micro
#
# This is free software, licensed under the GNU General Public License v2.
# See /LICENSE for more information.
#

include $(TOPDIR)/rules.mk
PKG_NAME:=morsecli
PKG_RELEASE=7

PKG_VERSION:=mm8108-2.0.0

PKG_LICENSE:=GPLv2
PKG_LICENSE_FILES:=

PKG_SOURCE_VERSION:=$(PKG_VERSION)
PKG_SOURCE_URL:=https://github.com/MorseMicro/morse_cli.git
PKG_MIRROR_HASH:=a51813548347be857542a17fd6420835c4945f78e5fc6385cc1ebcfb9aa5266d
PKG_SOURCE_MIRROR:=0
PKG_SOURCE_PROTO:=git

PKG_MAINTAINER:=Morse Micro <info@morsemicro.com>
PKG_BUILD_PARALLEL:=1

include $(INCLUDE_DIR)/package.mk

define Package/morsecli
  SECTION:=utils
  CATEGORY:=Morse Micro
  SUBMENU:=Essentials
  TITLE:=Morse Micro WIFI HaLow driver command line tool
  DEPENDS:= +kmod-dot11ah +libnl +libusb-1.0
  FILES:=\
	$(PKG_BUILD_DIR)/morse_cli
endef

MAKE_FLAGS += \
    MORSECTRL_VERSION_STRING=$(PKG_VERSION) \
    CONFIG_MORSE_TRANS_NL80211=1 \
    DEFAULT_INTERFACE_NAME=wlh0 \

TARGET_CFLAGS += -I$(STAGING_DIR)/usr/include/libnl3

define Package/morsecli/install
	$(INSTALL_DIR) $(1)/sbin
	$(INSTALL_BIN) $(PKG_BUILD_DIR)/morse_cli $(1)/sbin/

	$(INSTALL_DIR) $(1)/etc/profile.d
	$(CP) $(CURDIR)/files/morse_cli.sh $(1)/etc/profile.d/
endef

$(eval $(call BuildPackage,morsecli))
