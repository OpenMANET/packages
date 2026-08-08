#
# Copyright 2022 Morse Micro
#
# This is free software, licensed under the GPL 2 license.
#
include $(TOPDIR)/rules.mk

PKG_NAME:=morse-copy-coredump
PKG_RELEASE=2

PKG_MAINTAINER:=Morse Micro

include $(INCLUDE_DIR)/package.mk

define Package/morse-copy-coredump
  SECTION:=net
  CATEGORY:=Morse Micro
  SUBMENU:=Features
  TITLE:=Morse Micro copy coredumps from sysfs
  DEPENDS:=+kmod-dot11ah
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
