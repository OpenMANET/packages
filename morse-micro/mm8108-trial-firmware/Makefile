#
# Copyright 2026 Gateworks
#
# This is free software, licensed under the 3-Clause BSD License.
# See /LICENSE for more information.
#
include $(TOPDIR)/rules.mk

PKG_NAME:=mm8108-trial-firmware
PKG_RELEASE=1

PKG_VERSION:=2.1.0

PKG_SOURCE_VERSION:=919f27a6dc2d46a988682d6ff64dd3fdb9ffc465
PKG_SOURCE_URL:=https://github.com/MorseMicro/morse-firmware.git
PKG_SOURCE:=$(PKG_NAME)-$(PKG_SOURCE_VERSION).tar.zst
PKG_MIRROR_HASH:=f753174a6b7a78634728e8abfdf8bc62c19e844fb707e5f9c5605b8e89463dc4
PKG_SOURCE_PROTO:=git

PKG_MAINTAINER:=OpenMANET
PKG_BUILD_PARALLEL:=1

RSTRIP:=:

include $(INCLUDE_DIR)/kernel.mk
include $(INCLUDE_DIR)/package.mk

define Package/mm8108-trial-firmware
  DEPENDS:=@OPENMANET_MM8108_TRIAL @TARGET_bcm27xx_bcm2711
  CONFLICTS:=mm8108-firmware mm6108-firmware
  SECTION:=firmware
  CATEGORY:=Firmware
  URL:=$(PKG_SOURCE_URL)
  TITLE:=Morse Micro mm8108 WIFI HaLow firmware
endef

define Build/Compile
endef

define Package/mm8108-trial-firmware/install
	$(INSTALL_DIR) $(1)/lib/firmware/morse
	$(INSTALL_DATA) $(PKG_BUILD_DIR)/firmware/mm8108b2-rl.bin $(1)/lib/firmware/morse
	$(INSTALL_DATA) ./files/bcf_mm8108_m20_us.bin $(1)/lib/firmware/morse
	ln -s bcf_mm8108_m20_us.bin $(1)/lib/firmware/morse/bcf_boardtype_0808.bin
	# Preserve baseline board calibration; generic BCFs remain owned by
	# the pinned morse-board-config package. Do not copy upstream 2.1 BCFs.
endef

$(eval $(call BuildPackage,mm8108-trial-firmware))
