#
# Copyright 2026 Gateworks
#
# This is free software, licensed under the 3-Clause BSD License.
# See /LICENSE for more information.
#
include $(TOPDIR)/rules.mk

PKG_NAME:=mm8108-firmware
PKG_RELEASE=1

PKG_VERSION:=2.0.0

PKG_SOURCE_VERSION:=mm8108-$(PKG_VERSION)
PKG_SOURCE_URL:=https://github.com/MorseMicro/morse-firmware.git
PKG_SOURCE:=$(PKG_NAME)-$(PKG_SOURCE_VERSION).tar.zst
PKG_MIRROR_HASH:=7ac4343d8d5c641cd56407d4eb8c4b77c6b16e65e56eccb0658c88f494396c52
PKG_SOURCE_PROTO:=git

PKG_MAINTAINER:=OpenMANET
PKG_BUILD_PARALLEL:=1

RSTRIP:=:

include $(INCLUDE_DIR)/kernel.mk
include $(INCLUDE_DIR)/package.mk

define Package/mm8108-firmware
  SECTION:=firmware
  CATEGORY:=Firmware
  URL:=$(PKG_SOURCE_URL)
  TITLE:=Morse Micro mm8108 WIFI HaLow firmware
endef

define Build/Compile
endef

define Package/mm8108-firmware/install
	$(INSTALL_DIR) $(1)/lib/firmware/morse
	$(INSTALL_DATA) $(PKG_BUILD_DIR)/firmware/mm8108b2-rl.bin $(1)/lib/firmware/morse
	$(INSTALL_DATA) ./files/bcf_mm8108_m20_us.bin $(1)/lib/firmware/morse
	ln -s bcf_mm8108_m20_us.bin $(1)/lib/firmware/morse/bcf_boardtype_0808.bin
	# The generic BCF set (bcf/morsemicro/*) is intentionally NOT copied
	# here: morse-board-config owns /lib/firmware/morse/bcf_* and installs
	# the full set from the same morse-firmware.git tag (mm8108-2.0.0),
	# so copying it here duplicates byte-identical files and clashes in
	# opkg. This package ships only the chip firmware and its own
	# board-specific BCF (boardtype 0808) that morse-board-config lacks.
endef

$(eval $(call BuildPackage,mm8108-firmware))
