include $(TOPDIR)/rules.mk

PKG_NAME:=nettools-openmanet
PKG_VERSION:=2025.11
PKG_RELEASE:=1

PKG_MAINTAINER:=OpenMANET

include $(INCLUDE_DIR)/package.mk

define Package/nettools-openmanet
  SECTION:=net
  CATEGORY:=Network
  TITLE:=Installs nettools configuration for OpenMANET networks
  URL:=https://www.open-mesh.org/
  DEPENDS:= +alfred +PACKAGE_ALFRED_BATHOSTS +PACKAGE_ALFRED_GPSD \
  +avahi-dbus-daemon +avahi-daemon-service-http +avahi-daemon-service-ssh +avahi-utils

  PKG_INSTALL_FLAGS:=overwrite
endef

define Package/nettools-openmanet/description
  This is an nettools configuration specific for OpenMANET networks.
endef

define Package/nettools-openmanet/config
	source "$(SOURCE)/Config.in"
endef

define Package/nettools-openmanet/install
	$(INSTALL_DIR) $(1)/etc/config
	$(CP) ./files/nettools.config $(1)/etc/config/nettools

	$(INSTALL_DIR) $(1)/etc/init.d
	$(CP) ./files/mesh-routing.config $(1)/etc/init.d/mesh-routing ; true
    chmod +x $(1)/etc/init.d/mesh-routing

	$(INSTALL_DIR) $(1)/etc/nettools
	$(CP) ./files/bat-hosts.lua $(1)/etc/nettools/bat-hosts.lua ; true

	$(INSTALL_DIR) $(1)/etc/avahi
	$(CP) ./files/avahi-daemon.conf $(1)/etc/avahi/avahi-daemon.conf ; true
endef

$(eval $(call BuildPackage,nettools-openmanet))