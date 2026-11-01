# CleanYourTV launcher (Fire TV build)

The launcher and themes here come from [CleanYourTV](https://github.com/Gathin23/cleanyourtv)
by Gathin and contributors, MIT licensed (see `LICENSE`), copied at commit
`e62aa10a033f715a8ac7116efcf91e01b145adbd` (1 Nov 2026). Only `launcher/` and some of
the `themes/` are included.

## Changes for this Fire TV (`launcher/app/src/main/res/values/config.xml`)
- `stock_home_redirect` = `com.amazon.tv.launcher`: Fire OS won't let another app be Home,
  so the launcher's Home helper (HomeKeyService) brings it back whenever Amazon's home appears
  or Home is pressed.
- `restore_key_services` = `true`: the helper is put back if the launcher is force-stopped.
- `dock_apps`: Fire TV package names (Netflix, YouTube, Prime Video, Disney+, Hulu, Max).
- `live_tv_package` emptied (no tuner on a stick).

## Rebuild
```
cd launcher && ./gradlew assembleRelease
cp app/build/outputs/apk/release/app-release.apk ../../dist/CleanYourTV.apk
```

Install with `firetv/setup.bat` / `firetv/setup.sh`, not `launcher/build-and-install.sh`:
that script is written for TVs whose stock launcher can be disabled, which Fire OS refuses.
