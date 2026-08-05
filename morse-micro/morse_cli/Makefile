#
# Copyright 2023 Morse Micro
#
# This is free software, licensed under the GNU General Public License v2.
# See /LICENSE for more information.
#

include $(TOPDIR)/rules.mk

PKG_NAME:=morse_cli
PKG_RELEASE=1

PKG_VERSION:=2.0.0

PKG_LICENSE:=GPLv2
PKG_LICENSE_FILES:=

PKG_SOURCE_VERSION:=mm8108-$(PKG_VERSION)
PKG_SOURCE_URL:=https://github.com/MorseMicro/morse_cli.git
PKG_SOURCE:=$(PKG_NAME)-$(PKG_SOURCE_VERSION).tar.zst
PKG_MIRROR_HASH:=f7f8f2b4b8e5fc388741983dfc9ec0819a93191a690978173285f926d992db78
PKG_SOURCE_PROTO:=git

PKG_MAINTAINER:=OpenMANET
PKG_BUILD_PARALLEL:=1

include $(INCLUDE_DIR)/package.mk

define Package/morse_cli
  SECTION:=utils
  CATEGORY:=Network
  TITLE:=Morse Micro WIFI HaLow driver command line tool
  DEPENDS:= +kmod-dot11ah +libnl +libusb-1.0
  FILES:=\
	$(PKG_BUILD_DIR)/morse_cli
  PROVIDES:=morsectrl
endef

MAKE_FLAGS += \
    MORSECTRL_VERSION_STRING=$(PKG_VERSION) \
    CONFIG_MORSE_TRANS_NL80211=1 \

TARGET_CFLAGS += -I$(STAGING_DIR)/usr/include/libnl3

define Package/morse_cli/install
	$(INSTALL_DIR) $(1)/sbin
	$(INSTALL_BIN) $(PKG_BUILD_DIR)/morse_cli $(1)/sbin/
endef

$(eval $(call BuildPackage,morse_cli))
