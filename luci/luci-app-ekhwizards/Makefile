include $(TOPDIR)/rules.mk

LUCI_TITLE:=LuCI Wizards for HaLow evaluation kits
LUCI_DEPENDS:=+luci-base +luci-app-morseconfig

PKG_LICENSE:=Apache-2.0

# Because we're using newer CSS, csstidy makes a mess.
CONFIG_LUCI_CSSTIDY:=

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature