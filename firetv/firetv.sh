#!/system/bin/sh
# Runs ON the Fire TV (pushed there by setup.sh / setup.bat).
# Everything here is reversible with:  sh firetv.sh restore
#
# Usage: sh firetv.sh <command> [command...]
#   all        debloat + tweaks + home      (what setup runs by default)
#   home       make the Home button open the CleanYourTV launcher
#   sprik      make the Home button open Sprik Home instead
#   theme      apply the CleanYourTV theme staged in /data/local/tmp/cyt-theme (setup.sh pushes it)
#   theme-reset  back to the launcher's built-in look
#   debloat    turn off Amazon ads, tracking, telemetry and junk
#   extra      also turn off Alexa extras, Amazon casting, smart home, profiles sync, Amazon sign-in
#   noupdates  also block automatic Fire OS updates (they can undo all this)
#   tweaks     clear caches, close background apps
#   optimize   pre-compile every app so it opens faster (takes 5-15 min)
#   scan       list every Amazon package on this TV
#   restore    undo everything
#
# The package lists come from CleanYourTV's tested list for this exact Stick
# (Fire TV Stick 4K Max 2nd gen, AFTKRT, Fire OS 8.1.8.5), MIT licensed:
# https://github.com/Gathin23/cleanyourtv/blob/main/examples/amazon-fire-tv-stick-4k-max-2023/debloat.txt
# (full list with notes: debloat-aftkrt.txt). Packages Fire OS protects are left out,
# and nothing is ever uninstalled: only "disabled", which restore undoes.

LAUNCHER=com.sprik.home
SERVICE=$LAUNCHER/com.sprik.home.HomeWatcherService
CYT=com.gathin.tvhome
CYT_SERVICE=$CYT/.HomeKeyService
THEME_DIR=/data/local/tmp/cyt-theme
THEME_URI=content://$CYT.theme

# Telemetry, metrics, logs, usage and location reporting
TELEMETRY="
com.amazon.client.metrics.api
com.amazon.device.telemetry.emitter
com.amazon.wirelessmetrics.service
com.amazon.perfcollection
com.amazon.perfc
com.amazon.dp.logger
com.amazon.ceviche
com.amazon.tv.developer.dataservice
com.amazon.livedeviceservice
com.amazon.privacypassservice
com.amazon.wifilocker
com.amazon.tv.acr
com.amazon.ftvspatial
com.amazon.neo.minerva
com.amazon.neo.minerva.logcat
"

# Ads, sponsored rows, recommendations, promos, shopping
ADS="
com.amazon.kso.blackbird
com.amazon.sneakpeek
com.amazon.hybridadidservice
com.amazon.media.recommendations
com.amazon.providers.contentsupport
com.amazon.shoptv.client
com.amazon.shoptv.firetv.client
com.amazon.hedwig
com.amazon.franktvinput
com.amazon.tifobserver
com.amazon.systemnotices
com.amazon.uxnotification
com.amazon.tv.releasenotes
com.amazon.tv.earlyaccess
com.amazon.gamehub
"

# Support tools, setup helpers, legal pages, tutorials, placeholder apps, unused Android parts
JUNK="
com.amazon.tv.support
com.amazon.firetv.troubleshooting
com.amazon.device_remote_config_sync_service
com.amazon.minitv.android.app
com.amazon.tv.website_launcher
com.amazon.tv.ffsprovisioneeclient
com.amazon.tv.legal.notices
com.amazon.tv.legalresources
com.amazon.storm.lightning.tutorial
com.amazon.tmm.tutorial
com.amazon.dummy.alarmclock
com.amazon.dummy.calendar
com.amazon.dummy.contacts
com.amazon.dummy.gallery
com.amazon.dummy.music
com.amazon.dummy.settings
com.amazon.dummy.soundpicker
com.android.cts.ctsshim
com.android.cts.priv.ctsshim
com.android.protips
com.android.dreams.basic
com.android.printservice.recommendation
com.android.bookmarkprovider
com.android.calllogbackup
com.android.smspush
com.android.mms.service
com.android.hotspot2.osulogin
com.android.traceur
com.android.onetimeinitializer
com.android.carrierconfig
com.android.safetyregulatoryinfo
com.android.htmlviewer
"

