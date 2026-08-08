kill_wait()
{
	local names=$*
	local count=3

	for pid in $(pidof $names)
	do
		kill $pid &> /dev/null
	done

	while pidof $names &> /dev/null;
	do
		sleep 1
		let "count--"
		if [ $count -eq 0 ]
		then
			echo "$names failed to terminate normally, force quitting" >&2
			kill -9 $(pidof $names)
			return 1
		fi
	done
	return 0
}

_list_phy_interfaces() {
	local phy="$1"
	if [ -d "/sys/class/ieee80211/${phy}/device/net" ]; then
		ls "/sys/class/ieee80211/${phy}/device/net" 2>/dev/null;
	else
		ls "/sys/class/ieee80211/${phy}/device" 2>/dev/null | grep net: | sed -e 's,net:,,g'
	fi
}

list_phy_interfaces() {
	local phy="$1"

	for dev in $(_list_phy_interfaces "$phy"); do
		readlink "/sys/class/net/${dev}/phy80211" | grep -q "/${phy}\$" || continue
	done
}

# Get regulatory info.
# Country is required, remaining args are optional.
# If channel is unset, it will choose a high bandwidth channel.
# If channel is auto, it will choose the maximum available bandwidth if bandwidth
# is not provided.
# Sets "$country", "$channel", "$s1g_chanbw", and "$op_class".
# "$center_freq" is also set if channel is not auto.
_get_regulatory() {
	country=$1
	channel=$2
	s1g_chanbw=$3
	op_class=$4
	s1g_chzn=$5

	local cc; local bw; local l_op; local g_op; local freq
	local remainder

	if [ -z "$country" ]; then
		return 2
	fi

	# Setting auto_channel allows _get_regulatory to operate independent of netifd wireless scripts.
	if [ -z "$auto_channel" ]; then
		case "$channel" in
			""|0|auto)
				auto_channel=1 ;;
			[0-9]*)
				auto_channel=0 ;;
			*)
				return 2 ;;
		esac
	fi

	# Choose the maximum possible bandwidth if no bw set and auto
	# (NB if no channel is set, auto_channel is 1).
	if [ "$auto_channel" -gt 0 -a -z "$s1g_chanbw" ]; then
		s1g_chanbw="$(awk -F, '$1==country && (!$2 || (!chzn && $3 == "True") || $2 ~ ("(^|;)" chzn "(;|$)")) && $4 > max {max=$4} END {print max}' \
			chzn="$s1g_chzn" country="$country" /usr/share/morse-regdb/channels.csv)"
	fi

	oIFS=$IFS
	HEADER=1
	while IFS=, read -r cc chzn default_chzn bw ch l_op g_op freq remainder; do
		if [ "$HEADER" = 1 ]; then
			HEADER=0
			continue
		fi

		if [ "$cc" != "$country" ]; then
			continue
		fi

		if [ -n "$chzn" ]; then
			if [ -n "$s1g_chzn" ]; then
				case "$chzn" in
				"$s1g_chzn"|"$s1g_chzn;"*|*";$s1g_chzn"|*";$s1g_chzn;"*)
					;;
				*)
					continue
					;;
				esac
			elif [ "$default_chzn" != True ]; then
				continue
			fi
		fi

		if [ -n "$s1g_chanbw" -a "$bw" != "$s1g_chanbw" ]; then
			continue
		fi

		if [ -n "$op_class" ] && ! [ "$l_op" = "$op_class" -o "$g_op" = "$op_class" ]; then
			continue
		fi

		if [ "$auto_channel" -gt 0 -o "$channel" = "$ch" ]; then
			s1g_chanbw=$bw

			# If an auto channel is selected here, we use the op_class to restrict
			# to the right bandwidth. Oddly, hostapd_s1g (ACS) and smart_manager (DCS)
			# appear to not respect this op_class completely, but do use it to determine
			# the bandwidth.
			if [ -z "$op_class" ]; then
				op_class="$g_op"
			fi

			if [ "$auto_channel" -eq 0 ]; then
				channel=$ch
				s1g_chanbw=$bw
				center_freq=$freq
			fi

			IFS=$oIFS
			return 0
		fi
	done < /usr/share/morse-regdb/channels.csv

	IFS=$oIFS
	return 1
}


morse_find_ifname()
{
	for file in "/sys/class/net/wlan"*;
	do
		if [ -d "$file"/device/morse ]
		then
			ifname=$(basename $file)
			break
		fi
	done
}
