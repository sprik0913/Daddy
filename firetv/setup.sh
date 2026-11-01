#!/usr/bin/env bash
# Mac / Linux. Needs adb (Android platform-tools).
#
#   ./setup.sh                    install Sprik Home + debloat + speed tweaks + Home button
#   ./setup.sh extra noupdates    run extra steps (see firetv.sh for the list)
#   ./setup.sh restore            undo everything
#
# Set TV_IP if your Fire TV's address changes:  TV_IP=192.168.1.50 ./setup.sh

set -e
TV_IP="${TV_IP:-192.168.1.175}"
TV="$TV_IP:5555"
HERE="$(cd "$(dirname "$0")" && pwd)"
APK="$HERE/../dist/SprikHome.apk"

command -v adb >/dev/null || { echo "adb not found. Install Android platform-tools first (see README)."; exit 1; }

echo "Connecting to Fire TV at $TV ..."
adb connect "$TV" >/dev/null
echo "If the TV shows 'Allow USB debugging?', pick 'Always allow' and OK."
for i in $(seq 1 60); do
  state=$(adb -s "$TV" get-state 2>/dev/null || true)
  [ "$state" = "device" ] && break
  sleep 1
  [ "$i" = 15 ] && adb connect "$TV" >/dev/null
done
[ "$state" = "device" ] || { echo "Couldn't connect. Check the IP and that ADB debugging is on."; exit 1; }
echo "Connected."

if [ $# -eq 0 ] || [ "$1" = "all" ]; then
  echo "Installing Sprik Home ..."
  adb -s "$TV" install -r "$APK"
fi

adb -s "$TV" push "$HERE/firetv.sh" /data/local/tmp/firetv.sh >/dev/null
adb -s "$TV" shell sh /data/local/tmp/firetv.sh "$@"