# Optional ("extra"): features some homes use. Alexa voice itself keeps working.
EXTRA="
com.amazon.alexa.datastore.app
com.amazon.alexadirectivebrokerservice
com.amazon.tv.alexaalerts
com.amazon.tv.alexanotifications
com.amazon.alexa.externalmediaplayer.fireos
com.amazon.alexamediaplayer.runtime.ftv
com.amazon.firetv.androidskillconnectioncapability
com.amazon.aiondec
com.amazon.aca
com.amazon.audiohome
com.amazon.whad
com.amazon.whasettings
com.amazon.rtcsessioncontroller
com.amazon.spotify.mediabrowserservice
com.amazon.tcomm.jackson
com.amazon.awvflingreceiver
com.amazon.cast.sink
com.amazon.dialservice
com.amazon.whisperplay.service.install
com.amazon.whisperjoin.middleware.v2.np
com.amazon.tv.matter
com.amazon.tv.mattercohost
com.amazon.smarthomemapviewapp
com.amazon.tv.ottssocompanionapp
com.amazon.ods.kindleconnect
com.amazon.prism.android.service
com.amazon.sharingservice.android.client.proxy
"

# Optional ("noupdates"): stops Fire OS updates.
UPDATES="
com.amazon.device.software.ota
com.amazon.device.software.ota.override
com.amazon.tv.forcedotaupdater.v2
com.amazon.tv.easyupgrade
"

# Packages the first version of this script touched. Only used by restore.
OLD_V1="
com.amazon.device.crashmanager
com.amazon.device.logmanager
com.amazon.tv.fw.metrics
com.amazon.kso
com.amazon.tmm.tutorialvideoprovider
com.amazon.ags.app
com.amazon.alexashopping
com.amazon.imdb.tv.android.app
com.amazon.bueller.music
com.amazon.bueller.photos
com.amazon.avls.experience
com.amazon.tv.livetv
com.amazon.cloud9
com.amazon.tahoe
com.amazon.tv.parentalcontrols
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
  ok=0; skip=0; done_=0; no=0
  for p in $1; do
    if ! has "$p"; then skip=$((skip + 1)); continue; fi
    if is_disabled "$p"; then done_=$((done_ + 1)); continue; fi
    pm disable-user --user 0 "$p" >/dev/null 2>&1
    # Trust the package list, not the exit code (some refusals still exit 0).
    if pm list packages -d 2>/dev/null | grep -qx "package:$p"; then
      echo "  [ OK ] $p"; ok=$((ok + 1))
    else
      echo "  [ NO ] $p (Fire OS won't allow it, skipped)"; no=$((no + 1))
    fi
  done
  echo "  -> $ok turned off, $done_ already off, $skip not on this TV, $no refused"
}

do_debloat() {
  refresh
  echo "== Telemetry and tracking ==";  turn_off "$TELEMETRY"
  echo "== Ads and promos ==";          turn_off "$ADS"
  echo "== Junk and unused parts ==";   turn_off "$JUNK"
}
do_extra()     { echo "== Extras (Alexa extras, casting, smart home) =="; refresh; turn_off "$EXTRA"; }
do_noupdates() { echo "== Blocking Fire OS updates ==";                   refresh; turn_off "$UPDATES"; }

do_tweaks() {
  echo "== Tweaks =="
  # Fire OS 8 menus break at 0.5x animation speed, so keep (or put back) normal speed.
  settings put global window_animation_scale 1
  settings put global transition_animation_scale 1
  settings put global animator_duration_scale 1
  pm trim-caches 999G >/dev/null 2>&1 && echo "  [ OK ] app caches cleared"
  am kill-all >/dev/null 2>&1 && echo "  [ OK ] background apps closed"
}

installed() { pm list packages | grep -qx "package:$1"; }

# The list of accessibility helpers, with every entry for package $1 taken out.
services_without() {
  cur=$(settings get secure enabled_accessibility_services)
  [ "$cur" = null ] && cur=""
  echo "$cur" | tr ':' '\n' | grep -v "^$1/" | grep -v '^$' | tr '\n' ':' | sed 's/:$//'
}

# Puts helper $2 (of package $1) on the list. Clearing the list first makes Android bind it again.
use_helper() {
  rest=$(services_without "$1")
  settings put secure enabled_accessibility_services ""
  settings put secure accessibility_enabled 0
  sleep 1
  if [ -n "$rest" ]; then new="$rest:$2"; else new="$2"; fi
  settings put secure enabled_accessibility_services "$new"
  settings put secure accessibility_enabled 1
}

drop_helper() {
  rest=$(services_without "$1")
  if [ -n "$rest" ]; then
    settings put secure enabled_accessibility_services "$rest"
  else
    settings delete secure enabled_accessibility_services >/dev/null 2>&1
  fi
}

