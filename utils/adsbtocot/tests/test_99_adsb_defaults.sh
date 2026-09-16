#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
defaults_script="${script_dir}/../files/99-adsb-defaults"

run_defaults() {
	local current_listener=$1
	declare -ga uci_batches=()
	declare -ga service_calls=()

	uci() {
		[[ "$1" == "-q" ]] && shift
		case "$1" in
		get)
			[[ "$2" == "uhttpd.dump1090.listen_http" ]]
			printf '%s\n' "$current_listener"
			;;
		batch)
			uci_batches+=("$(</dev/stdin)")
			;;
		*)
			printf 'unexpected uci call: %s\n' "$*" >&2
			return 1
			;;
		esac
	}

	service_call() {
		service_calls+=("$1 $2")
	}

	# Replace target-only filesystem/init calls with test doubles.
	# shellcheck disable=SC1090
	source <(sed \
		-e 's|^mkdir -p /var/run/dump1090$|:|' \
		-e 's|^\[ -f /etc/adsbcot/\.defaults_v4_applied \] && exit 0$|:|' \
		-e 's|^touch /etc/adsbcot/\.defaults_v4_applied$|:|' \
		-e 's|/etc/init.d/\([a-z0-9]*\) \([a-z]*\)|service_call \1 \2|g' \
		-e 's/^exit 0$/return 0/' \
		"$defaults_script")
}

assert_contains() {
	local haystack=$1
	local needle=$2
	if [[ "$haystack" != *"$needle"* ]]; then
		printf 'expected to find %q in:\n%s\n' "$needle" "$haystack" >&2
		exit 1
	fi
}

run_defaults '0.0.0.0:8080 [::]:8080'

[[ ${#uci_batches[@]} -eq 2 ]]
assert_contains "${uci_batches[0]}" "set dump1090.main.write_json='/var/run/dump1090'"
assert_contains "${uci_batches[1]}" "set uhttpd.dump1090.listen_http='0.0.0.0:8090 [::]:8090'"

expected_services=(
	'dump1090 enable'
	'adsbcot enable'
	'dump1090 restart'
	'adsbcot restart'
	'uhttpd reload'
)
[[ "${service_calls[*]}" == "${expected_services[*]}" ]]

run_defaults '0.0.0.0:8090 [::]:8090'

[[ ${#uci_batches[@]} -eq 1 ]]
expected_services=(
	'dump1090 enable'
	'adsbcot enable'
	'dump1090 restart'
	'adsbcot restart'
)
[[ "${service_calls[*]}" == "${expected_services[*]}" ]]

if rg -q '/etc/adsbcot/\.defaults_applied([^_]|$)|/etc/init\.d/(adsbcot|dump1090) (stop|disable)' "$defaults_script"; then
	printf 'defaults script still contains the stale guard or disables ADS-B\n' >&2
	exit 1
fi

rg -q '/etc/adsbcot/\.defaults_v4_applied' "$defaults_script"
