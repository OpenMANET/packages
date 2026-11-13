include $(TOPDIR)/rules.mk

PKG_NAME:=python-pytak
PKG_VERSION:=7.6.1
PKG_RELEASE:=1
PYPI_NAME:=pytak
PKG_HASH:=9dc7ac271f932ac18585ebcc5d30441c707f5d68d97c0d1408db7695fb7498db
PKG_LICENSE:=Apache-2.0
PKG_LICENSE_FILES:=LICENSE
PKG_MAINTAINER:=info@openmanet.net

include $(TOPDIR)/feeds/packages/lang/python/pypi.mk
include $(INCLUDE_DIR)/package.mk
include $(TOPDIR)/feeds/packages/lang/python/python3-package.mk

define Package/python3-pytak
  SECTION:=lang
  CATEGORY:=Languages
  SUBMENU:=Python
  TITLE:=Python Team Awareness Kit interface
  URL:=https://pypi.org/project/pytak/
  DEPENDS:=+python3 +python3-aiohttp
endef

$(eval $(call Py3Package,python3-pytak))
$(eval $(call BuildPackage,python3-pytak))
