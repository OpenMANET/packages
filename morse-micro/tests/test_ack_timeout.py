#!/usr/bin/env python3
"""Compile actual patched driver functions against a simulated firmware transport.

Usage: python3 test_ack_timeout.py /path/to/patched/driver
This checks host policy; it cannot establish firmware timing or RF behavior.
"""
import pathlib
import subprocess
import sys
import tempfile

source = (pathlib.Path(sys.argv[1]) / 'command.c').read_text()

def function(name):
    start = source.index('int ' + name + '(')
    body = source.index('{', start)
    depth = 1
    end = body + 1
    while depth:
        depth += (source[end] == '{') - (source[end] == '}')
        end += 1
    return source[start:end]

post = source[source.index('static void morse_cmd_vendor_postprocess('):]
post = post[post.index('case MORSE_CMD_ID_GET_SET_GENERIC_PARAM:'):]
post = post[post.index('{'):post.index('\n\t\tbreak;')]
harness = r'''
#include <assert.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
typedef uint32_t u32;
typedef uint16_t u16;
typedef uint8_t u8;
typedef int32_t s32;
struct morse { int64_t extra_ack_timeout_us; u32 configured_ack_timeout_us;
 bool configured_ack_timeout_valid; int lock; bool in_scan; };
struct hdr { int unused; };
struct morse_cmd_req { struct hdr hdr; };
struct morse_cmd_resp { int unused; };
struct morse_cmd_req_get_set_generic_param { struct hdr hdr; u32 param_id, action, value, flags; };
struct morse_cmd_resp_get_set_generic_param { u32 value; };
struct morse_cmd_req_set_channel { struct hdr hdr; u32 op_chan_freq_hz;
 u8 op_bw_mhz, pri_bw_mhz, pri_1mhz_chan_idx, dot11_mode, is_off_channel; };
struct morse_cmd_resp_set_channel { u32 power_qdbm; };
#define MORSE_CMD_ID_GET_SET_GENERIC_PARAM 1
#define MORSE_CMD_PARAM_ID_EXTRA_ACK_TIMEOUT_ADJUST_US 1
#define MORSE_CMD_PARAM_ACTION_SET 1
#define MORSE_CMD_PARAM_ACTION_GET 0
#define MORSE_CMD_ID_SET_CHANNEL 2
#define MORSE_CMD_DOT11_PROTO_MODE_AH 0
#define QDBM_TO_MBM(x) (x)
#define cpu_to_le32(x) (x)
#define le32_to_cpu(x) (x)
#define max(a,b) ((a) > (b) ? (a) : (b))
#define lockdep_assert_held(x) ((void)0)
#define MORSE_ERR(...) ((void)0)
#define MORSE_INFO(...) ((void)0)
static int command_id, calls, set_error, channel_error;
static u32 firmware_value;
static void morse_cmd_init(struct morse *m, struct hdr *h, int id, int vif, int size)
{ (void)m; (void)h; (void)vif; (void)size; command_id = id; }
static int morse_cmd_tx(struct morse *m, struct morse_cmd_resp *resp,
 struct morse_cmd_req *req, u32 length, u32 timeout, const char *func)
{
 (void)m; (void)length; (void)timeout; (void)func; ++calls;
 if (command_id == MORSE_CMD_ID_SET_CHANNEL) {
  if (channel_error) return channel_error;
  firmware_value = 60; /* Reproduce the reported firmware reset. */
  ((struct morse_cmd_resp_set_channel *)resp)->power_qdbm = 10;
  return 0;
 }
 if (set_error) return set_error;
 firmware_value = ((struct morse_cmd_req_get_set_generic_param *)req)->value;
 return 0;
}
int morse_cmd_restore_ack_timeout(struct morse *mors);
'''
harness += function('morse_cmd_ack_timeout_adjust') + '\n'
harness += function('morse_cmd_restore_ack_timeout') + '\n'
harness += function('morse_cmd_set_channel') + '\n'
harness += '''static void postprocess(struct morse *mors,
 const struct morse_cmd_req_get_set_generic_param *req,
 struct morse_cmd_resp_get_set_generic_param *resp)\n''' + post + '\n'
harness += r'''
static void user_set(struct morse *m, u32 value) {
 struct morse_cmd_req_get_set_generic_param req = {.param_id=1, .action=1, .value=value};
 struct morse_cmd_resp_get_set_generic_param resp = {0};
 postprocess(m, &req, &resp);
}
int main(void) {
 struct morse m = {0}; s32 power; int before;
 assert(!morse_cmd_restore_ack_timeout(&m) && calls == 0);
 user_set(&m, 180);
 assert(!morse_cmd_set_channel(&m, 900000000, 0, 1, 1, 0, &power));
 assert(calls == 2 && firmware_value == 180);
 /* Reading a reset firmware value must not replace the saved SET. */
 struct morse_cmd_req_get_set_generic_param get = {.param_id=1, .action=0};
 struct morse_cmd_resp_get_set_generic_param resp = {.value=60};
 postprocess(&m, &get, &resp);
 assert(m.extra_ack_timeout_us == 60 && m.configured_ack_timeout_us == 180);
 m.extra_ack_timeout_us = -1; /* Firmware reload clears observed state only. */
 assert(!morse_cmd_restore_ack_timeout(&m) && firmware_value == 180);
 user_set(&m, 2000);
 assert(!morse_cmd_ack_timeout_adjust(&m, 0, 1000) && firmware_value == 2000);
 user_set(&m, 180);
 assert(!morse_cmd_ack_timeout_adjust(&m, 0, 1000) && firmware_value == 1000);
 /* Explicit zero and the full unsigned range remain valid SET values. */
 user_set(&m, 0);
 assert(!morse_cmd_restore_ack_timeout(&m) && firmware_value == 0);
 user_set(&m, UINT32_MAX);
 assert(!morse_cmd_restore_ack_timeout(&m) && firmware_value == UINT32_MAX);
 assert(m.extra_ack_timeout_us == UINT32_MAX);
 user_set(&m, 180); set_error = -5;
 assert(morse_cmd_ack_timeout_adjust(&m, 0, 1000) == -5);
 assert(m.configured_ack_timeout_us == 180);
 assert(morse_cmd_set_channel(&m, 900000000, 0, 1, 1, 0, &power) == -5);
 set_error = 0; channel_error = -22; before = calls;
 assert(morse_cmd_set_channel(&m, 900000000, 0, 1, 1, 0, &power) == -22);
 assert(calls == before + 1); /* Never replay after a failed channel change. */
 puts("ACK persistence: channel reset, GET, recovery state, compatibility floor, zero, UINT32_MAX and errors passed");
}
'''
with tempfile.TemporaryDirectory() as tmp:
    c = pathlib.Path(tmp) / 'test.c'
    exe = pathlib.Path(tmp) / 'test'
    c.write_text(harness)
    subprocess.run(['cc', '-std=c11', '-Wall', '-Wextra', '-Werror', str(c), '-o', str(exe)], check=True)
    subprocess.run([str(exe)], check=True)
