include $(TOPDIR)/rules.mk

PKG_NAME:=mdns-openmanet
PKG_VERSION:=2025.11
PKG_RELEASE:=1

PKG_MAINTAINER:=OpenMANET

include $(INCLUDE_DIR)/package.mk

define Package/mdns-openmanet
  SECTION:=net
  CATEGORY:=Network
  TITLE:=Installs mDNS configuration for OpenMANET networks
  URL:=https://www.open-mesh.org/
  DEPENDS:=+avahi-dbus-daemon +avahi-daemon-service-http +avahi-daemon-service-ssh +avahi-utils

  PKG_INSTALL_FLAGS:=overwrite
endef

define Package/mdns-openmanet/description
  This is an nettools configuration specific for OpenMANET networks.
endef

define Package/mdns-openmanet/conffiles
/etc/avahi/avahi-daemon.conf
endef

define Build/Compile
endef

define Package/mdns-openmanet/install
	$(INSTALL_DIR) $(1)/etc/avahi
	$(CP) /files/avahi-daemon.conf $(1)/etc/avahi/avahi-daemon.conf ; true
endef

$(eval $(call BuildPackage,mdns-openmanet))
