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
endef

define Package/mdns-openmanet/description
  This package contains all of the mDNS support required for OpenMANET networks.
endef

$(eval $(call BuildPackage,mdns-openmanet))
