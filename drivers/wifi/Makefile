include $(TOPDIR)/rules.mk

PKG_NAME:=wifi-openmanet
PKG_VERSION:=2025.11
PKG_RELEASE:=1

PKG_MAINTAINER:=OpenMANET

include $(INCLUDE_DIR)/package.mk

define Package/wifi-openmanet
  SECTION:=drivers
  CATEGORY:=Drivers
  TITLE:=WiFi - Wireless Networking
  URL:=https://openmanet.net/
  DEPENDS:= +iwlwifi-firmware-ax210 +iwlwifi-firmware-ax200 +kmod-iwlwifi \
  +kmod-owl-loader +ath11k-firmware-wcn6855 +kmod-ath11k +kmod-ath11k-pci \
  +ath10k-firmware-qca6174 +kmod-ath10k \
  +kmod-mt7915-firmware +kmod-mt7916-firmware +kmod-mt7915e +kmod-mt7921-firmware +kmod-mt7921e \

  PKG_INSTALL_FLAGS:=overwrite
endef

define Package/wifi-openmanet/description
  This package contains all of the WiFi drivers required for OpenMANET networks.
endef

$(eval $(call BuildPackage,wifi-openmanet))
