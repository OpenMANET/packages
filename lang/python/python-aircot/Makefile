include $(TOPDIR)/rules.mk

PKG_NAME:=python-aircot
PKG_VERSION:=4.0.2
PKG_RELEASE:=1
PYPI_NAME:=aircot
PKG_HASH:=73429a482dc4051145c62cf6441e81407b03a75f42c5511c52ea689d42e4e5f8
PKG_LICENSE:=Apache-2.0
PKG_LICENSE_FILES:=LICENSE
PKG_MAINTAINER:=info@openmanet.net

include $(TOPDIR)/feeds/packages/lang/python/pypi.mk
include $(INCLUDE_DIR)/package.mk
include $(TOPDIR)/feeds/packages/lang/python/python3-package.mk

define Package/python3-aircot
  SECTION:=lang
  CATEGORY:=Languages
  SUBMENU:=Python
  TITLE:=Aircraft classification for TAK
  URL:=https://github.com/snstac/aircot
  DEPENDS:=+python3
endef

$(eval $(call Py3Package,python3-aircot))
$(eval $(call BuildPackage,python3-aircot))
