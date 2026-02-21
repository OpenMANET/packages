include $(TOPDIR)/rules.mk

PKG_NAME:=libcamera
PKG_RELEASE:=$(COMMITCOUNT)

PKG_SOURCE_PROTO:=git
PKG_SOURCE_URL:=https://git.libcamera.org/libcamera/libcamera.git
PKG_SOURCE_VERSION:=v0.1.0
PKG_MIRROR_HASH:=de6511b2e494d54fb4432eeb3d4d1644133b5c14305aeb1f97e8e1d67d043611

PKG_VERSION:=$(PKG_SOURCE_VERSION)
PKG_LICENSE:=LGPL-2.1-or-later
PKG_LICENSE_FILES:=COPYING.rst

# This will add the right location to the build to find NLS things (like libintl).
# Without this, if BUILD_NLS is on meson will detect that -lintl should be there
# but not have its correct path.
include $(INCLUDE_DIR)/nls.mk

PKG_BUILD_DEPENDS:=python3/host python-ply/host

# We include the Python mk files so we can install the host dependencies, but we're
# not building a Python package here.
PYTHON3_PKG_BUILD:=0
HOST_PYTHON3_PACKAGE_BUILD_DEPENDS:=./pyyaml.txt ./jinja2.txt
include $(TOPDIR)/feeds/packages/lang/python/pypi.mk
include $(INCLUDE_DIR)/host-build.mk
include $(INCLUDE_DIR)/package.mk
include $(INCLUDE_DIR)/meson.mk
include $(TOPDIR)/feeds/packages/lang/python/python3-package.mk

# If we strip the libraries, libcamera can't seem to correctly dynamically load
# the ipa files for specific devices. Not sure how to solve this, and since
# we're only running this on RPI4s for the moment I'm ok with not stripping.
RSTRIP:=:
STRIP:=:

# Most of these are set to auto, which leads to frustratingly random behaviour
# if things exist in the root filesystem already (and then OpenWrt complains
# that we used a dependency we didn't link against). We could work around this
# by detecting the dependencies below and changing DEPENDS, but for more
# predictability let's be explicit about what we want.
MESON_ARGS += \
  -Ddocumentation=disabled \
  -Dgstreamer=disabled \
  -Dlc-compliance=disabled \
  -Dqcam=disabled \
  -Dtracing=disabled \
  -Dudev=disabled \
  -Dcam=$(if $(CONFIG_PACKAGE_libcamera-utils),enabled,disabled)

define Package/libcamera
  SECTION:=libs
  CATEGORY:=Libraries
  TITLE:=A complex camera support library
  URL:=https://libcamera.org
  # libcamera's meson config has the frustrating habit of enabling things if it can find the library.
  # Conversely, OpenWrt checks that any linking is to a valid dependency.
  # However, if there's a dirty build, these things will be found anyway,
  # causing breakage.
  # Theoretically, libdw/libunwind are also optional, but:
  #  - even on clean builds, it seems like libdw's package (elfutils) can sometimes be built,
  #    and unfortunately the InstallDev part of elfutils installs all its libraries into staging
  #    (i.e. if you select libasm, you get the libdw library in your staging directory)
  #  - libunwind has some complex dependency information that ends up causing a recursive
  #    dependency in camera-onvif-server
  DEPENDS:=+libstdcpp +libyaml +libdw +libunwind $(INTL_DEPENDS) +PACKAGE_libopenssl:libopenssl +PACKAGE_libgnutls:libgnutls
endef

define Package/libcamera/description
  libcamera is an open source camera stack for many platforms with a core userspace library, and support from the Linux kernel APIs and drivers already in place. It aims to control the complexity of embedded camera hardware by providing an intuitive API and method of separating untrusted vendor code from the open source core.

  If you want to have IPA module signing, which will speed things up, you must enable either libopenssl or libgnutls.
  If you include libgnutls/libopenssl then turn them off, dirty builds may fail (due to detecting the old
  libgnutls still installed in staging location).
endef

define Package/libcamera-utils
  SECTION:=utils
  CATEGORY:=Utilities
  TITLE:=Utilities for libcamera
  URL:=https://libcamera.org
  DEPENDS:=+libcamera +libevent2 +libevent2-pthreads
endef

define Package/libcamera-utils/description
  Utilities that come along with libcamera. Currently this is only the 'cam' utility.
endef

define Build/Configure
	# Because we're not actually a Python package, we need to manually call
    # the build depends before the Meson configure runs.
	$(call Py3Build/InstallBuildDepends)
	$(call Build/Configure/Meson)
endef

define Build/InstallDev
	$(INSTALL_DIR) $(1)/usr/include/libcamera
	$(CP) $(PKG_INSTALL_DIR)/usr/include/libcamera/* $(1)/usr/include/libcamera
	$(INSTALL_DIR) $(1)/usr/lib
	$(CP) $(PKG_INSTALL_DIR)/usr/lib/* $(1)/usr/lib
endef

define Package/libcamera/install
	$(INSTALL_DIR) $(1)/usr/lib
	$(CP) $(PKG_INSTALL_DIR)/usr/lib/libcamera*.so* $(1)/usr/lib
	$(INSTALL_DIR) $(1)/usr/lib/libcamera
	$(CP) $(PKG_INSTALL_DIR)/usr/lib/libcamera/*.so* $(1)/usr/lib/libcamera
	$(INSTALL_DIR) $(1)/usr/share/libcamera
	$(CP) $(PKG_INSTALL_DIR)/usr/share/libcamera/* $(1)/usr/share/libcamera
endef

define Package/libcamera-utils/install
	$(INSTALL_DIR) $(1)/usr/bin
	$(CP) $(PKG_INSTALL_DIR)/usr/bin/cam $(1)/usr/bin
endef


$(eval $(call HostBuild))
$(eval $(call BuildPackage,libcamera))
$(eval $(call BuildPackage,libcamera-utils))
