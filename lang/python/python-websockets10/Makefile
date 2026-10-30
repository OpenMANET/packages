include $(TOPDIR)/rules.mk

PKG_NAME:=python-websockets10
PKG_VERSION:=10.4
PKG_RELEASE:=1
PYPI_NAME:=websockets
PKG_HASH:=eef610b23933c54d5d921c92578ae5f89813438fded840c2e9809d378dc765d3
PKG_LICENSE:=BSD-3-Clause
PKG_LICENSE_FILES:=LICENSE
PKG_MAINTAINER:=info@openmanet.net

include $(TOPDIR)/feeds/packages/lang/python/pypi.mk
include $(INCLUDE_DIR)/package.mk
include $(TOPDIR)/feeds/packages/lang/python/python3-package.mk

define Package/python3-websockets10
  SECTION:=lang
  CATEGORY:=Languages
  SUBMENU:=Python
  TITLE:=WebSocket protocol library (ADSBCOT compatible)
  URL:=https://github.com/python-websockets/websockets
  DEPENDS:=+python3
  CONFLICTS:=python3-websockets
endef

$(eval $(call Py3Package,python3-websockets10))
$(eval $(call BuildPackage,python3-websockets10))
