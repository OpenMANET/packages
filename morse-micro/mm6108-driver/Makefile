#
# Copyright 2025 Gateworks
#
# This is free software, licensed under the GPL 2 license.
#

include $(TOPDIR)/rules.mk

PKG_NAME:=mm6108-driver
PKG_RELEASE:=1

PKG_VERSION:=mm6108-2.0.1
PKG_RELEASE=1

PKG_SOURCE_VERSION:=$(PKG_VERSION)
PKG_SOURCE_URL:=https://github.com/MorseMicro/morse_driver.git
PKG_MIRROR_HASH:=24b28e0061f4d8e94586f562157ee023affbddf909cfcd3ac21f02818443e0b2
PKG_SOURCE_MIRROR:=0
PKG_SOURCE_PROTO:=git

PKG_MAINTAINER:=OpenMANET
PKG_BUILD_PARALLEL:=1

include $(INCLUDE_DIR)/kernel.mk
include $(INCLUDE_DIR)/package.mk

DTC=$(wildcard $(LINUX_DIR)/scripts/dtc/dtc)

# Extract mac80211 version
MAC80211_VERSION:=v$(shell grep '^PKG_VERSION:=' $(TOPDIR)/package/kernel/mac80211/Makefile | cut -d'=' -f2 | head -1)
MORSE_VERSION:=mm6108-$(PKG_VERSION)-gateworks-g$(call version_abbrev,$(PKG_SOURCE_VERSION))

define KernelPackage/mm6108
  SUBMENU:=Wireless Drivers
  TITLE:=Morse Micro WIFI HaLow mm6108
  DEPENDS:= +kmod-dot11ah +kmod-mmc +kmod-mac80211 +kmod-lib-crc7 +kmod-trelay
  # The module is renamed to mm6108_sdio.ko (patch 020) so this package can
  # coexist with kmod-mm8108's morse.ko in one rootfs. dot11ah.ko is
  # provided by the shared kmod-dot11ah package (from mm8108-driver), not
  # shipped from this tree.
  FILES:=$(PKG_BUILD_DIR)/mm6108_sdio.ko
  AUTOLOAD:=$(call AutoProbe,mm6108_sdio)
  MODPARAMS.mm6108_sdio:=country=US enable_ext_xtal_init=1
  PROVIDES:=kmod-morse
endef

define KernelPackage/mm6108/description
	This package contains the proprietary wireless driver for the MorseMicro mm6108 chip SDIO interface.
endef

ifeq ($(CONFIG_MORSE_SDIO),y)
  MORSE_MAKEDEFS += CONFIG_MORSE_SDIO=y
  MORSE_MAKEDEFS += CONFIG_MORSE_SDIO_ALIGNMENT=4
endif

ifeq ($(CONFIG_MORSE_SPI),y)
  MORSE_MAKEDEFS += CONFIG_MORSE_SPI=y
endif

ifeq ($(CONFIG_MORSE_DEBUG),y)
  # This DEBUG (used by the driver Makefile) should not be confused with
  # -DDEBUG (used by the kernel build system).
  MORSE_MAKEDEFS += DEBUG=y
  MORSE_MAKEDEFS += CONFIG_MORSE_ENABLE_TEST_MODES=y
else
  MORSE_MAKEDEFS += DEBUG=n
endif

# Hardcode the feature set (mirroring mm8108-driver) instead of gating on
# OpenWrt CONFIG_MORSE_* symbols, which are unreliable here (their kconfig
# entries depend on the virtual PACKAGE_kmod-morse). Driver 2.0.x cannot
# build without them anyway:
#  - CONFIG_MORSE_RC: bss_stats.h/morse.h reference mmrc types
#    (struct mmrc_rate, MMRC_SUPP_NUM_*) unconditionally.
#  - CONFIG_MORSE_VENDOR_COMMAND: morse_vendor_* callers are unguarded and
#    vendor.h has no fallback stubs, so morse.ko fails modpost without
#    vendor.o.
#  - CONFIG_MORSE_SDIO + CONFIG_MORSE_SPI: MM6108 modules ship in both SDIO
#    and SPI variants (the Seeed Wio-WM6108 mini-PCIe module is SPI). Both
#    bus front-ends live in the one module and each only probes when a
#    matching device exists, so both are always enabled.
MORSE_MAKEDEFS += \
  MORSE_VERSION="$(MORSE_VERSION)" \
  KERNEL_SRC=$(LINUX_DIR) \
  CONFIG_BACKPORT_VERSION=$(MAC80211_VERSION) \
  CONFIG_MORSE_SDIO=y \
  CONFIG_MORSE_SDIO_ALIGNMENT=4 \
  CONFIG_MORSE_SPI=y \
  CONFIG_MORSE_USER_ACCESS=y \
  CONFIG_MORSE_POWERSAVE_MODE=0 \
  CONFIG_MORSE_VENDOR_COMMAND=y \
  CONFIG_MORSE_RC=y \
  CONFIG_MORSE_MONITOR=y \
  CONFIG_MORSE_DEBUGFS=y \
  CONFIG_MORSE_COUNTRY=US \
  CONFIG_WLAN_VENDOR_MORSE=m

NOSTDINC_FLAGS = \
	-I$(PKG_BUILD_DIR) \
	-I$(STAGING_DIR)/usr/include/mac80211-backport/uapi \
	-I$(STAGING_DIR)/usr/include/mac80211-backport \
	-I$(STAGING_DIR)/usr/include/mac80211/uapi \
	-I$(STAGING_DIR)/usr/include/mac80211 \
	-include backport/autoconf.h \
	-include backport/backport.h

include $(INCLUDE_DIR)/kernel-defaults.mk

define Build/Compile
	$(MAKE) $(MORSE_MAKEDEFS) $(PKG_JOBS) -C "$(LINUX_DIR)" \
		$(KERNEL_MAKE_FLAGS) \
		M="$(PKG_BUILD_DIR)" \
		NOSTDINC_FLAGS="$(NOSTDINC_FLAGS)" \
		modules
endef

$(eval $(call KernelPackage,mm6108))
