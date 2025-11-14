include $(TOPDIR)/rules.mk

PKG_NAME:=mdns-openmanet
PKG_VERSION:=1
PKG_RELEASE:=1

PKG_MAINTAINER:=OpenMANET

include $(INCLUDE_DIR)/package.mk

define Package/mdns-openmanet
  SECTION:=drivers
  CATEGORY:=Drivers
  TITLE:=mDNS - Multicast DNS
  URL:=https://openmanet.net/
  DEPENDS:= +avahi-dbus-daemon +avahi-daemon-service-http +avahi-daemon-service-ssh +avahi-utils
  PKG_INSTALL_FLAGS:=overwrite
endef

define Package/mdns-openmanet/description
  This package contains all of the mDNS support required for OpenMANET networks.
endef

define Package/mdns-openmanet/install
	$(INSTALL_DIR) $(1)/etc/avahi
	$(CP) ./files/avahi-daemon.conf $(1)/etc/avahi/avahi-daemon.conf ; true
endef

$(eval $(call BuildPackage,mdns-openmanet))
