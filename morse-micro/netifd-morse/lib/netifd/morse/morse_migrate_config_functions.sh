find_last_s1g_device() {
	local s1g_device
	_find_last_s1g_device() {
		local device="$1"
		local band

		config_get band "$device" band

		[ "$band" = "s1g" ] && s1g_device=$device
	}

	config_foreach _find_last_s1g_device wifi-device
	echo "$s1g_device"
}

find_last_native_s1g_device() {
	local native_s1g_device
	_find_last_native_s1g_device() {
		local device="$1"
		local type
		local band

		config_get type "$device" type
		config_get band "$device" band

		[ "$type" = "mac80211" ] && [ "$band" = "s1g" ] && native_s1g_device=$device
	}

	config_foreach _find_last_native_s1g_device wifi-device
	echo "$native_s1g_device"
}

find_last_morse_device() {
	local morse_device
	_find_last_morse_device() {
		local device="$1"
		local type

		config_get type "$device" type

		[ "$type" = "morse" ] && morse_device=$device
	}

	config_foreach _find_last_morse_device wifi-device
	echo "$morse_device"
}

find_last_iface_for_device() {
	local target_device="$1"
	local target_iface
	_find_last_iface_for_device() {
		local iface="$1"
		local device

		config_get device "$iface" device
		[ "$device" = "$target_device" ] && target_iface=$iface
	}

	config_foreach _find_last_iface_for_device wifi-iface
	echo "$target_iface"
}

set_src_dest() {
	local src_type=$1
	local dest_type=$2

	eval "src_device=\${${src_type}_device}"
	eval "src_iface=\${${src_type}_iface}"
	eval "dest_device=\${${dest_type}_device}"
	eval "dest_iface=\${${dest_type}_iface}"
}

# Find the direction of migration (morse -> mm81x or vice versa) and writes to the src and dest
# devices/interfaces variables accordingly
find_src_dest_configs() {
	config_load wireless

	# Get the native s1g device and interface
	local native_s1g_device native_s1g_iface
	native_s1g_device="$(find_last_native_s1g_device)"
	native_s1g_iface="$(find_last_iface_for_device "$native_s1g_device")"

	# Get the morse device and interface
	local morse_device morse_iface
	morse_device="$(find_last_morse_device)"
	morse_iface="$(find_last_iface_for_device "$morse_device")"

	# Whichever UCI device doesn't have a path is the source device and vice versa
	local morse_path native_s1g_path
	config_get morse_path "$morse_device" path
	config_get native_s1g_path "$native_s1g_device" path

	if [ -z "$morse_path" ]; then
		set_src_dest morse native_s1g
	elif [ -z "$native_s1g_path" ]; then
		set_src_dest native_s1g morse
	fi
}

# Returns true if in UCI there is a:
#   - (type=morse) device
#   - (type=mac80211 && band=s1g) device
#   - Only one of them has a path missing
is_migrating() {
	config_load wireless

	local section section_type
	local type band path
	local morse_device native_s1g_device

	for section in $CONFIG_SECTIONS; do
		config_get section_type "$section" TYPE
		[ "$section_type" = "wifi-device" ] || continue

		config_get type "$section" type
		config_get band "$section" band
		config_get path "$section" path

		if [ "$type" = "morse" ]; then
			[ -z "$morse_device" ] && morse_device=$section
			[ -z "$path" ] && morse_device=$section
		fi
		if [ "$type" = "mac80211" ] && [ "$band" = "s1g" ]; then
			[ -z "$native_s1g_device" ] && native_s1g_device=$section
			[ -z "$path" ] && native_s1g_device=$section
		fi
	done

	if [ -n "$morse_device" ] && [ -n "$native_s1g_device" ]; then
		local morse_path native_s1g_path
		config_get morse_path "$morse_device" path
		config_get native_s1g_path "$native_s1g_device" path

		if { [ -n "$morse_path" ] && [ -z "$native_s1g_path" ]; } || \
		   { [ -z "$morse_path" ] && [ -n "$native_s1g_path" ]; }; then
			return 0
		fi
	fi

	return 1
}
