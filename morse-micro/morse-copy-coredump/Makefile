#
# Copyright 2022 Morse Micro
#
# This is free software, licensed under the GPL 2 license.
#
include $(TOPDIR)/rules.mk

PKG_NAME:=morse-copy-coredump
PKG_RELEASE=2

# Dependency-only trial packaging; upstream userspace stays unchanged.
PKG_CONFIG_DEPENDS += CONFIG_OPENMANET_MORSE_22_TRIAL CONFIG_OPENMANET_MM8108_TRIAL CONFIG_OPENMANET_MM6108_TRIAL
ifeq ($(CONFIG_OPENMANET_MORSE_22_TRIAL),y)
PKG_RELEASE:=$(PKG_RELEASE).trial2
endif

PKG_MAINTAINER:=Morse Micro

include $(INCLUDE_DIR)/package.mk

define Package/morse-copy-coredump
  SECTION:=net
  CATEGORY:=Morse Micro
  SUBMENU:=Features
  TITLE:=Morse Micro copy coredumps from sysfs
  DEPENDS:=+!OPENMANET_MORSE_22_TRIAL:kmod-dot11ah +OPENMANET_MM8108_TRIAL:kmod-mm8108-trial +OPENMANET_MM6108_TRIAL:kmod-mm6108-trial
endef

define Package/morse-copy-coredump/description
 Copy morse driver coredumps from sysfs to /var/log
 when they appear (detected via hotplug).
endef

define Build/Compile
endef

define Package/morse-copy-coredump/install
	$(INSTALL_DIR) $(1)/etc/hotplug.d/devcoredump
	$(INSTALL_BIN) ./files/etc/hotplug.d/devcoredump/10-morse-copy-coredump $(1)/etc/hotplug.d/devcoredump/
endef

$(eval $(call BuildPackage,morse-copy-coredump))
