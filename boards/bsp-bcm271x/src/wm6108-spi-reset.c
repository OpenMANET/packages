// SPDX-License-Identifier: GPL-2.0-only
// WM6108/WM1302 pre-probe compatibility pulse. Never manipulate a bus/driver.
#define _GNU_SOURCE
#include <errno.h>
#include <fcntl.h>
#include <glob.h>
#include <gpiod.h>
#include <libfdt.h>
#include <limits.h>
#include <signal.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/file.h>
#include <sys/stat.h>
#include <time.h>
#include <unistd.h>

#define DT_MAX (2 * 1024 * 1024)
#define RESET_LINE 17
static volatile sig_atomic_t interrupted;

// Fixture roots are unavailable in the production executable.
static const char *root(void)
{
#ifdef UNIT_TESTING
	const char *p = getenv("TEST_ROOT");
	if (!p || p[0] != '/') abort();
	return p;
#else
	return "";
#endif
}

static void path(char *out, size_t size, const char *suffix)
{
	if (snprintf(out, size, "%s%s", root(), suffix) >= (int)size) abort();
}

static int result(const char *kind, const char *reason)
{
	printf("wm6108-spi-reset: %s: %s\n", kind, reason);
	return !strcmp(kind, "failed");
}

static bool exists(const char *suffix)
{
	char p[PATH_MAX];
	path(p, sizeof(p), suffix);
	return access(p, F_OK) == 0;
}

static bool enabled_node(const void *dt, int node)
{
	for (; node >= 0; node = fdt_parent_offset(dt, node)) {
		int len;
		const char *s = fdt_getprop(dt, node, "status", &len);
		if (s && !((len == 5 && !memcmp(s, "okay", 5)) ||
		           (len == 3 && !memcmp(s, "ok", 3)))) return false;
	}
	return true;
}

static bool cell_is(const void *dt, int node, const char *name, unsigned int value)
{
	int len;
	const fdt32_t *v = fdt_getprop(dt, node, name, &len);
	return v && len == 4 && fdt32_to_cpu(*v) == value;
}

// Only the four supported Pi base DTs plus the explicit WM6108 wiring opt-in.
static int select_reset(const void *dt, char *provider, char *device)
{
	const char *boards[] = {"raspberrypi,3-model-b", "raspberrypi,model-zero-2-w",
		"raspberrypi,4-compute-module", "raspberrypi,4-model-b"};
	bool board = false;
	for (size_t i = 0; i < sizeof(boards) / sizeof(boards[0]); i++)
		board |= fdt_node_check_compatible(dt, 0, boards[i]) == 0;
	if (!board) return -1;
	int node = -1, selected = -1, count = 0;
	while ((node = fdt_node_offset_by_compatible(dt, node, "morse,mm610x-spi")) >= 0)
		if (enabled_node(dt, node)) { selected = node; count++; }
	if (count != 1) return -1;
	int len, parent = fdt_parent_offset(dt, selected);
	if (!fdt_getprop(dt, selected, "openmanet,wm6108-reset", &len) || len != 0 ||
	    !cell_is(dt, selected, "reg", 0) ||
	    fdt_node_check_compatible(dt, parent, "brcm,bcm2835-spi")) return -1;
	const char *spi0 = fdt_get_alias(dt, "spi0");
	if (!spi0 || fdt_path_offset(dt, spi0) != parent) return -1;
	int sibling;
	fdt_for_each_subnode(sibling, dt, parent)
		if (sibling != selected && enabled_node(dt, sibling)) return -1;
	const fdt32_t *gpio = fdt_getprop(dt, selected, "reset-gpios", &len);
	if (!gpio || len != 12 || fdt32_to_cpu(gpio[1]) != RESET_LINE ||
	    fdt32_to_cpu(gpio[2]) != 0) return -1;
	int gp = fdt_node_offset_by_phandle(dt, fdt32_to_cpu(gpio[0]));
	if (gp < 0 || !enabled_node(dt, gp) || !cell_is(dt, gp, "#gpio-cells", 2) ||
	    !fdt_getprop(dt, gp, "gpio-controller", &len) || len != 0 ||
	    (fdt_node_check_compatible(dt, gp, "brcm,bcm2835-gpio") &&
	     fdt_node_check_compatible(dt, gp, "brcm,bcm2711-gpio"))) return -1;
	if (fdt_get_path(dt, gp, provider, PATH_MAX) ||
	    fdt_get_path(dt, selected, device, PATH_MAX)) return -1;
	return 0;
}

