include $(TOPDIR)/rules.mk

PKG_NAME:=wpa_supplicant_s1g
PKG_RELEASE=2

PKG_VERSION:=mm8108-2.0.0

PKG_LICENSE:=BSD-3-Clause

PKG_SOURCE_VERSION:=$(PKG_VERSION)
PKG_SOURCE_URL:=https://github.com/MorseMicro/hostap.git
PKG_MIRROR_HASH:=727ecdb4ec71434b8eddaaa3f8290d583c55861ef8f505b9b07a430d770cd3e8
PKG_SOURCE_MIRROR:=0
PKG_SOURCE_PROTO:=git

PKG_MAINTAINER:=OpenMANET
PKG_BUILD_PARALLEL:=1

include $(INCLUDE_DIR)/package.mk

# This source builds the supplicant half of MorseMicro hostap.git; hostapd_s1g
# builds the AP half from the same tag with the same patch set. The split
# keeps each binary package name owned by exactly one feed source so
# scripts/feeds install -a dedupe works (matches morse/gateworks layout).
# MORSE_CUSTOM_CFG80211 is defined by hostapd_s1g.

define Package/wpa_supplicant_s1g
  SECTION:=net
  CATEGORY:=Morse Micro
  SUBMENU:=Essentials
  TITLE:=Morse Micro HaLow wpa_supplicant
  DEPENDS:= +kmod-dot11ah +!MORSE_CUSTOM_CFG80211:kmod-cfg80211 +morsecli +libnl +libopenssl +libubus +MORSE_WPA_SUPPLICANT_S1G_DBUS:dbus +MORSE_WPA_SUPPLICANT_S1G_DBUS:libdbus +libblobmsg-json
  USERID:=network=101:network=101
endef

define Package/libwpa_client_s1g
  SECTION:=net
  CATEGORY:=Morse Micro
  SUBMENU:=Essentials
  TITLE:=libwpa_client_s1g
  DEPENDS:=wpa_supplicant_s1g
endef

define Package/libwpa_client_s1g/description
  wpa_supplicant_s1g client library
endef

define Package/wpa_supplicant_s1g/config
	if PACKAGE_wpa_supplicant_s1g

		config MORSE_WPA_SUPPLICANT_S1G_MESH_NETWORKING
			bool
			default n
			prompt "Enable mesh networking support"

		config MORSE_WPA_SUPPLICANT_S1G_EAP
			bool
			default n
			prompt "Enable Extensible Authentication Protocol (EAP) support"

		config MORSE_WPA_SUPPLICANT_S1G_DBUS
			bool
			default n
			prompt "Enable dbus support"

	endif

endef

MAKE_FLAGS += \
	MORSE_VERSION=$(PKG_VERSION)

MMWPA_SUPPLICANT_CONFIG_SET = \
	CONFIG_UBUS

MMWPA_SUPPLICANT_CONFIG_ENABLE = \
	CONFIG_IEEE80211AC \
	CONFIG_IEEE80211N \
	CONFIG_IEEE80211R \
	CONFIG_INTERNAL_LIBTOMMATH \
	CONFIG_DEBUG_FILE \
	CONFIG_MATCH_IFACE \
	CONFIG_LIBNL32 \
	CONFIG_DRIVER_WEXT \
	CONFIG_DRIVER_NL80211 \
	CONFIG_DRIVER_NL80211_QCA \
	CONFIG_DRIVER_WIRED \
	CONFIG_IEEE8021X_EAPOL \
	CONFIG_WPS \
	CONFIG_WPS_ER \
	CONFIG_WPS_NFC \
	CONFIG_WPS_REG_DISABLE_OPEN \
	CONFIG_PKCS12 \
	CONFIG_CTRL_IFACE \
	CONFIG_READLINE \
	CONFIG_IEEE80211W \
	CONFIG_INTERNAL_LIBTOMMATH_FAST \
	CONFIG_DEBUG_SYSLOG \
	CONFIG_DEBUG_SYSLOG_FACILITY \
	CONFIG_INTERWORKING \
	CONFIG_HS20 \
	CONFIG_MATCH_IFACE \
	CONFIG_AP \
	CONFIG_P2P \
	CONFIG_IBSS_RSN \
	CONFIG_OWE \
	CONFIG_DPP \
	CONFIG_DPP2 \
	CONFIG_DPP3 \
	CONFIG_SAE \
	CONFIG_SAE_PK \
	CONFIG_TESTING_OPTIONS \
	CONFIG_PMKSA_CACHE_EXTERNAL \
	CONFIG_WNM \
	CONFIG_IPV6

