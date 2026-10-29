#
# Copyright 2025 Gateworks
#
# This is free software, licensed under the GPL 2 license.
#

include $(TOPDIR)/rules.mk

PKG_NAME:=mm8108-trial-driver
PKG_RELEASE:=1

PKG_VERSION:=2.1.0
PKG_LICENSE:=GPLv2
PKG_LICENSE_FILES:=LICENSE
PKG_SOURCE_VERSION:=4ce0a0272f8ac8e2fa58eea8ff08116e493399de
PKG_SOURCE_URL:=https://github.com/MorseMicro/morse_driver.git
PKG_SOURCE:=$(PKG_NAME)-$(PKG_SOURCE_VERSION).tar.zst
PKG_MIRROR_HASH:=84f60321cccf26b2aa538878323a459b587186a6d7876e0c8c12e03024181c56
PKG_SOURCE_PROTO:=git

PKG_MAINTAINER:=OpenMANET
PKG_BUILD_PARALLEL:=1

include $(INCLUDE_DIR)/kernel.mk
include $(INCLUDE_DIR)/package.mk

# Extract mac80211 version
MAC80211_VERSION:=v$(shell grep '^PKG_VERSION:=' $(TOPDIR)/package/kernel/mac80211/Makefile | cut -d'=' -f2 | head -1)
MORSE_VERSION:=$(PKG_VERSION)-g$(call version_abbrev,$(PKG_SOURCE_VERSION))

define KernelPackage/dot11ah-mm8108-trial
  SUBMENU:=Wireless Drivers
  TITLE:=Morse Micro 802.11ah core module
  DEPENDS:=@OPENMANET_MM8108_TRIAL @TARGET_bcm27xx_bcm2711 +kmod-mac80211
  CONFLICTS:=kmod-dot11ah kmod-mm6108 kmod-mm8108 kmod-morse
  FILES:=$(PKG_BUILD_DIR)/dot11ah/dot11ah.ko
  AUTOLOAD:=$(call AutoLoad,50,dot11ah)
endef

define KernelPackage/dot11ah-mm8108-trial/description
	Core 802.11ah shim driver module for Morse Micro HaLow chips.
endef

define KernelPackage/mm8108-trial
  SUBMENU:=Wireless Drivers
  TITLE:=Morse Micro WIFI HaLow mm8108 USB 2.1 EXPERIMENTAL driver
  CONFLICTS:=kmod-mm6108 kmod-mm8108 kmod-morse
  DEPENDS:= @OPENMANET_MM8108_TRIAL @TARGET_bcm27xx_bcm2711 +kmod-dot11ah-mm8108-trial +kmod-mac80211 +kmod-lib-crc7 +kmod-usb-core
  FILES:= $(PKG_BUILD_DIR)/morse.ko
  AUTOLOAD:=$(call AutoProbe,morse)
  MODPARAMS.morse:=country=US
  PROVIDES:=kmod-morse
endef

define KernelPackage/mm8108-trial/description
	This package contains the proprietary wireless driver for the MorseMicro mm8108 chip USB interface (isolated 2.1 trial).
endef

MORSE_MAKEDEFS += \
  MORSE_VERSION="$(MORSE_VERSION)" \
  KERNEL_SRC=$(LINUX_DIR) \
  CONFIG_BACKPORT_VERSION=$(MAC80211_VERSION) \
  CONFIG_MORSE_USB=y \
  CONFIG_MORSE_SDIO=n \
  CONFIG_MORSE_SPI=n \
  CONFIG_MORSE_USER_ACCESS=y \
  CONFIG_MORSE_POWERSAVE_MODE=0 \
  CONFIG_MORSE_VENDOR_COMMAND=y \
  CONFIG_MORSE_RC=y \
  CONFIG_MORSE_MONITOR=y \
  CONFIG_MORSE_DEBUGFS=y \
  CONFIG_MORSE_COUNTRY=US \
  CONFIG_WLAN_VENDOR_MORSE=m

NOSTDINC_FLAGS = \
	-I$(PKG_BUILD_DIR) \
	-I$(STAGING_DIR)/usr/include/mac80211-backport/uapi \
	-I$(STAGING_DIR)/usr/include/mac80211-backport \
	-I$(STAGING_DIR)/usr/include/mac80211/uapi \
	-I$(STAGING_DIR)/usr/include/mac80211 \
	-include backport/autoconf.h \
	-include backport/backport.h

include $(INCLUDE_DIR)/kernel-defaults.mk

define Build/Compile
	$(MAKE) $(MORSE_MAKEDEFS) $(PKG_JOBS) -C "$(LINUX_DIR)" \
		$(KERNEL_MAKE_FLAGS) \
		M="$(PKG_BUILD_DIR)" \
		NOSTDINC_FLAGS="$(NOSTDINC_FLAGS)" \
		modules
endef

$(eval $(call KernelPackage,dot11ah-mm8108-trial))
$(eval $(call KernelPackage,mm8108-trial))
