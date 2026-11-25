#
# Copyright 2023 Morse Micro
#
# This is free software, licensed under the Apache License, Version 2.0.
#

include $(TOPDIR)/rules.mk

LUCI_TITLE:=LuCI Camera Viewer
LUCI_DEPENDS:=+rpcd-mod-onvif +luci-lib-httpclient +mediamtx

PKG_LICENSE:=Apache-2.0

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature