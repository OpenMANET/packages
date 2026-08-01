include $(TOPDIR)/rules.mk

PKG_NAME:=bsp-common
PKG_RELEASE=3
PKG_VERSION:=1.0

PKG_LICENSE:=GPLv2
PKG_LICENSE_FILES:=

PKG_MAINTAINER:=OpenMANET
PKG_BUILD_PARALLEL:=1

include $(INCLUDE_DIR)/package.mk

define Package/bsp-common
	SECTION:=utils
	CATEGORY:=OpenMANET
	SUBMENU:=Boards
	TITLE:=OpenMANET common board support package
endef

define Package/bsp-common/description
This package provides common board support files for OpenMANET boards.
endef

define Build/Compile

endef

define Package/bsp-common/install
	$(INSTALL_DIR) $(1)/etc/uci-defaults/
	$(CP) ./files/uci-defaults/* $(1)/etc/uci-defaults/
endef

$(eval $(call BuildPackage,bsp-common))
