#
# Copyright 2026 Gateworks
#
# This is free software, licensed under the 3-Clause BSD License.
# See /LICENSE for more information.
#
include $(TOPDIR)/rules.mk

PKG_NAME:=mm8108-trial-firmware
PKG_RELEASE=1

PKG_VERSION:=2.2.3

PKG_SOURCE_VERSION:=db4b69fd212990c59c5f1712e23060cbb94276ec
PKG_SOURCE_URL:=https://github.com/MorseMicro/morse-firmware.git
PKG_SOURCE:=$(PKG_NAME)-$(PKG_SOURCE_VERSION).tar.zst
PKG_MIRROR_HASH:=eefdaf701aa171a4f1c7b2391db5e84e09eb748fa8cd75e2a2626b6c5145a555
PKG_SOURCE_PROTO:=git

PKG_MAINTAINER:=OpenMANET
PKG_BUILD_PARALLEL:=1

RSTRIP:=:

include $(INCLUDE_DIR)/kernel.mk
include $(INCLUDE_DIR)/package.mk

define Package/mm8108-trial-firmware
  DEPENDS:=@OPENMANET_MM8108_TRIAL @TARGET_bcm27xx_bcm2711
  CONFLICTS:=mm6108-trial-firmware mm8108-firmware mm6108-firmware
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
	# Use the M20-US BCF from the pinned 2.2 firmware release.
	# Generic BCFs remain owned by the pinned morse-board-config package.
endef

$(eval $(call BuildPackage,mm8108-trial-firmware))
