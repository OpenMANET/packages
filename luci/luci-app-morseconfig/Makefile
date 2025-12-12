#
# Copyright 2022 Morse Micro
#
# This is free software, licensed under the Apache License, Version 2.0.
#

include $(TOPDIR)/rules.mk

LUCI_TITLE:=LuCI Morse Configuration
LUCI_DEPENDS:=+luci-base +libiwinfo +libiwinfo-lua +luci-lib-morseui +netifd-morse +morse-regdb +qrencode

PKG_BUILD_DEPENDS:=iwinfo
PKG_LICENSE:=Apache-2.0

# Because we're using newer CSS, csstidy makes a mess.
CONFIG_LUCI_CSSTIDY:=

include $(TOPDIR)/feeds/luci/luci.mk


# call BuildPackage - OpenWrt buildroot signature