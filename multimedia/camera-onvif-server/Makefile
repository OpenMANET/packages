#
# Copyright (C) 2023-2024 Morse Micro
#
# This is free software, licensed under the GNU General Public License v2.
# See /LICENSE for more information.
#

# OpenMANET override of MorseMicro/morse-feed fc332b01: reserve 8080/8081
# for the daemon frontend and use 8082 for ONVIF discovery/service URLs.
include $(TOPDIR)/rules.mk

PKG_NAME:=camera-onvif-server
PKG_RELEASE:=4

PKG_SOURCE_PROTO:=git
PKG_SOURCE_VERSION:=v_0_7
PKG_VERSION=$(PKG_SOURCE_VERSION)
PKG_SOURCE_URL:=https://github.com/MorseMicro/camera-onvif-server.git
PKG_MIRROR_HASH:=4291671fcccbb91995ea8b1935d2c1ad5e89807d7dac12fa2965a4a7f85bf1cd

PKG_LICENSE:=GPL-2.0

include $(INCLUDE_DIR)/package.mk

define Package/camera-onvif-server
  SECTION:=multimedia
  CATEGORY:=Multimedia
  TITLE:=ONVIF server for cameras
  # Currently, we only support RPI cameras via mediamtx with this package
  # (camera-onvif-server itself supports different backends).
  # Including libcamera will make MediaMTX build with rpicamera support.
  DEPENDS:=+mediamtx +libcamera +libstdcpp +libpthread
endef

define Package/camera-onvif-server/description
  Provides auto-detection and configuration of a camera via ONVIF.

  Currently this package only supports Raspberry Pi cameras via mediamtx
  (which in turn relies on libcamera).
endef

define Package/camera-onvif-server/install
	$(INSTALL_DIR) $(1)/usr/bin
	$(INSTALL_BIN) $(PKG_BUILD_DIR)/camera-onvif-server $(1)/usr/bin
	$(INSTALL_DIR) $(1)/etc/init.d
	$(INSTALL_BIN) files/camera-onvif-server.init $(1)/etc/init.d/camera-onvif-server
	$(INSTALL_DIR) $(1)/etc/config
	$(INSTALL_CONF) files/camera-onvif-server.config $(1)/etc/config/camera-onvif-server
	$(INSTALL_DIR) $(1)/etc/uci-defaults
	$(INSTALL_BIN) files/45-camera-onvif-port $(1)/etc/uci-defaults/45-camera-onvif-port
	$(INSTALL_DIR) $(1)/etc/camera-onvif-server
	$(INSTALL_DATA) files/config-rpicamera-initial.xml $(1)/etc/camera-onvif-server/config-rpicamera.xml
	$(INSTALL_DIR) $(1)/usr/share/camera-onvif-server
	$(INSTALL_DATA) files/properties-rpicamera.xml.uc $(1)/usr/share/camera-onvif-server
endef

$(eval $(call BuildPackage,camera-onvif-server))
