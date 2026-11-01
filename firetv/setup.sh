#!/usr/bin/env bash
# Mac / Linux. Needs adb (Android platform-tools).
#
#   ./setup.sh                    install CleanYourTV + debloat + Home button   (first time)
#   ./setup.sh theme aurora       switch theme (see cleanyourtv/themes)
#   ./setup.sh theme-reset        back to the default look
#   ./setup.sh sprik              use Sprik Home instead
#   ./setup.sh home               back to CleanYourTV (also fixes Home after a reboot)
#   ./setup.sh extra noupdates    run extra steps (see firetv.sh for the list)
#   ./setup.sh restore            undo everything
#
# Set TV_IP if your Fire TV's address changes:  TV_IP=192.168.1.50 ./setup.sh

set -e
TV_IP="${TV_IP:-192.168.1.175}"
TV="$TV_IP:5555"
HERE="$(cd "$(dirname "$0")" && pwd)"
DIST="$HERE/../dist"
THEMES="$HERE/../cleanyourtv/themes"

command -v adb >/dev/null || { echo "adb not found. Install Android platform-tools first (see README)."; exit 1; }

# A theme name is not a command: find it and stage it first.
ARGS=()
THEME=""
while [ $# -gt 0 ]; do
  if [ "$1" = theme ]; then
    THEME="${2:-}"
    [ -n "$THEME" ] && [ -f "$THEMES/$THEME/config.json" ] || {
      echo "Pick a theme:"; ls "$THEMES" | grep -v README; exit 1; }
    ARGS+=(theme); shift 2; continue
  fi
  ARGS+=("$1"); shift
done
[ ${#ARGS[@]} -eq 0 ] && ARGS=(all)

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

for a in "${ARGS[@]}"; do
  case "$a" in
    all|home) echo "Installing CleanYourTV ..."; adb -s "$TV" install -r "$DIST/CleanYourTV.apk" ;;
    sprik)    echo "Installing Sprik Home ..."; adb -s "$TV" install -r "$DIST/SprikHome.apk" ;;
  esac
done

if [ -n "$THEME" ]; then
  echo "Sending theme $THEME ..."
  adb -s "$TV" shell rm -rf /data/local/tmp/cyt-theme
  adb -s "$TV" push "$THEMES/$THEME" /data/local/tmp/cyt-theme >/dev/null
fi

adb -s "$TV" push "$HERE/firetv.sh" /data/local/tmp/firetv.sh >/dev/null
adb -s "$TV" shell sh /data/local/tmp/firetv.sh "${ARGS[@]}"
