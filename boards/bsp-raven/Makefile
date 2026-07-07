include $(TOPDIR)/rules.mk

PKG_NAME:=bsp-raven
PKG_RELEASE=2
PKG_VERSION:=1.0

PKG_LICENSE:=GPLv2
PKG_LICENSE_FILES:=

PKG_MAINTAINER:=OpenMANET
PKG_BUILD_PARALLEL:=1

include $(INCLUDE_DIR)/package.mk

define Package/bsp-raven
	SECTION:=utils
	CATEGORY:=OpenMANET
	SUBMENU:=Boards
	TITLE:=OpenMANET Raven board support package
	DEPENDS:=+bsp-common +kmod-fs-configfs +usbgadget +gpsd +ntpd
endef

define Package/bsp-raven/description
This package provides board support for the OpenMANET Raven board.
endef

define Build/Compile

endef

define Package/bsp-raven/install
	$(INSTALL_DIR) $(1)/etc/init.d/
	$(INSTALL_BIN) $(CURDIR)/files/etc/init.d/* $(1)/etc/init.d/

	$(INSTALL_DIR) $(1)/etc/board.d/
	$(CP) ./files/board.d/* $(1)/etc/board.d/

	$(INSTALL_DIR) $(1)/etc/config/
	$(CP) ./files/etc/config/* $(1)/etc/config/

	$(INSTALL_DIR) $(1)/etc/ntpd.d/
	$(CP) ./files/etc/ntpd.d/* $(1)/etc/ntpd.d

	$(INSTALL_DIR) $(1)/etc/hotplug.d/iface/
	$(CP) ./files/hotplug.d/iface/* $(1)/etc/hotplug.d/iface/

	$(INSTALL_DIR) $(1)/lib/firmware/morse/
	$(CP) ./files/lib/firmware/morse/* $(1)/lib/firmware/morse/
endef

$(eval $(call BuildPackage,bsp-raven))