static void *read_dt(void)
{
	char p[PATH_MAX];
	path(p, sizeof(p), "/sys/firmware/fdt");
	FILE *f = fopen(p, "rb");
	if (!f) return NULL;
	void *dt = malloc(DT_MAX);
	if (!dt) { fclose(f); return NULL; }
	size_t n = fread(dt, 1, DT_MAX, f);
	bool bad = ferror(f) || !feof(f);
	fclose(f);
	if (bad || n < sizeof(struct fdt_header) || fdt_check_full(dt, n)) {
		free(dt); return NULL;
	}
	return dt;
}

// Match the controller's OF node, not gpiochip numbering or a global line label.
static int resolve_chip(const char *provider, char *chip)
{
	char p[PATH_MAX], expected[PATH_MAX], resolved[PATH_MAX], suffix[PATH_MAX];
	if (snprintf(suffix, sizeof(suffix), "/sys/firmware/devicetree/base%s", provider) >= (int)sizeof(suffix)) return -1;
	path(p, sizeof(p), suffix);
	if (!realpath(p, expected)) return -1;
	path(p, sizeof(p), "/sys/bus/gpio/devices/gpiochip*/of_node");
	glob_t g = {0};
	int count = 0;
	if (glob(p, 0, NULL, &g)) { globfree(&g); return -1; }
	for (size_t i = 0; i < g.gl_pathc; i++) {
		if (!realpath(g.gl_pathv[i], resolved) || strcmp(resolved, expected)) continue;
		char name[PATH_MAX];
		snprintf(name, sizeof(name), "%s", g.gl_pathv[i]);
		*strrchr(name, '/') = '\0';
		const char *base = strrchr(name, '/') + 1;
		if (snprintf(suffix, sizeof(suffix), "/dev/%s", base) >= (int)sizeof(suffix)) continue;
		path(chip, PATH_MAX, suffix);
		count++;
	}
	globfree(&g);
	return count == 1 ? 0 : -1;
}

static bool driver_present(void)
{
	return exists("/sys/module/mm6108_sdio") || exists("/sys/module/morse") ||
	       exists("/sys/bus/spi/drivers/morse_spi");
}

static bool target_bound(const char *device)
{
	char p[PATH_MAX], expected[PATH_MAX], resolved[PATH_MAX], suffix[PATH_MAX];
	if (snprintf(suffix, sizeof(suffix), "/sys/firmware/devicetree/base%s", device) >= (int)sizeof(suffix)) return true;
	path(p, sizeof(p), suffix);
	// The live OF node must exist even if the SPI bus has not been registered.
	if (!realpath(p, expected)) return true;
	path(p, sizeof(p), "/sys/bus/spi/devices/*/of_node");
	glob_t g = {0};
	int ret = glob(p, 0, NULL, &g);
	if (ret) { globfree(&g); return ret != GLOB_NOMATCH; }
	bool bound = false;
	for (size_t i = 0; i < g.gl_pathc; i++) {
		if (!realpath(g.gl_pathv[i], resolved) || strcmp(resolved, expected)) continue;
		snprintf(p, sizeof(p), "%s", g.gl_pathv[i]);
		char *leaf = strrchr(p, '/') + 1;
		memcpy(leaf, "driver", 7); // shorter than of_node
		if (access(p, F_OK) == 0) bound = true;
	}
	globfree(&g);
	return bound;
}

static void on_signal(int sig) { interrupted = sig; }

static int delay_ms(long ms)
{
	struct timespec t = {.tv_sec = 0, .tv_nsec = ms * 1000000};
	while (nanosleep(&t, &t)) {
		if (errno != EINTR || interrupted) return -1;
	}
	return interrupted ? -1 : 0;
}

