#
# Copyright 2022 Morse Micro
#
# This is free software, licensed under the MIT License.
#
# This package installs Morse Micro firmware binaries, which are
# distributed under the Morse Micro Binary Distribution License.
# This license is available in LICENSE.binaries.
#

include $(TOPDIR)/rules.mk
include ../../include/morse_version.mk

PKG_NAME:=mm6108-firmware
PKG_RELEASE=1

PKG_VERSION:=mm6108-2.0.1

PKG_SOURCE_VERSION:=$(PKG_VERSION)
PKG_SOURCE_URL:=https://github.com/MorseMicro/morse-firmware.git
PKG_MIRROR_HASH:=9c1dfb5f3cf53a93ae5dda1aeb4824be7619a48c854eb19493235e9dc42ca7bf
PKG_SOURCE_MIRROR:=0
PKG_SOURCE_PROTO:=git

PKG_MAINTAINER:=OpenMANET
PKG_BUILD_PARALLEL:=1

RSTRIP:=:

include $(INCLUDE_DIR)/kernel.mk
include $(INCLUDE_DIR)/package.mk

define Package/mm6108-firmware/config
  source "$(SOURCE)/Config.in"
endef

define Package/mm6108-firmware
  SECTION:=firmware
  CATEGORY:=Morse Micro
  SUBMENU:=Essentials
  URL:=$(PKG_SOURCE_URL)
  TITLE:=Morse Micro WIFI HaLow standard firmware for 6108
  PROVIDES:=mm6108-firmware
  CONFLICTS:=mm8108-firmware
endef

define Package/mm6108-firmware/config
  select MORSE_CHIP_MM61X
endef

define Package/mm6108-tlm-firmware
  SECTION:=firmware
  CATEGORY:=Morse Micro
  SUBMENU:=Essentials
  URL:=$(PKG_SOURCE_URL)
  TITLE:=Morse Micro WIFI HaLow Thin LMAC firmware for 6108
  PROVIDES:=mm6108-tlm-firmware
  CONFLICTS:=mm8108-firmware
endef

define Package/mm6108-tlm-firmware/config
  select MORSE_CHIP_MM61X
endef

define Package/mm6108-tlm-firmware/description
  This firmware reduces the per-station table size in the chip to
  allow a large number of associations in AP mode.
endef

define Build/Compile

endef

# Files from the tarball are overriden by a file in this path.
# This is for local development and used by jenkins.
define install_file_or_override
	if [ -e ./files/lib/firmware/morse/$(1) ]; then \
		$(INSTALL_DATA) ./files/lib/firmware/morse/$(1) $(2)/lib/firmware/morse/; \
	else \
		$(INSTALL_DATA) $(PKG_BUILD_DIR)/firmware/$(1) $(2)/lib/firmware/morse/; \
	fi
endef

define Package/mm6108-firmware/install
	$(INSTALL_DIR) $(1)/lib/firmware/morse/.
	$(call install_file_or_override,mm6108.bin,$(1))
endef

define Package/mm6108-tlm-firmware/install
	$(INSTALL_DIR) $(1)/lib/firmware/morse/.
	$(call install_file_or_override,mm6108-tlm.bin,$(1))
endef


$(eval $(call BuildPackage,mm6108-firmware))
$(eval $(call BuildPackage,mm6108-tlm-firmware))
