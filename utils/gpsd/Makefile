include $(TOPDIR)/rules.mk

PKG_NAME:=gpsd-openmanet
PKG_VERSION:=2023.1
PKG_RELEASE:=1

PKG_MAINTAINER:=Corey Wagehoft <corey.wagehoft@gmail.com>

include $(INCLUDE_DIR)/package.mk

define Package/gpsd-openmanet
  SECTION:=util
  TITLE:=GPSD - GPS Daemon
  URL:=https://gpsd.gitlab.io/gpsd/
  DEPENDS:= +gpsd
  PKG_INSTALL_FLAGS:=overwrite
endef

define Package/gpsd-openmanet/description
  This is an gpsd configuration specific for OpenMANET networks.
endef

define Package/gpsd-openmanet/install
	$(INSTALL_DIR) $(1)/etc/config
	$(CP) ./files/gpsd.config $(1)/etc/config/gpsd
endef

$(eval $(call BuildPackage,gpsd-openmanet))