include $(TOPDIR)/rules.mk

PKG_NAME:=hostapd_s1g
PKG_RELEASE=4

PKG_VERSION:=mm8108-2.0.0

PKG_LICENSE:=BSD-3-Clause

PKG_SOURCE_VERSION:=$(PKG_VERSION)
PKG_SOURCE_URL:=https://github.com/MorseMicro/hostap.git
PKG_MIRROR_HASH:=c26348732afd497b66bb1ed5e04c246427b50fb383ccf244bb258143c8c4e107
PKG_SOURCE_MIRROR:=0
PKG_SOURCE_PROTO:=git

PKG_MAINTAINER:=OpenMANET
PKG_BUILD_PARALLEL:=1

include $(INCLUDE_DIR)/package.mk

define Package/hostapd_s1g
  SECTION:=net
  CATEGORY:=Morse Micro
  SUBMENU:=Essentials
  TITLE:=Morse Micro HaLow hostapd
  DEPENDS:= kmod-morse +!MORSE_CUSTOM_CFG80211:kmod-cfg80211 +morsecli +libnl +libopenssl +libubus +libblobmsg-json
  USERID:=network=101:network=101
endef

define Package/hostapd_s1g/description
 This package contains a full featured Morse Micro patched
 Authenticator.
endef

define Package/hostapd_s1g/config

	config MORSE_CUSTOM_CFG80211
		bool "Use custom cfg80211 package"
		default n
		help
			Suppress auto-selection of the default kmod-cfg80211 package.
			Enable when using a vendor-specific cfg80211 package, with the
			custom package explicitly selected via CONFIG_PACKAGE_kmod-<name>=y.

	if PACKAGE_hostapd_s1g

		config MORSE_HOSTAPD_S1G_EAP
			bool
			default n
			prompt "Enable Extensible Authentication Protocol (EAP) support"

		config MORSE_HOSTAPD_S1G_ACS
			bool
			default n
			prompt "Enable automatic channel selection (ACS) support"
			help
				This will allow hostapd to pick the channel automatically when channel is set
				to "acs_survey" or "0". Eventually, other ACS algorithms can be added in
				similar way.

		config MORSE_HOSTAPD_APSTA_HANDLER
			bool
			default n
			depends on PACKAGE_wpa_supplicant_s1g
			select PACKAGE_ucode
			select PACKAGE_ucode-mod-log
			select PACKAGE_ucode-mod-fs
			select PACKAGE_ucode-mod-ubus
			select PACKAGE_ucode-mod-uloop
			prompt "AP-STA channel follow (APSTA handler)"
			help
				Enable APSTA handler functionality in hostapd.

				With this enabled, a local AP will automatically switch its channel to match
				the S1G channel of the upstream AP that the station interface is connected to.
				This ensures that HaLow radios behave in the same way as other radios on OpenWrt.

				Without this enabled, if you have both AP/Client on the same radio,
				the Client will not associate unless it is manually set to the correct channel.

	endif
endef

MAKE_FLAGS += \
	MORSE_VERSION=$(PKG_VERSION)

MMHOSTAPD_CONFIG_ENABLE = \
	NEED_LINUX_IOCTL \
	CONFIG_INTERNAL_LIBTOMMATH \
	CONFIG_DEBUG_FILE \
	CONFIG_DEBUG_SYSLOG \
	CONFIG_PMKSA_CACHE_EXTERNAL \
	CONFIG_SAE \
	CONFIG_SAE_PK \
	CONFIG_TESTING_OPTIONS \
	CONFIG_WNM \
	CONFIG_DRIVER_ACS \
	CONFIG_DRIVER_HOSTAP \
	CONFIG_DRIVER_NL80211 \
	CONFIG_DRIVER_NL80211_QCA \
	CONFIG_HS20 \
	CONFIG_IEEE80211AC \
	CONFIG_IEEE80211N \
	CONFIG_IEEE80211AH \
	CONFIG_IEEE80211R \
	CONFIG_INTERWORKING \
	CONFIG_FULL_DYNAMIC_VLAN \
	CONFIG_VLAN_NETLINK \
	CONFIG_OWE \
	CONFIG_LIBNL32 \
	CONFIG_DPP \
	CONFIG_DPP2 \
	CONFIG_DPP3 \
	CONFIG_WPS \
	CONFIG_WPS_UPNP \
	CONFIG_WPS_NFC

MMHOSTAPD_CONFIG_SET = \
	CONFIG_UBUS

