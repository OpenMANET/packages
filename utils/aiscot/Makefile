include $(TOPDIR)/rules.mk

PKG_NAME:=aiscot
PKG_VERSION:=7.3.2
PKG_RELEASE:=1
PKG_SOURCE_VERSION:=729f548311e660633f88e8e42ce53e51d2e7f5be
PKG_SOURCE:=$(PKG_NAME)-$(PKG_SOURCE_VERSION).tar.gz
PKG_SOURCE_URL:=https://codeload.github.com/snstac/aiscot/tar.gz/$(PKG_SOURCE_VERSION)?
PKG_HASH:=980a8385070a3c8e40fb8306a6a719277b2da83d40742b9351a53013e1849961
PKG_BUILD_DIR:=$(BUILD_DIR)/$(PKG_NAME)-$(PKG_SOURCE_VERSION)
PKG_LICENSE:=Apache-2.0 MIT
PKG_LICENSE_FILES:=LICENSE
PKG_MAINTAINER:=info@openmanet.net

include $(INCLUDE_DIR)/package.mk
include $(TOPDIR)/feeds/packages/lang/python/python3-package.mk

define Package/aiscot
  SECTION:=utils
  CATEGORY:=Utilities
  TITLE:=AIS to Cursor-on-Target gateway
  URL:=https://github.com/snstac/aiscot
  DEPENDS:=+python3-pytak +python3-aiohttp
endef

define Package/aiscot/description
  Forward vessel positions from a network NMEA/AIS feed or AIS web API to TAK.
  Configure /etc/aiscot/aiscot.ini and enable /etc/init.d/aiscot to start.
endef

define Package/aiscot/conffiles
/etc/aiscot/aiscot.ini
/etc/config/aiscot
endef

define Py3Package/aiscot/install
	$(INSTALL_DIR) $(1)/usr/bin
	$(INSTALL_BIN) $(PKG_INSTALL_DIR)/usr/bin/aiscot $(1)/usr/bin/aiscot
	$(INSTALL_DIR) $(1)/etc/aiscot $(1)/etc/config $(1)/etc/init.d
	$(INSTALL_CONF) ./files/aiscot.ini $(1)/etc/aiscot/aiscot.ini
	$(INSTALL_CONF) ./files/aiscot.config $(1)/etc/config/aiscot
	$(INSTALL_BIN) ./files/aiscot.init $(1)/etc/init.d/aiscot
endef

$(eval $(call Py3Package,aiscot))
$(eval $(call BuildPackage,aiscot))
