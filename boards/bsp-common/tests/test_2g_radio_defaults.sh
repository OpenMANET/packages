#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
defaults_script="${script_dir}/../files/uci-defaults/97_2g_radio_defaults"

declare -A bands=(
	[radio_2g_a]=2g
	[radio_5g]=5g
	[radio_s1g]=s1g
	[radio_2g_b]=2g
)
declare -a uci_calls=()

config_load() {
	[[ "$1" == "wireless" ]]
}

config_get() {
	local output_var=$1
	local section=$2
	local option=$3

	[[ "$option" == "band" ]]
	printf -v "$output_var" '%s' "${bands[$section]}"
}

config_foreach() {
	local callback=$1
	local section_type=$2

	[[ "$section_type" == "wifi-device" ]]
	for section in radio_2g_a radio_5g radio_s1g radio_2g_b; do
		"$callback" "$section"
	done
}

uci() {
	[[ "$1" == "-q" ]] && shift
	uci_calls+=("$*")
}

# Replace the target-only helper import and terminal exit so the production
# script can run against the lightweight UCI mock above.
# shellcheck disable=SC1090
source <(sed \
	-e 's|^\. /lib/functions\.sh$|:|' \
	-e 's/^exit 0$/return 0/' \
	"$defaults_script")

expected_calls=(
	'set wireless.radio_2g_a.channel=6'
	'set wireless.radio_2g_b.channel=6'
	'commit wireless'
)

if [[ "${uci_calls[*]}" != "${expected_calls[*]}" ]]; then
	printf 'unexpected UCI calls:\n' >&2
	printf '  %s\n' "${uci_calls[@]}" >&2
	exit 1
fi
