include $(TOPDIR)/rules.mk

PKG_NAME:=bsp-bcm271x
PKG_RELEASE=6
PKG_VERSION:=1.0

PKG_LICENSE:=GPLv2
PKG_LICENSE_FILES:=

PKG_MAINTAINER:=OpenMANET
PKG_BUILD_PARALLEL:=1

include $(INCLUDE_DIR)/package.mk

define Package/bsp-bcm271x
	SECTION:=utils
	CATEGORY:=OpenMANET
	SUBMENU:=Boards
	TITLE:=OpenMANET BCM271x board support package
	DEPENDS:=+bsp-common +kmod-fs-configfs +usbgadget +gpsd \
		+PACKAGE_libcamera-utils:libcamera-utils \
		+PACKAGE_mediamtx:mediamtx \
		+PACKAGE_camera-onvif-server:camera-onvif-server
endef

define Package/bsp-bcm271x/description
This package provides board support for the OpenMANET BCM271x board.
endef

define Build/Compile

endef

define Package/bsp-bcm271x/install
	$(INSTALL_DIR) $(1)/etc/init.d/
	$(INSTALL_BIN) $(CURDIR)/files/etc/init.d/* $(1)/etc/init.d/

	$(INSTALL_DIR) $(1)/etc/board.d/
	$(CP) ./files/board.d/* $(1)/etc/board.d/

	$(INSTALL_DIR) $(1)/etc/uci-defaults/
	$(CP) ./files/uci-defaults/* $(1)/etc/uci-defaults/

	$(INSTALL_DIR) $(1)/etc/config/
	$(CP) ./files/etc/config/* $(1)/etc/config/

	$(INSTALL_DIR) $(1)/etc/hotplug.d/iface/
	$(CP) ./files/hotplug.d/iface/* $(1)/etc/hotplug.d/iface/

	$(INSTALL_DIR) $(1)/lib/firmware/morse/
	$(CP) ./files/lib/firmware/morse/* $(1)/lib/firmware/morse/
endef

define Package/bsp-bcm271x/postinst
#!/bin/sh

disable_camera_service() {
	local service="$$1"

	if [ -n "$${IPKG_INSTROOT}" ]; then
		[ -x "$${IPKG_INSTROOT}/etc/init.d/$$service" ] || return 0
		"$${IPKG_INSTROOT}/etc/rc.common" "$${IPKG_INSTROOT}/etc/init.d/$$service" disable >/dev/null 2>&1 || true
		return 0
	fi

	[ -x "/etc/init.d/$$service" ] || return 0
	/etc/init.d/$$service disable >/dev/null 2>&1 || true
	/etc/init.d/$$service stop >/dev/null 2>&1 || true
}

disable_camera_service mediamtx
disable_camera_service camera-onvif-server
endef

$(eval $(call BuildPackage,bsp-bcm271x))