MMWPA_SUPPLICANT_CONFIG_DISABLE = \
	CONFIG_BGSCAN_SIMPLE \
	CONFIG_SMARTCARD \
	CONFIG_READLINE

MMWPA_SUPPLICANT_CONFIG_EDITS += 's/\#\(CONFIG_TLS=openssl\)/\1/'

ifeq ($(CONFIG_MORSE_WPA_SUPPLICANT_S1G_MESH_NETWORKING),y)
	MMWPA_SUPPLICANT_CONFIG_ENABLE += CONFIG_MESH
endif

ifeq ($(CONFIG_MORSE_WPA_SUPPLICANT_S1G_EAP),y)
	MMWPA_SUPPLICANT_CONFIG_ENABLE += \
		CONFIG_EAP_PEAP \
		CONFIG_EAP_MD5 \
		CONFIG_EAP_MSCHAPV2 \
		CONFIG_EAP_TLS \
		CONFIG_EAP_TLSV1_3 \
		CONFIG_EAP_TTLS \
		CONFIG_EAP_GTC \
		CONFIG_EAP_PWD
endif

ifeq ($(CONFIG_MORSE_WPA_SUPPLICANT_S1G_DBUS),y)
	MMWPA_SUPPLICANT_CONFIG_ENABLE += CONFIG_CTRL_IFACE_DBUS_NEW
endif

MMWPA_SUPPLICANT_CONFIG = $(PKG_BUILD_DIR)/wpa_supplicant/.config

define Build/Prepare
	$(call Build/Prepare/Default)
	$(CP) $(PKG_BUILD_DIR)/wpa_supplicant/defconfig $(MMWPA_SUPPLICANT_CONFIG)
	sed -i $(patsubst %,-e 's/^#\(%=\)/\1/',$(MMWPA_SUPPLICANT_CONFIG_ENABLE)) \
		$(patsubst %,-e 's/^\(%=\)/#\1/',$(MMWPA_SUPPLICANT_CONFIG_DISABLE)) \
		$(patsubst %,-e '1i%=y',$(MMWPA_SUPPLICANT_CONFIG_SET)) \
		$(patsubst %,-e %,$(MMWPA_SUPPLICANT_CONFIG_EDITS)) \
		$(MMWPA_SUPPLICANT_CONFIG)
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
	+$(call Build/RunMake,wpa_supplicant, \
		wpa_supplicant_s1g wpa_cli_s1g \
	)
	+$(call Build/RunMake,wpa_supplicant, libwpa_client_s1g.so)
endef

define Package/wpa_supplicant_s1g/install
	$(INSTALL_DIR) $(1)/usr/sbin
	$(INSTALL_BIN) $(PKG_BUILD_DIR)/wpa_supplicant/wpa_supplicant_s1g $(1)/usr/sbin/
	$(INSTALL_BIN) $(PKG_BUILD_DIR)/wpa_supplicant/wpa_cli_s1g $(1)/usr/sbin/

ifeq ($(CONFIG_MORSE_WPA_SUPPLICANT_S1G_DBUS),y)
	$(INSTALL_DIR) $(1)/etc/dbus-1/system.d/
	$(INSTALL_DATA) $(PKG_BUILD_DIR)/wpa_supplicant/dbus/dbus-wpa_supplicant_s1g.conf $(1)/etc/dbus-1/system.d/wpa_supplicant_s1g.conf
endif
endef

define Package/libwpa_client_s1g/install
	$(INSTALL_DIR) $(1)/usr/lib/
	$(INSTALL_BIN) $(PKG_BUILD_DIR)/wpa_supplicant/libwpa_client_s1g.so $(1)/usr/lib/
endef

define Build/InstallDev
	$(INSTALL_DIR) $(1)/usr/lib/
	$(INSTALL_DIR) $(1)/usr/include/
	$(CP) $(PKG_BUILD_DIR)/wpa_supplicant/libwpa_client_s1g.so		$(1)/usr/lib/
	$(CP) $(PKG_BUILD_DIR)/src/common/wpa_ctrl.h				$(1)/usr/include/wpa_ctrl.h
endef

$(eval $(call BuildPackage,wpa_supplicant_s1g))
$(eval $(call BuildPackage,libwpa_client_s1g))
