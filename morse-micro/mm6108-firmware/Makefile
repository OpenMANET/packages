#
# Copyright 2026 Gateworks
#
# This is free software, licensed under the 3-Clause BSD License.
# See /LICENSE for more information.
#
include $(TOPDIR)/rules.mk

PKG_NAME:=mm6108-firmware
PKG_RELEASE=1

PKG_VERSION:=2.2.2

PKG_SOURCE_VERSION:=db4b69fd212990c59c5f1712e23060cbb94276ec
PKG_SOURCE_URL:=https://github.com/MorseMicro/morse-firmware.git
PKG_SOURCE:=$(PKG_NAME)-$(PKG_SOURCE_VERSION).tar.zst
PKG_MIRROR_HASH:=edeb4f290630bdde7e573c1a8694f9e1c7035ef162db4ad8d2c2bea99d8c4a4b
PKG_SOURCE_PROTO:=git

PKG_MAINTAINER:=OpenMANET
PKG_BUILD_PARALLEL:=1

RSTRIP:=:

include $(INCLUDE_DIR)/kernel.mk
include $(INCLUDE_DIR)/package.mk

define Package/mm6108-firmware
  CONFLICTS:=mm8108-firmware
  SECTION:=firmware
  CATEGORY:=Firmware
  URL:=$(PKG_SOURCE_URL)
  TITLE:=Morse Micro mm6108 WIFI HaLow firmware
endef

define Build/Compile
endef

define Package/mm6108-firmware/install
	$(INSTALL_DIR) $(1)/lib/firmware/morse
	$(INSTALL_DATA) $(PKG_BUILD_DIR)/firmware/mm6108.bin $(1)/lib/firmware/morse
	# Board-specific BCFs retain their existing package ownership.
endef

$(eval $(call BuildPackage,mm6108-firmware))
