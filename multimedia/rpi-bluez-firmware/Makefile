include $(TOPDIR)/rules.mk

PKG_NAME:=rpi-bluez-firmware
PKG_VERSION:=1.2
PKG_RELEASE:=1

PKG_SOURCE_VERSION:=cdf61dc691a49ff01a124752bd04194907f0f9cd
PKG_SOURCE:=bluez-firmware-$(PKG_SOURCE_VERSION).tar.gz
PKG_SOURCE_URL:=https://codeload.github.com/RPi-Distro/bluez-firmware/tar.gz/
PKG_SOURCE_URL_FILE:=$(PKG_SOURCE_VERSION)
PKG_HASH:=5e027003671a8b129d3e44b6f13845f0a51596047d2310cb69e04a22ea16e70f
PKG_BUILD_DIR:=$(BUILD_DIR)/bluez-firmware-$(PKG_SOURCE_VERSION)
PKG_LICENSE:=LicenseRef-Cypress
PKG_LICENSE_FILES:=debian/firmware/broadcom/LICENSE.cypress

include $(INCLUDE_DIR)/package.mk

define Package/rpi-bluez-firmware
  SECTION:=firmware
  CATEGORY:=Firmware
  TITLE:=Raspberry Pi 4 Bluetooth controller firmware
  URL:=https://github.com/RPi-Distro/bluez-firmware
  PKGARCH:=all
endef

define Build/Compile
endef

define Package/rpi-bluez-firmware/install
	$(INSTALL_DIR) $(1)/lib/firmware/brcm
	$(INSTALL_DATA) $(PKG_BUILD_DIR)/debian/firmware/broadcom/BCM4345C0.hcd $(1)/lib/firmware/brcm/
	$(INSTALL_DATA) $(PKG_BUILD_DIR)/debian/firmware/broadcom/BCM4345C5.hcd $(1)/lib/firmware/brcm/
	$(INSTALL_DATA) $(PKG_BUILD_DIR)/debian/firmware/broadcom/LICENSE.cypress $(1)/lib/firmware/brcm/LICENSE.cypress-rpi-bluez
endef

$(eval $(call BuildPackage,rpi-bluez-firmware))
