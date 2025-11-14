include $(TOPDIR)/rules.mk

PKG_NAME:=alfred-openmanet
PKG_VERSION:=2023.1
PKG_RELEASE:=1

PKG_MAINTAINER:=Corey Wagehoft <corey.wagehoft@gmail.com>

include $(INCLUDE_DIR)/package.mk

define Package/alfred-openmanet
  SECTION:=net
  CATEGORY:=Network
  TITLE:=A.L.F.R.E.D. - Almighty Lightweight Fact Remote Exchange Daemon
  URL:=https://www.open-mesh.org/
  DEPENDS:= +alfred +ALFRED_BATHOSTS +ALFRED_GPSD
  PKG_INSTALL_FLAGS:=overwrite
endef

define Package/alfred-openmanet/description
  This is an alfred configuration specific for OpenMANET networks.
endef

define Package/alfred-openmanet/install
	$(INSTALL_DIR) $(1)/etc/config
	$(CP) ./files/alfred.config $(1)/etc/config/alfred

	$(INSTALL_DIR) $(1)/etc/init.d
	$(CP) ./files/mesh-routing.config $(1)/etc/init.d/mesh-routing ; true
  chmod +x $(1)/etc/init.d/mesh-routing

	$(INSTALL_DIR) $(1)/etc/alfred
	$(CP) ./files/bat-hosts.lua $(1)/etc/alfred/bat-hosts.lua ; true
endef

$(eval $(call BuildPackage,alfred-openmanet))