static int pulse(const char *device, const char *of_device)
{
	unsigned int offset = RESET_LINE;
	int rc = -1;
	struct gpiod_chip *chip = gpiod_chip_open(device);
	struct gpiod_line_settings *s = gpiod_line_settings_new();
	struct gpiod_line_config *out = gpiod_line_config_new();
	struct gpiod_line_config *in = gpiod_line_config_new();
	struct gpiod_request_config *cfg = gpiod_request_config_new();
	struct gpiod_line_request *request = NULL;
	if (!chip) { rc = 1; goto done; }
	if (!s || !out || !in || !cfg) goto done;
	// Prepare both configurations before asserting reset, so allocation failure
	// cannot strand it low. Values are physical: active-low is explicitly false.
	gpiod_line_settings_set_active_low(s, false);
	if (gpiod_line_settings_set_direction(s, GPIOD_LINE_DIRECTION_OUTPUT) ||
	    gpiod_line_settings_set_output_value(s, GPIOD_LINE_VALUE_INACTIVE) ||
	    gpiod_line_config_add_line_settings(out, &offset, 1, s) ||
	    gpiod_line_settings_set_direction(s, GPIOD_LINE_DIRECTION_INPUT) ||
	    gpiod_line_config_add_line_settings(in, &offset, 1, s)) goto done;
	gpiod_request_config_set_consumer(cfg, "wm6108-boot-reset");
	if (driver_present() || target_bound(of_device)) { rc = 1; goto done; }
	if (interrupted) goto done;
	request = gpiod_chip_request_lines(chip, cfg, out);
	if (!request) {
		if (errno == EBUSY) rc = 1; // Ownership is never overridden.
		goto done;
	}
	int held = delay_ms(50);
	int released = gpiod_line_request_reconfigure_lines(request, in);
	if (released) {
		// One best-effort cleanup attempt on the same line request, no new pulse.
		(void)gpiod_line_request_reconfigure_lines(request, in);
	}
	gpiod_line_request_release(request);
	request = NULL;
	if (held || released || delay_ms(100)) goto done;
	rc = 0;
done:
	if (request) gpiod_line_request_release(request);
	if (cfg) gpiod_request_config_free(cfg);
	if (in) gpiod_line_config_free(in);
	if (out) gpiod_line_config_free(out);
	if (s) gpiod_line_settings_free(s);
	if (chip) gpiod_chip_close(chip);
	return rc;
}

int main(int argc, char **argv)
{
	if (argc != 2 || strcmp(argv[1], "--boot"))
		return result("skipped", "boot-only helper");
	char p[PATH_MAX];
	path(p, sizeof(p), "/tmp/wm6108-spi-reset.once");
	int lock = open(p, O_RDWR | O_CREAT | O_NOFOLLOW | O_CLOEXEC, 0600);
	struct stat st;
	if (lock < 0) return result("skipped", "cannot acquire boot guard");
	if (flock(lock, LOCK_EX | LOCK_NB) || fstat(lock, &st) || !S_ISREG(st.st_mode) || st.st_size) {
		close(lock); return result("skipped", "already attempted or boot guard unavailable");
	}
	// Mark even a disabled/skipped attempt: enabling later cannot pulse this boot.
	if (write(lock, "1", 1) != 1) { close(lock); return result("failed", "boot guard write"); }
	path(p, sizeof(p), "/etc/wm6108-spi-reset.conf");
	FILE *f = fopen(p, "r");
	char config[32] = {0};
	if (f) { size_t n = fread(config, 1, sizeof(config) - 1, f); config[n] = 0; fclose(f); }
	if (strcmp(config, "enabled=1\n")) return result("skipped", "disabled (hardware validation pending)");
	if (driver_present()) return result("skipped", "SPI driver already loaded or probing");
	void *dt = read_dt();
	if (!dt) return result("skipped", "device tree unavailable or invalid");
	char provider[PATH_MAX], device[PATH_MAX], chip[PATH_MAX];
	int selected = select_reset(dt, provider, device);
	free(dt);
	if (selected) return result("skipped", "not an unambiguous opted-in WM6108 SPI profile");
	if (target_bound(device)) return result("skipped", "SPI target bound or live node unavailable");
	if (resolve_chip(provider, chip)) return result("skipped", "GPIO provider unavailable or ambiguous");
	struct sigaction sa = {.sa_handler = on_signal};
	sigemptyset(&sa.sa_mask);
	if (sigaction(SIGTERM, &sa, NULL) || sigaction(SIGINT, &sa, NULL) || sigaction(SIGHUP, &sa, NULL))
		return result("failed", "cannot install signal cleanup");
	int pulsed = pulse(chip, device);
	if (pulsed > 0) return result("skipped", "GPIO unavailable/busy or SPI driver became active");
	if (pulsed < 0) return result("failed", "GPIO pulse/cleanup failed; no bus recovery attempted");
	printf("wm6108-spi-reset: completed: %s GPIO%u (low then input)\n", device, RESET_LINE);
	return 0;
}