# Restart CleanYourTV and bind its Home helper.
start_cyt() {
  am force-stop $CYT
  use_helper $CYT $CYT_SERVICE
  # Started like an app, not as Home: Amazon's launcher stays Android's Home, and starting
  # this one as Home would stop the remote's Netflix/YouTube buttons from working.
  am start -W -n $CYT/.MainActivity >/dev/null 2>&1
}

do_home() {
  echo "== Home button -> CleanYourTV =="
  if ! installed $CYT; then echo "  [ NO ] CleanYourTV isn't installed yet"; return; fi
  installed $LAUNCHER && drop_helper $LAUNCHER
  cmd appops set $CYT AUTO_START allow >/dev/null 2>&1
  pm grant $CYT android.permission.ACCESS_FINE_LOCATION >/dev/null 2>&1   # Wi-Fi name in the top bar
  pm grant $CYT android.permission.WRITE_SECURE_SETTINGS >/dev/null 2>&1  # lets it put its Home helper back
  start_cyt
  echo "  [ OK ] Home helper on, CleanYourTV opened"
  cmd package compile -m speed -f $CYT >/dev/null 2>&1 && echo "  [ OK ] launcher pre-compiled for speed"
}

do_sprik() {
  echo "== Home button -> Sprik Home =="
  if ! installed $LAUNCHER; then echo "  [ NO ] Sprik Home isn't installed yet"; return; fi
  installed $CYT && drop_helper $CYT
  use_helper $LAUNCHER $SERVICE
  am start -n "$LAUNCHER/.MainActivity" >/dev/null 2>&1
  echo "  [ OK ] Home helper on, Sprik Home opened"
}

theme_put() {   # $1 = file path inside the theme
  content delete --uri "$THEME_URI/$1" >/dev/null 2>&1
  out=$(content write --uri "$THEME_URI/$1" < "$THEME_DIR/$1" 2>&1)
  case "$out" in *rror*|*xception*) echo "  [ NO ] $1: $out"; return 1 ;; esac
  return 0
}

theme_finish() {
  cat /proc/sys/kernel/random/uuid > "$THEME_DIR.rev" 2>/dev/null || date +%s > "$THEME_DIR.rev"
  content write --uri "$THEME_URI/theme_revision" < "$THEME_DIR.rev" >/dev/null 2>&1
  rm -f "$THEME_DIR.rev"
  start_cyt
}

theme_clear() {
  content delete --uri "$THEME_URI/config.json" >/dev/null 2>&1
  content delete --uri "$THEME_URI/wallpaper.jpg" >/dev/null 2>&1
  content delete --uri "$THEME_URI/wallpapers" >/dev/null 2>&1
}

do_theme() {
  echo "== Applying theme =="
  if ! installed $CYT; then echo "  [ NO ] CleanYourTV isn't installed yet"; return; fi
  if [ ! -f "$THEME_DIR/config.json" ]; then echo "  [ NO ] no theme was sent to the TV"; return; fi
  theme_clear
  n=0
  theme_put config.json || return
  [ -f "$THEME_DIR/wallpaper.jpg" ] && theme_put wallpaper.jpg && n=$((n + 1))
  if [ -d "$THEME_DIR/wallpapers" ]; then
    for f in "$THEME_DIR"/wallpapers/*; do
      [ -f "$f" ] || continue
      theme_put "wallpapers/${f##*/}" && n=$((n + 1))
    done
  fi
  theme_finish
  rm -rf "$THEME_DIR"
  echo "  [ OK ] theme applied ($n pictures)"
}

do_theme_reset() {
  echo "== Back to the built-in look =="
  theme_clear
  theme_finish
  echo "  [ OK ] done"
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
  for p in $TELEMETRY $ADS $JUNK $EXTRA $UPDATES $OLD_V1; do
    pm enable "$p" >/dev/null 2>&1
    cmd package install-existing "$p" >/dev/null 2>&1
  done
  rm -f /data/local/tmp/sprik-removed.txt
  settings put global window_animation_scale 1
  settings put global transition_animation_scale 1
  settings put global animator_duration_scale 1
  drop_helper $LAUNCHER
  drop_helper $CYT
  echo "  [ OK ] Amazon apps back on, Home button back to Amazon"
  echo "  (The launchers are still installed. Remove them from Settings > Applications if you want.)"
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
    sprik)     do_sprik ;;
    theme)     do_theme ;;
    theme-reset) do_theme_reset ;;
    optimize)  do_optimize ;;
    scan)      do_scan ;;
    restore)   do_restore ;;
    *) echo "Unknown command: $cmd" ;;
  esac
done
echo "Done."
