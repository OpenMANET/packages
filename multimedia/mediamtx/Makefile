#
# Copyright 2023 Morse Micro
#
# This is free software, licensed under the Apache License, Version 2.0.
#

include $(TOPDIR)/rules.mk

PKG_NAME:=mediamtx_openmanet
PKG_VERSION:=1.16.1
PKG_RELEASE:=1

PKG_SOURCE:=$(PKG_NAME)-$(PKG_VERSION).tar.gz
PKG_SOURCE_URL:=https://codeload.github.com/bluenviron/mediamtx/tar.gz/v$(PKG_VERSION)?
PKG_HASH:=skip

PKG_BUILD_DEPENDS:=golang/host
PKG_BUILD_PARALLEL:=1
PKG_BUILD_FLAGS:=no-mips16

GO_PKG:=github.com/bluenviron/mediamtx
GO_PKG_LDFLAGS_X:=$(GO_PKG)/internal/core.version=$(PKG_VERSION)

include $(INCLUDE_DIR)/package.mk
include ../../lang/golang/golang-package.mk
include $(INCLUDE_DIR)/nls.mk

# Original Makefile had this, but the Golang in our version doesn't seem to support it.
# GO_MOD_ARGS:=-buildvcs=false

define Package/mediamtx
  SECTION:=multimedia
  CATEGORY:=Multimedia
  TITLE:=MediaMTX
  URL:=https://github.com/bluenviron/mediamtx
  DEPENDS=$(GO_ARCH_DEPENDS) $(INTL_DEPENDS)
  MENU:=1
endef

# To support the rpicamera, there's a minimal binary that mediamtx spawns
# to read the stream. For now, we equate 'rpicamera' with 'libcamera'.
# Ideally, we'd have a separate config option, but if you define that option
# inside this package we seem to end up with some kind of recursive dependency
# issue as our dependencies are enabled by this as well.
# ifeq ($(CONFIG_PACKAGE_libcamera),y)
# GO_PKG_TAGS:=rpicamera
# MAKE_PATH=internal/protocols/rpicamera/exe

define Build/Compile
	$(call Build/Compile/Default)
	$(call GoPackage/Build/Compile)
endef

define Package/mediamtx/install
	$(call GoPackage/Package/Install/Bin,$(1))
	$(INSTALL_DIR) $(1)/etc/init.d
	$(INSTALL_BIN) files/mediamtx.init $(1)/etc/init.d/mediamtx
	$(INSTALL_DIR) $(1)/etc/config
	$(INSTALL_CONF) files/mediamtx.config $(1)/etc/config/mediamtx
endef

define Package/mediamtx/description
  Ready-to-use server and proxy that allows users to publish, read and proxy live video and audio streams through various protocols.

  If libcamera is enabled, it will try to build its rpicamera support.
endef

$(eval $(call GoBinPackage,mediamtx))
$(eval $(call BuildPackage,mediamtx))
