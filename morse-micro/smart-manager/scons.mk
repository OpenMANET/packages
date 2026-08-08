# Originally this scons.mk lived in the openwrt $INCLUDE_DIR
# someone decided to move it into the packages feed.
# While I would love to just include the Makefile from the packages
# feed, I am aiming to avoid any cross-feed dependencies, so am
# opting to just duplicate it here.

export PLATFORM=posix

SCONS_VARS = \
	CC="$(TARGET_CC_NOCACHE)" \
	CXX="$(TARGET_CXX_NOCACHE)" \
	CFLAGS="$(TARGET_CFLAGS) $(EXTRA_CFLAGS)" \
	CXXFLAGS="$(TARGET_CXXFLAGS) $(EXTRA_CXXFLAGS)" \
	CPPFLAGS="$(TARGET_CPPFLAGS) $(EXTRA_CPPFLAGS)" \
	LDFLAGS="$(TARGET_LDFLAGS) $(EXTRA_LDFLAGS)" \
	DESTDIR="$(PKG_INSTALL_DIR)"

define Build/Configure/Default
	(cd $(PKG_BUILD_DIR); \
		$(SCONS_VARS) \
		scons \
			prefix=/usr \
			$(SCONS_OPTIONS) \
		install \
	)
endef

define Build/Compile
endef