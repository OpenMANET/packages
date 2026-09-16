include $(TOPDIR)/rules.mk

PKG_NAME:=adsbtocot
PKG_VERSION:=9.0.1
PKG_RELEASE:=1
PYPI_NAME:=adsbcot
PKG_HASH:=fb0a2349ee7ddf52fe9be3d0fc97cf045cddcd2d3187af6f5903f4673490f3ec
PKG_MAINTAINER:=info@openmanet.net
PKG_LICENSE:=Apache-2.0
PKG_LICENSE_FILES:=LICENSE

include $(TOPDIR)/feeds/packages/lang/python/pypi.mk
include $(INCLUDE_DIR)/package.mk
include $(TOPDIR)/feeds/packages/lang/python/python3-package.mk

define Package/adsbtocot
  SECTION:=utils
  CATEGORY:=Utilities
  TITLE:=ADS-B to Cursor-on-Target (ADSBCOT) for OpenWrt (dump1090 local)
  URL:=https://github.com/snstac/adsbcot
  DEPENDS:=+python3-pytak +python3-aircot +python3-aiohttp +python3-websockets10 +dump1090 +rtl-sdr
endef

define Package/adsbtocot/description
  Forward dump1090 ADS-B tracks to CoT/TAK using ADSBCOT.
  Shares target-built Python dependencies with AISCOT.
endef

define Package/adsbtocot/conffiles
/etc/adsbcot/adsbcot.ini
endef

define Py3Package/adsbtocot/install
	$(INSTALL_DIR) $(1)/usr/bin $(1)/etc/adsbcot $(1)/etc/init.d
	$(INSTALL_BIN) $(PKG_INSTALL_DIR)/usr/bin/adsbcot $(1)/usr/bin/adsbcot
	$(INSTALL_CONF) ./files/adsbcot.ini $(1)/etc/adsbcot/adsbcot.ini
	$(INSTALL_BIN) ./files/adsbcot.init $(1)/etc/init.d/adsbcot
	$(INSTALL_DIR) $(1)/etc/uci-defaults
	$(INSTALL_BIN) ./files/99-adsb-defaults $(1)/etc/uci-defaults/99-adsb-defaults
endef

$(eval $(call Py3Package,adsbtocot))
$(eval $(call BuildPackage,adsbtocot))