MMHOSTAPD_CONFIG_DISABLE = \
    CONFIG_DRIVER_NONE \
	CONFIG_DRIVER_RTW \
	CONFIG_DRIVER_WIRED

MMHOSTAPD_CONFIG_EDITS += 's/\#\(CONFIG_TLS=openssl\)/\1/'

ifeq ($(CONFIG_MORSE_HOSTAPD_S1G_ACS),y)
	MMHOSTAPD_CONFIG_ENABLE += CONFIG_ACS
endif

ifeq ($(CONFIG_MORSE_HOSTAPD_S1G_EAP),y)
	MMHOSTAPD_CONFIG_EDITS += 's/\#\(CONFIG_EAP\)/\1/'
	MMHOSTAPD_CONFIG_ENABLE += \
		CONFIG_RADIUS_SERVER \
		CONFIG_TLSV1 \
		CONFIG_TLSV11 \
		CONFIG_TLSV12
else
	MMHOSTAPD_CONFIG_DISABLE += CONFIG_HOSTAPD_EAP
	MMHOSTAPD_CONFIG_ENABLE += \
		CONFIG_NO_ACCOUNTING \
		CONFIG_NO_RADIUS
endif

MMHOSTAPD_CONFIG = $(PKG_BUILD_DIR)/hostapd/.config

define Build/Prepare
	$(call Build/Prepare/Default)
	$(CP) $(PKG_BUILD_DIR)/hostapd/defconfig $(MMHOSTAPD_CONFIG)
	sed -i $(patsubst %,-e 's/^#\(%=\)/\1/',$(MMHOSTAPD_CONFIG_ENABLE)) \
		$(patsubst %,-e 's/^\(%=\)/#\1/',$(MMHOSTAPD_CONFIG_DISABLE)) \
		$(patsubst %,-e '1i%=y',$(MMHOSTAPD_CONFIG_SET)) \
		$(patsubst %,-e %,$(MMHOSTAPD_CONFIG_EDITS)) \
		$(MMHOSTAPD_CONFIG)
endef

TARGET_CPPFLAGS := \
	-I$(STAGING_DIR)/usr/include/libnl3 \
	-I$(PKG_BUILD_DIR)/src/crypto \
	$(TARGET_CPPFLAGS) \
	-DCONFIG_LIBNL20 \
	-D_GNU_SOURCE

TARGET_LDFLAGS += -lnl-3 -lnl-genl-3 -lnl-route-3
TARGET_LDFLAGS += -lm -lpthread -lcrypto -lssl

TARGET_LDFLAGS += -lrt
TARGET_LDFLAGS_C += -lrt

TARGET_LDFLAGS += -lubox -lubus -lblobmsg_json -lm

# Use of old OpenSSL functions in dpp_supplicant.c
TARGET_CFLAGS += -Wno-deprecated-declarations

define Build/RunMake
	CFLAGS="$(TARGET_CPPFLAGS) $(TARGET_CFLAGS)" \
	$(MAKE) $(MAKE_FLAGS) $(PKG_JOBS) -C $(PKG_BUILD_DIR)/$(1) \
		$(TARGET_CONFIGURE_OPTS) \
		$(DRIVER_MAKEOPTS) \
		LIBS="$(TARGET_LDFLAGS)" \
		LIBS_c="$(TARGET_LDFLAGS_C)" \
		AR="$(TARGET_CROSS)gcc-ar" \
		BCHECK= \
		$(2)
endef

define Build/Compile
	+$(call Build/RunMake,hostapd, \
		hostapd_s1g hostapd_cli_s1g \
	)
endef

define Package/hostapd_s1g/install
	$(INSTALL_DIR) $(1)/usr/sbin
	$(INSTALL_BIN) $(PKG_BUILD_DIR)/hostapd/hostapd_s1g $(1)/usr/sbin
	$(INSTALL_BIN) $(PKG_BUILD_DIR)/hostapd/hostapd_cli_s1g $(1)/usr/sbin

ifeq ($(CONFIG_MORSE_HOSTAPD_APSTA_HANDLER),y)
	$(INSTALL_DIR) $(1)/etc/init.d
	$(INSTALL_BIN) ./files/etc/init.d/apsta-handler $(1)/etc/init.d
	$(INSTALL_BIN) ./files/usr/sbin/apsta-handler $(1)/usr/sbin
endif
endef

$(eval $(call BuildPackage,hostapd_s1g))
