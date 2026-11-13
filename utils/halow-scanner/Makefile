include $(TOPDIR)/rules.mk

PKG_NAME:=halow-scanner
PKG_VERSION:=2025.10.27
PKG_RELEASE:=1
PKG_SOURCE_VERSION:=e48bb8881d393738f17853b02a9c761fdd6d0ba0
PKG_SOURCE:=$(PKG_NAME)-$(PKG_SOURCE_VERSION).tar.gz
PKG_SOURCE_URL:=https://codeload.github.com/lmlsna/halow_scanner/tar.gz/$(PKG_SOURCE_VERSION)?
PKG_HASH:=bbc005b2ff51cb36ba01db5a6f1c644657a57e09f5a7b8b676786660597be1ea
PKG_BUILD_DIR:=$(BUILD_DIR)/halow_scanner-$(PKG_SOURCE_VERSION)
PKG_LICENSE:=MIT
PKG_LICENSE_FILES:=LICENSE
PKG_MAINTAINER:=info@openmanet.net
PKGARCH:=all

include $(INCLUDE_DIR)/package.mk

define Package/halow-scanner
  SECTION:=utils
  CATEGORY:=Utilities
  TITLE:=RTL-SDR HaLow channel noise scanner
  URL:=https://github.com/lmlsna/halow_scanner
  DEPENDS:=+python3-pyrtlsdr +python3-numpy +wifi-scripts +ubus +uci
endef

define Package/halow-scanner/description
  Measure HaLow channel noise with an RTL-SDR USB receiver.
  Optionally suspend a selected HaLow radio during the scan and restore it.
endef

define Build/Compile
endef

define Package/halow-scanner/install
	$(INSTALL_DIR) $(1)/usr/bin $(1)/usr/share/halow-scanner
	$(INSTALL_BIN) ./files/halow-scanner $(1)/usr/bin/halow-scanner
	$(INSTALL_DATA) $(PKG_BUILD_DIR)/halow_scanner.py $(1)/usr/share/halow-scanner/
	$(INSTALL_DATA) $(PKG_BUILD_DIR)/halow_channels.csv $(1)/usr/share/halow-scanner/
endef

$(eval $(call BuildPackage,halow-scanner))
