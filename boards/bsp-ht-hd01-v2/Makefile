include $(TOPDIR)/rules.mk

PKG_NAME:=bsp-ht-hd01-v2
PKG_RELEASE=2
PKG_VERSION:=1.0

PKG_LICENSE:=GPLv2
PKG_LICENSE_FILES:=

PKG_MAINTAINER:=OpenMANET
PKG_BUILD_PARALLEL:=1

include $(INCLUDE_DIR)/package.mk

define Package/bsp-ht-hd01-v2
	SECTION:=utils
	CATEGORY:=OpenMANET
	SUBMENU:=Boards
	TITLE:=OpenMANET Heltec HT-HD01 V2 board support package
	DEPENDS:=+bsp-common +ht-service
endef

define Package/bsp-ht-hd01-v2/description
This package provides board support for the Heltec HT-HD01 V2
(heltec,ht-hd01-v2 / MT7628AN). Includes:
- Default channel and BCF selection (bcf_mf08551.bin)
- SAE mesh fix: ieee80211w=0 and sae_pwe=0 in morse_overrides.sh
- Network interface configuration (single ethernet port)
Note: Chip firmware (mm6108.bin) is provided by mm6108-firmware.
endef

define Build/Compile

endef

define Package/bsp-ht-hd01-v2/install
	$(INSTALL_DIR) $(1)/etc/uci-defaults/
	$(CP) ./files/uci-defaults/* $(1)/etc/uci-defaults/

	$(INSTALL_DIR) $(1)/etc/board.d/
	$(INSTALL_BIN) ./files/board.d/* $(1)/etc/board.d/

	$(INSTALL_DIR) $(1)/etc/init.d/
	$(INSTALL_BIN) ./files/etc/init.d/* $(1)/etc/init.d/

	$(INSTALL_DIR) $(1)/lib/firmware/morse/
	$(CP) ./files/lib/firmware/morse/* $(1)/lib/firmware/morse/

	$(INSTALL_DIR) $(1)/etc/rc.d/
	$(LN) ../init.d/ht-hd01-morse-fix $(1)/etc/rc.d/S08ht-hd01-morse-fix

	$(INSTALL_DIR) $(1)/etc/sysctl.d/
	$(INSTALL_DATA) ./files/etc/sysctl.d/* $(1)/etc/sysctl.d/
endef

$(eval $(call BuildPackage,bsp-ht-hd01-v2))
