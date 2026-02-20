include $(TOPDIR)/rules.mk

PKG_NAME:=bsp-halowlink2
PKG_RELEASE=1
PKG_VERSION:=1.0

PKG_LICENSE:=GPLv2
PKG_LICENSE_FILES:=

PKG_MAINTAINER:=OpenMANET
PKG_BUILD_PARALLEL:=1

include $(INCLUDE_DIR)/package.mk

define Package/bsp-halowlink2
	SECTION:=utils
	CATEGORY:=OpenMANET
	SUBMENU:=Boards
	TITLE:=OpenMANET HaLow Link 2 board support package
	DEPENDS:=+bsp-common
endef

define Package/bsp-halowlink2/description
This package provides board support for the MorseMicro HaLow Link 2
(morse,artini / MT7621). Includes:
- HaLow Link 2 BCF (bcf_mm_hl2_ext.bin) with correct mm8108-mf15457
  calibration data and US/AU/CA/EU/GB/JP regulatory domains
- Updated MM8108 chip firmware (mm8108b2-rl.bin) from MorseMicro 2.11.8
- Default channel 28 (916 MHz, 8 MHz BW)
- SAE mesh fix: ieee80211w=0 and sae_pwe=0 in morse_overrides.sh
endef

define Build/Compile

endef

define Package/bsp-halowlink2/install
	$(INSTALL_DIR) $(1)/etc/uci-defaults/
	$(CP) ./files/uci-defaults/* $(1)/etc/uci-defaults/

	$(INSTALL_DIR) $(1)/etc/init.d/
	$(INSTALL_BIN) ./files/etc/init.d/* $(1)/etc/init.d/

	$(INSTALL_DIR) $(1)/lib/firmware/morse/
	$(INSTALL_DATA) ./files/lib/firmware/morse/bcf_mm_hl2_ext.bin $(1)/lib/firmware/morse/
	$(INSTALL_DATA) ./files/lib/firmware/morse/mm8108b2-rl.bin $(1)/lib/firmware/morse/
endef

$(eval $(call BuildPackage,bsp-halowlink2))
