include $(TOPDIR)/rules.mk

PKG_NAME:=bsp-venice
PKG_RELEASE=3
PKG_VERSION:=1.0

PKG_LICENSE:=GPLv2
PKG_LICENSE_FILES:=

PKG_MAINTAINER:=OpenMANET
PKG_BUILD_PARALLEL:=1

include $(INCLUDE_DIR)/package.mk

define Package/bsp-venice
	SECTION:=utils
	CATEGORY:=OpenMANET
	SUBMENU:=Boards
	TITLE:=OpenMANET Venice board support package
	DEPENDS:=+bsp-common +gpsd +kmod-thermal +kmod-hwmon-gsc +ntpd
endef

define Package/bsp-venice/description
This package provides board support for the OpenMANET Venice board.
endef

define Build/Compile

endef

define Package/bsp-venice/install
	$(INSTALL_DIR) $(1)/etc/init.d/
	$(INSTALL_BIN) ./files/etc/init.d/* $(1)/etc/init.d/

	$(INSTALL_DIR) $(1)/etc/board.d/
	$(INSTALL_BIN) ./files/board.d/* $(1)/etc/board.d/

	$(INSTALL_DIR) $(1)/etc/config/
	$(CP) ./files/config/* $(1)/etc/config/

	$(INSTALL_DIR) $(1)/etc/uci-defaults/
	$(CP) ./files/etc/uci-defaults/* $(1)/etc/uci-defaults/

	$(INSTALL_DIR) $(1)/etc/ntpd.d/
	$(CP) ./files/etc/ntpd.d/* $(1)/etc/ntpd.d

	$(INSTALL_DIR) $(1)/etc/sysctl.d/
	$(INSTALL_DATA) ./files/etc/sysctl.d/* $(1)/etc/sysctl.d/
endef

$(eval $(call BuildPackage,bsp-venice))
