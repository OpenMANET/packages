include $(TOPDIR)/rules.mk

PKG_NAME:=python-pyrtlsdr
PKG_VERSION:=0.3.0
PKG_RELEASE:=1
PYPI_NAME:=pyrtlsdr
PKG_HASH:=fb3e583ba073b861e8e0bc5e62f66f07365e9147f5d36491de4ad62f23e45362
PKG_LICENSE:=GPL-3.0-or-later
PKG_MAINTAINER:=info@openmanet.net

include $(TOPDIR)/feeds/packages/lang/python/pypi.mk
include $(INCLUDE_DIR)/package.mk
include $(TOPDIR)/feeds/packages/lang/python/python3-package.mk

define Package/python3-pyrtlsdr
  SECTION:=lang
  CATEGORY:=Languages
  SUBMENU:=Python
  TITLE:=Python bindings for RTL-SDR
  URL:=https://pypi.org/project/pyrtlsdr/
  DEPENDS:=+python3 +python3-numpy +librtlsdr
endef

$(eval $(call Py3Package,python3-pyrtlsdr))
$(eval $(call BuildPackage,python3-pyrtlsdr))
