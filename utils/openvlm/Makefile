include $(TOPDIR)/rules.mk

PKG_NAME:=openvlm
PKG_VERSION:=1.0.0
PKG_RELEASE:=1

PKG_SOURCE_PROTO:=git
PKG_SOURCE_URL:=https://github.com/OpenMANET/openvlm
PKG_SOURCE_VERSION:=$(PKG_VERSION)
PKG_HASH:=skip

PKG_LICENSE:=MIT
PKG_MAINTAINER:=Corey Wagehoft

PKG_BUILD_DEPENDS:=golang/host
PKG_BUILD_PARALLEL:=1
PKG_BUILD_FLAGS:=no-mips16 gc-sections lto

GO_PKG:=github.com/openmanet/openvlm
GO_PKG_LDFLAGS:=-s -w
GO_PKG_LDFLAGS_X:=github.com/openmanet/openvlm/cmd.version=$(PKG_VERSION)

include $(INCLUDE_DIR)/package.mk
include ../lang/golang/golang-package.mk

define Package/openvlm
  SECTION:=utils
  CATEGORY:=Utilities
  TITLE:=OpenVLM
  DEPENDS:=$(GO_ARCH_DEPENDS) +libevdev +kmod-usb-core +kmod-usb-audio +hidapi
endef

define Package/openvlm/description
Cross-platform CLI for reading, writing, and validating the EEPROM on OpenVLM USB audio devices.
endef

define Package/openvlm/conffiles
/etc/openvlm/
endef

define Package/openvlm/install
	# Strip and upx the binary if we're building for mipsel
	# This will compress the binary on mipsel hardware
	if [ "$(GOARCH)" = "mipsle" ]; then \
		upx --lzma --best $(GO_PKG_BUILD_BIN_DIR)/$(PKG_NAME) || true; \
	fi

	$(call GoPackage/Package/Install/Bin,$(1))

	$(INSTALL_DIR) $(1)/etc/openvlm/
endef

$(eval $(call GoBinPackage,openvlm))
$(eval $(call BuildPackage,openvlm))
