#!/usr/bin/env python3
"""Compile the real helper with a GPIO mock; all files are in temporary roots.

Usage: python3 test_spi_reset.py --headers FIRMWARE/staging_dir/target-*/usr/include
Requires a C compiler, libfdt.so.1 and dtc on the host. No physical GPIO access.
"""
import argparse
import os
from pathlib import Path
import subprocess
import tempfile
import time
import unittest

HERE = Path(__file__).resolve().parent
BOARDS = ["raspberrypi,3-model-b", "raspberrypi,model-zero-2-w",
          "raspberrypi,4-compute-module", "raspberrypi,4-model-b"]


def dts(board=BOARDS[0], compatible="morse,mm610x-spi", reset="<&gpio 17 0>",
        marker="openmanet,wm6108-reset;", child_status="okay", parent_status="okay",
        extra="", gpio_compatible="brcm,bcm2835-gpio", cells=2, reg=0):
    return f'''/dts-v1/;
/ {{ compatible = "{board}"; #address-cells = <1>; #size-cells = <1>;
    aliases {{ spi0 = &spi; }};
    gpio: gpio@100 {{ compatible = "{gpio_compatible}"; reg = <0x100 0x100>;
        gpio-controller; #gpio-cells = <{cells}>; }};
    spi: spi@200 {{ compatible = "brcm,bcm2835-spi"; reg = <0x200 0x100>;
        #address-cells = <1>; #size-cells = <0>; status = "{parent_status}";
        radio@0 {{ compatible = "{compatible}"; reg = <{reg}>;
            reset-gpios = {reset}; {marker} status = "{child_status}"; }};
        {extra}
    }};
}};
'''


class ResetTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="wm6108-fixture-")
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        for p in ["tmp", "etc", "sys/firmware", "sys/module",
                  "sys/firmware/devicetree/base/spi@200/radio@0",
                  "sys/firmware/devicetree/base/gpio@100", "sys/bus/gpio/devices/gpiochip42"]:
            (self.root / p).mkdir(parents=True, exist_ok=True)
        (self.root / "etc/wm6108-spi-reset.conf").write_text("enabled=1\n")
        (self.root / "sys/bus/gpio/devices/gpiochip42/of_node").symlink_to(
            self.root / "sys/firmware/devicetree/base/gpio@100")
        self.tree()

    def tree(self, **kw):
        subprocess.run(["dtc", "-q", "-I", "dts", "-O", "dtb", "-o",
                        str(self.root / "sys/firmware/fdt")], input=dts(**kw), text=True, check=True)

    def run_helper(self, fail="", args=("--boot",)):
        return subprocess.run([*RUNNER, str(BINARY), *args], env={**os.environ, "TEST_ROOT": str(self.root),
                              "FAIL_AT": fail}, text=True, capture_output=True, timeout=5)

    def events(self):
        p = self.root / "events"
        return p.read_text().splitlines() if p.exists() else []

    def fresh_attempt(self):
        for p in ["events", "tmp/wm6108-spi-reset.once"]:
            (self.root / p).unlink(missing_ok=True)

    def test_all_boards_and_providers(self):
        for board in BOARDS:
            for gpio in ["brcm,bcm2835-gpio", "brcm,bcm2711-gpio"]:
                with self.subTest(board=board, provider=gpio):
                    self.fresh_attempt()
                    self.tree(board=board, gpio_compatible=gpio)
                    started = time.monotonic()
                    p = self.run_helper()
                    self.assertEqual(p.returncode, 0, p.stdout + p.stderr)
                    self.assertIn("completed", p.stdout)
                    self.assertGreaterEqual(time.monotonic() - started, .15)
                    self.assertEqual(self.events(), ["open", "low:17", "input:17", "release"])

    def test_invalid_profiles(self):
        cases = [dict(board="raspberrypi,5-model-b"), dict(compatible="morse,mm810x-spi"),
                 dict(compatible="morse,mm610x"), dict(compatible="usb"), dict(marker=""),
                 dict(marker="openmanet,wm6108-reset = <1>;"), dict(reset="<&gpio 5 0>"),
                 dict(reset="<&gpio 17 1>"), dict(reset="<999 17 0>"), dict(reset="<&gpio 17>"),
                 dict(cells=3), dict(gpio_compatible="other,gpio"), dict(reg=1),
                 dict(child_status="disabled"), dict(parent_status="disabled"),
                 dict(extra='spidev@0 { compatible = "spidev"; reg = <0>; };'),
                 dict(extra='radio@1 { compatible = "morse,mm610x-spi"; reg = <1>; };')]
        for kw in cases:
            with self.subTest(**kw):
                self.fresh_attempt()
                self.tree(**kw)
                p = self.run_helper()
                self.assertEqual(p.returncode, 0, p.stderr)
                self.assertIn("skipped", p.stdout)
                self.assertEqual(self.events(), [])

    def test_missing_and_truncated_dt(self):
        (self.root / "sys/firmware/fdt").unlink()
        self.assertIn("skipped", self.run_helper().stdout)
        self.fresh_attempt()
        (self.root / "sys/firmware/fdt").write_bytes(b"\xd0\x0d\xfe\xed")
        self.assertIn("skipped", self.run_helper().stdout)
        self.assertEqual(self.events(), [])

    def test_missing_reset_and_alias(self):
        for text in [dts().replace('reset-gpios = <&gpio 17 0>;', ''),
                     dts().replace('spi0 = &spi;', ''),
                     dts().replace('spi0 = &spi;', 'spi0 = &gpio;')]:
            self.fresh_attempt()
            subprocess.run(["dtc", "-q", "-I", "dts", "-O", "dtb", "-o",
                            str(self.root / "sys/firmware/fdt")], input=text, text=True, check=True)
            self.assertIn("skipped", self.run_helper().stdout)
            self.assertEqual(self.events(), [])

    def test_driver_present(self):
        for name in ["mm6108_sdio", "morse"]:
            self.fresh_attempt()
            p = self.root / "sys/module" / name
            p.mkdir()
            self.assertIn("already loaded", self.run_helper().stdout)
            self.assertEqual(self.events(), [])
            p.rmdir()

    def test_provider_missing_or_ambiguous(self):
        p = self.root / "sys/bus/gpio/devices/gpiochip42/of_node"
        p.unlink()
        self.assertIn("provider unavailable", self.run_helper().stdout)
        self.fresh_attempt()
        p.symlink_to(self.root / "sys/firmware/devicetree/base/gpio@100")
        q = self.root / "sys/bus/gpio/devices/gpiochip9"
        q.mkdir()
        (q / "of_node").symlink_to(p.resolve())
        self.assertIn("ambiguous", self.run_helper().stdout)
        self.assertEqual(self.events(), [])

    def test_bound_to_any_driver(self):
        p = self.root / "sys/bus/spi/devices/spi9.0"
        p.mkdir(parents=True)
        (p / "of_node").symlink_to(self.root / "sys/firmware/devicetree/base/spi@200/radio@0")
        (p / "driver").mkdir()
        self.assertIn("target bound", self.run_helper().stdout)
        self.assertEqual(self.events(), [])

    def test_disabled_and_missing_config(self):
        for value in ["enabled=0\n", "enabled=1\nextra", "", "enabled=1"]:
            self.fresh_attempt()
            (self.root / "etc/wm6108-spi-reset.conf").write_text(value)
            self.assertIn("disabled", self.run_helper().stdout)
            self.assertEqual(self.events(), [])
        self.fresh_attempt()
        (self.root / "etc/wm6108-spi-reset.conf").unlink()
        self.assertIn("disabled", self.run_helper().stdout)

    def test_duplicate_and_concurrent(self):
        env = {**os.environ, "TEST_ROOT": str(self.root)}
        a = subprocess.Popen([*RUNNER, str(BINARY), "--boot"], env=env, stdout=subprocess.PIPE, text=True)
        self.addCleanup(lambda: a.poll() is None and a.kill())
        b = self.run_helper()
        out, _ = a.communicate(timeout=5)
        self.assertEqual((out + b.stdout).count("completed"), 1)
        self.assertEqual(self.events().count("low:17"), 1)
        self.assertIn("already attempted", self.run_helper().stdout)

    def test_disabled_attempt_cannot_be_enabled_midboot(self):
        (self.root / "etc/wm6108-spi-reset.conf").write_text("enabled=0\n")
        self.run_helper()
        (self.root / "etc/wm6108-spi-reset.conf").write_text("enabled=1\n")
        self.assertIn("already attempted", self.run_helper().stdout)
        self.assertEqual(self.events(), [])

    def test_errors_and_signal_cleanup(self):
        for failure in ["open", "allocate", "config", "acquire", "input", "signal", "hold", "settle"]:
            with self.subTest(failure=failure):
                self.fresh_attempt()
                p = self.run_helper(fail=failure)
                skipped = failure in ["open", "acquire"]
                self.assertEqual(p.returncode, 0 if skipped else 1, p.stdout + p.stderr)
                self.assertIn("skipped" if skipped else "failed", p.stdout)
                if failure in ["open", "allocate", "config", "acquire"]:
                    self.assertNotIn("low:17", self.events())
                else:
                    self.assertEqual(self.events()[-1], "release")
                if failure == "signal": self.assertIn("input:17", self.events())

    def test_not_a_runtime_command(self):
        self.assertIn("boot-only", self.run_helper(args=()).stdout)
        self.assertEqual(self.events(), [])


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--headers", required=True)
    parser.add_argument("--sanitize", action="store_true")
    parser.add_argument("--cc", default="gcc")
    parser.add_argument("--runner", help="Optional qemu-aarch64-static for an isolated ARM fixture binary")
    parser.add_argument("--libfdt-source", type=Path, help="Compile libfdt sources into a static fixture binary")
    options = parser.parse_args()
    RUNNER = [options.runner] if options.runner else []
    with tempfile.TemporaryDirectory(prefix="wm6108-test-build-") as build:
        BINARY = Path(build) / "reset-test"
        flags = ["-fsanitize=undefined", "-fno-sanitize-recover=all"] if options.sanitize else []
        libraries = ["-Wl,-l:libfdt.so.1"]
        if options.libfdt_source:
            libraries = ["-static"]
            for source in sorted(options.libfdt_source.glob("*.c")):
                obj = Path(build) / (source.stem + ".o")
                subprocess.run([options.cc, "-Os", "-I", str(options.libfdt_source),
                                "-c", str(source), "-o", str(obj)], check=True)
                libraries.append(str(obj))
        subprocess.run([options.cc, "-std=gnu11", "-Wall", "-Wextra", "-Werror", "-g", *flags,
                        "-DUNIT_TESTING", "-I", options.headers, str(HERE.parent / "src/wm6108-spi-reset.c"),
                        str(HERE / "mock-gpiod.c"), *libraries, "-o", str(BINARY)], check=True)
        unittest.main(argv=[__file__], verbosity=2)
