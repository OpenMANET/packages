include $(TOPDIR)/rules.mk

PKG_NAME:=mavp2p
PKG_VERSION:=1.3.3
PKG_RELEASE:=1

PKG_SOURCE:=$(PKG_NAME)-$(PKG_VERSION).tar.gz
PKG_SOURCE_URL:=https://codeload.github.com/bluenviron/mavp2p/tar.gz/v$(PKG_VERSION)?
PKG_HASH:=708e82c637793730e100e213beffacb1a7d92cad192ed9ae0f8570d52b256bf1

PKG_LICENSE:=MIT
PKG_LICENSE_FILES:=LICENSE
PKG_MAINTAINER:=OpenMANET <info@openmanet.net>

PKG_BUILD_DEPENDS:=golang/host
PKG_BUILD_PARALLEL:=1
PKG_BUILD_FLAGS:=no-mips16

GO_PKG:=github.com/bluenviron/mavp2p
GO_PKG_LDFLAGS_X:=main.version=v$(PKG_VERSION)

include $(INCLUDE_DIR)/package.mk
include ../../lang/golang/golang-package.mk

define Package/mavp2p
  SECTION:=net
  CATEGORY:=Network
  TITLE:=Flexible MAVLink proxy and router
  URL:=https://github.com/bluenviron/mavp2p
  DEPENDS:=$(GO_ARCH_DEPENDS)
endef

define Package/mavp2p/description
  mavp2p is a command-line MAVLink proxy, bridge and router for serial,
  TCP and UDP endpoints.
endef

$(eval $(call GoBinPackage,mavp2p))
$(eval $(call BuildPackage,mavp2p))
