// SPDX-License-Identifier: GPL-2.0-only
// Test backend: no device open/ioctl, ever. Link only into UNIT_TESTING builds.
#define _GNU_SOURCE
#include <gpiod.h>
#include <errno.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <time.h>

struct gpiod_chip { int unused; };
struct gpiod_line_settings { int direction, value; bool active_low; };
struct gpiod_line_config { struct gpiod_line_settings settings; unsigned int offset; };
struct gpiod_request_config { int unused; };
struct gpiod_line_request { int unused; };

static int fail(const char *where)
{
	const char *s = getenv("FAIL_AT");
	return s && !strcmp(s, where);
}
static void log_event(const char *event)
{
	char p[4096];
	snprintf(p, sizeof(p), "%s/events", getenv("TEST_ROOT"));
	FILE *f = fopen(p, "a");
	if (!f) abort();
	fprintf(f, "%s\n", event); fclose(f);
}
struct gpiod_chip *gpiod_chip_open(const char *path)
{
	if (strncmp(path, getenv("TEST_ROOT"), strlen(getenv("TEST_ROOT")))) abort();
	log_event("open");
	return fail("open") ? NULL : calloc(1, sizeof(struct gpiod_chip));
}
void gpiod_chip_close(struct gpiod_chip *p) { free(p); }
struct gpiod_line_settings *gpiod_line_settings_new(void) { return fail("allocate") ? NULL : calloc(1, sizeof(struct gpiod_line_settings)); }
void gpiod_line_settings_free(struct gpiod_line_settings *p) { free(p); }
void gpiod_line_settings_set_active_low(struct gpiod_line_settings *p, bool v) { p->active_low = v; }
int gpiod_line_settings_set_direction(struct gpiod_line_settings *p, enum gpiod_line_direction v) { p->direction = v; return 0; }
int gpiod_line_settings_set_output_value(struct gpiod_line_settings *p, enum gpiod_line_value v) { p->value = v; return 0; }
struct gpiod_line_config *gpiod_line_config_new(void) { return calloc(1, sizeof(struct gpiod_line_config)); }
void gpiod_line_config_free(struct gpiod_line_config *p) { free(p); }
int gpiod_line_config_add_line_settings(struct gpiod_line_config *p, const unsigned int *offsets, size_t n, struct gpiod_line_settings *s)
{
	if (n != 1 || *offsets != 17 || s->active_low) abort();
	p->settings = *s; p->offset = *offsets;
	return fail("config") ? -1 : 0;
}
struct gpiod_request_config *gpiod_request_config_new(void) { return calloc(1, sizeof(struct gpiod_request_config)); }
void gpiod_request_config_free(struct gpiod_request_config *p) { free(p); }
void gpiod_request_config_set_consumer(struct gpiod_request_config *p, const char *s) { (void)p; (void)s; }
struct gpiod_line_request *gpiod_chip_request_lines(struct gpiod_chip *chip, struct gpiod_request_config *cfg, struct gpiod_line_config *out)
{
	(void)chip; (void)cfg;
	if (fail("acquire")) { log_event("busy"); return NULL; }
	if (out->settings.direction != GPIOD_LINE_DIRECTION_OUTPUT || out->settings.value != GPIOD_LINE_VALUE_INACTIVE) abort();
	log_event("low:17");
	if (fail("signal")) raise(SIGTERM);
	return calloc(1, sizeof(struct gpiod_line_request));
}
int gpiod_line_request_reconfigure_lines(struct gpiod_line_request *r, struct gpiod_line_config *in)
{
	(void)r;
	if (in->settings.direction != GPIOD_LINE_DIRECTION_INPUT) abort();
	if (fail("input")) { log_event("input-failed"); return -1; }
	log_event("input:17"); return 0;
}
void gpiod_line_request_release(struct gpiod_line_request *p) { log_event("release"); free(p); }

int nanosleep(const struct timespec *req, struct timespec *rem)
{
	if ((req->tv_nsec == 50000000 && fail("hold")) ||
	    (req->tv_nsec == 100000000 && fail("settle"))) { errno = EIO; return -1; }
	int ret = clock_nanosleep(CLOCK_MONOTONIC, 0, req, rem);
	if (ret) { errno = ret; return -1; }
	return 0;
}
