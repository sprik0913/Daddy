#!/system/bin/sh
# Runs ON the Fire TV (pushed there by setup.sh / setup.bat).
# Everything here is reversible with:  sh firetv.sh restore
#
# Usage: sh firetv.sh <command> [command...]
#   all        debloat + tweaks + home      (what setup runs by default)
#   debloat    turn off Amazon ads, tracking and junk apps
#   extra      also turn off Live TV, Silk, kids profiles, Amazon push, Alexa extras
#   noupdates  also block automatic Fire OS updates (they can undo all this)
#   tweaks     faster animations, clear caches
#   home       make the Home button open Sprik Home
#   optimize   pre-compile every app so it opens faster (takes 5-15 min)
#   scan       list every Amazon package on this TV
#   restore    undo everything

LAUNCHER=com.sprik.home
SERVICE=$LAUNCHER/com.sprik.home.HomeWatcherService
STATE=/data/local/tmp/sprik-removed.txt

# Ads, telemetry and apps you never open. Safe for normal use.
SAFE="
com.amazon.device.crashmanager
com.amazon.dp.logger
com.amazon.device.logmanager
com.amazon.tv.fw.metrics
com.amazon.kso
com.amazon.tmm.tutorialvideoprovider
com.amazon.tv.legal.notices
com.amazon.ags.app
com.amazon.shoptv.client
com.amazon.shoptv.firetv.client
com.amazon.alexashopping
com.amazon.imdb.tv.android.app
com.amazon.bueller.music
com.amazon.bueller.photos
com.amazon.avls.experience
com.amazon.wifilocker
com.amazon.tv.releasenotes
"

# Fine for most homes, but read the list first.
EXTRA="
com.amazon.tv.livetv
com.amazon.cloud9
com.amazon.tahoe
com.amazon.hedwig
com.amazon.tv.alexanotifications
com.amazon.tv.parentalcontrols
"

# Stops Amazon from pushing Fire OS updates.
UPDATES="
com.amazon.device.software.ota
com.amazon.device.software.ota.override
com.amazon.tv.forcedotaupdater.v2
"

ALL_PKGS=""
DISABLED_PKGS=""
refresh() {
  ALL_PKGS=$(pm list packages 2>/dev/null)
  DISABLED_PKGS=$(pm list packages -d 2>/dev/null)
}
has()         { echo "$ALL_PKGS"      | grep -qx "package:$1"; }
is_disabled() { echo "$DISABLED_PKGS" | grep -qx "package:$1"; }

turn_off() {
  for p in $1; do
    if ! has "$p"; then
      echo "  [skip] $p (not on this TV)"
      continue
    fi
    if is_disabled "$p"; then
      echo "  [done] $p (already off)"
      continue
    fi
    out=$(pm disable-user --user 0 "$p" 2>&1)
    case "$out" in
      *"new state: disabled"*)
        echo "  [ OK ] turned off $p"
        echo "disable $p" >> "$STATE"
        continue ;;
    esac
    # Some Amazon apps refuse to be disabled; removing them for this user
    # works instead and can still be undone with "restore".
    am force-stop "$p" 2>/dev/null
    out2=$(pm uninstall -k --user 0 "$p" 2>&1)
    case "$out2" in
      *Success*)
        echo "  [ OK ] removed $p"
        echo "uninstall $p" >> "$STATE" ;;
      *)
        echo "  [ NO ] $p is locked by Fire OS" ;;
    esac
  done
}

do_debloat()   { echo "== Turning off ads, tracking and junk =="; refresh; turn_off "$SAFE"; }
do_extra()     { echo "== Turning off extras ==";                 refresh; turn_off "$EXTRA"; }
do_noupdates() { echo "== Blocking Fire OS auto-updates ==";      refresh; turn_off "$UPDATES"; }

do_tweaks() {
  echo "== Speed tweaks =="
  settings put global window_animation_scale 0.5
  settings put global transition_animation_scale 0.5
  settings put global animator_duration_scale 0.5
  echo "  [ OK ] animations 2x faster"
  pm trim-caches 999G >/dev/null 2>&1 && echo "  [ OK ] app caches cleared"
  am kill-all >/dev/null 2>&1 && echo "  [ OK ] background apps closed"
}

do_home() {
  echo "== Home button -> Sprik Home =="
  if ! pm list packages | grep -qx "package:$LAUNCHER"; then
    echo "  [ NO ] Sprik Home isn't installed yet"
    return
  fi
  cur=$(settings get secure enabled_accessibility_services)
  case "$cur" in
    *"$SERVICE"*) new="$cur" ;;
    ""|null)      new="$SERVICE" ;;
    *)            new="$cur:$SERVICE" ;;
  esac
  settings put secure enabled_accessibility_services "$new"
  settings put secure accessibility_enabled 1
  echo "  [ OK ] home-button helper enabled"
  # Works on some Fire OS builds, ignored on others. Harmless either way.
  cmd package set-home-activity "$LAUNCHER/.MainActivity" >/dev/null 2>&1
  am start -n "$LAUNCHER/.MainActivity" >/dev/null 2>&1
  echo "  [ OK ] Sprik Home opened"
}

do_optimize() {
  echo "== Pre-compiling apps (this takes a while, leave the TV on) =="
  cmd package bg-dexopt-job >/dev/null 2>&1 && echo "  [ OK ] done"
}

do_scan() {
  echo "== Amazon packages on this TV (- = off) =="
  refresh
  for line in $(pm list packages -u | grep amazon | sort); do
    p=${line#package:}
    if is_disabled "$p" || ! has "$p"; then echo "  - $p"; else echo "    $p"; fi
  done
}

do_restore() {
  echo "== Restoring everything =="
  for p in $SAFE $EXTRA $UPDATES; do
    pm enable "$p" >/dev/null 2>&1
    cmd package install-existing "$p" >/dev/null 2>&1
  done
  rm -f "$STATE"
  settings put global window_animation_scale 1
  settings put global transition_animation_scale 1
  settings put global animator_duration_scale 1
  cur=$(settings get secure enabled_accessibility_services)
  new=$(echo "$cur" | sed "s#:*$SERVICE##g; s#^:##")
  if [ -z "$new" ] || [ "$new" = "null" ]; then
    settings delete secure enabled_accessibility_services >/dev/null 2>&1
  else
    settings put secure enabled_accessibility_services "$new"
  fi
  echo "  [ OK ] Amazon apps back on, animations normal, Home button back to Amazon"
  echo "  (Sprik Home is still installed. Remove it from Settings > Applications if you want.)"
}

[ $# -eq 0 ] && set -- all
for cmd in "$@"; do
  case "$cmd" in
    all)       do_debloat; do_tweaks; do_home ;;
    debloat)   do_debloat ;;
    extra)     do_extra ;;
    noupdates) do_noupdates ;;
    tweaks)    do_tweaks ;;
    home)      do_home ;;
    optimize)  do_optimize ;;
    scan)      do_scan ;;
    restore)   do_restore ;;
    *) echo "Unknown command: $cmd" ;;
  esac
done
echo "Done."
