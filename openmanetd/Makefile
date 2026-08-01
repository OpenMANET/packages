include $(TOPDIR)/rules.mk

PKG_NAME:=openmanetd

PKG_VERSION:=1.3.4-atak-camera-sensor-cot
PKG_RELEASE:=5

PKG_SOURCE_PROTO:=git
PKG_SOURCE_URL:=https://github.com/OpenMANET/openmanetd
PKG_SOURCE_VERSION:=e4fa21a86c06cce44ab591f67cc4d3245c89d650
PKG_HASH:=skip

PKG_LICENSE:=MIT
PKG_MAINTAINER:=Corey Wagehoft

PKG_BUILD_DEPENDS:=golang/host
PKG_BUILD_PARALLEL:=1
PKG_BUILD_FLAGS:=no-mips16 gc-sections lto

GO_PKG:=github.com/openmanet/openmanetd
GO_PKG_LDFLAGS:=-s -w
GO_PKG_LDFLAGS_X:=github.com/openmanet/openmanetd/cmd.version=$(PKG_VERSION)

include $(INCLUDE_DIR)/package.mk
include ../lang/golang/golang-package.mk

# miniaudio (via gen2brain/malgo) hardcodes -msse2 in its CGO flags for any
# GOARCH that isn't arm/arm64, breaking the mipsle cross-compile used by
# halowlink2 (ramips/mt7621) and ht-hd01-v2 (ramips/mt76x8). The noasm build
# tag falls back to scalar C. Documented in openmanetd's own CLAUDE.md.
ifeq ($(GO_ARCH),mipsle)
  GO_PKG_TAGS:=noasm
endif

# Explicit runtime deps (correct OpenWrt syntax)
RDEPENDS:$(PKG_NAME) += libopusfile

define Package/openmanetd
  SECTION:=utils
  CATEGORY:=Utilities
  TITLE:=OpenMANET Manager
  DEPENDS:=$(GO_ARCH_DEPENDS) +kmod-batman-adv +alfred +libc @IPV6 +libnl-tiny +librt \
		+portaudio +libopus +libevdev +alsa-lib +kmod-usb-core +kmod-usb-audio \
		+kmod-sound-core +libopusfile +hidapi +libpam
endef

define Package/openmanetd/description
A management application for openmanetd written in Go.
Includes:
- pttgo: A multicast push-to-talk voice application written in Go using PortAudio, Opus, and evdev.
endef

define Build/Configure
	# Compile Alfred Bindings
	$(MAKE) -C $(PKG_BUILD_DIR)/internal/alfred/alfred

	$(call GoPackage/Build/Configure,$(1))
	$(call Build/Configure/Default,$(1))
endef

MAKE_FLAGS += \
	LIBNL_NAME="libnl-tiny" \
	LIBNL_GENL_NAME="libnl-tiny" \

define Package/openmanetd/conffiles
/etc/openmanetd/
endef

define Package/openmanetd/install
	# Strip and upx the binary if we're building for mipsel
	# This will compress the binary on mipsel hardware
	if [ "$(GOARCH)" = "mipsle" ]; then \
		upx --lzma --best $(GO_PKG_BUILD_BIN_DIR)/$(PKG_NAME) || true; \
	fi

	$(call GoPackage/Package/Install/Bin,$(1))

	$(INSTALL_DIR) $(1)/etc/openmanetd/
	$(INSTALL_CONF) $(CURDIR)/files/sample_config.yml $(1)/etc/openmanetd/config.yml
	$(INSTALL_DIR) $(1)/etc/config/
	$(INSTALL_CONF) $(CURDIR)/files/openmanetd.config $(1)/etc/config/openmanetd
	$(INSTALL_DIR) $(1)/etc/init.d/
	$(INSTALL_BIN) $(CURDIR)/files/openmanetd.init $(1)/etc/init.d/openmanetd
endef

$(eval $(call GoBinPackage,openmanetd))
$(eval $(call BuildPackage,openmanetd))
