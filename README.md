OpenMANET packages feed
Description
This is the OpenMANET OpenWrt "packages"-feed containing community-maintained build scripts, options and patches for applications, modules and libraries used within OpenWrt.

Installation of pre-built packages is handled directly by the opkg utility within your running OpenWrt system or by using the OpenWrt SDK on a build system.

Usage
This repository is intended to be layered on-top of an OpenWrt buildroot. If you do not have an OpenWrt buildroot installed, see the documentation at: OpenWrt Buildroot – Installation on the OpenWrt support site.

This feed is enabled by default. To install all its package definitions, run:

./scripts/feeds update packages
./scripts/feeds install -a -p packages
