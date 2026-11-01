@echo off
setlocal
REM Windows. Needs adb (Android platform-tools) in this folder or on PATH.
REM
REM   setup.bat                   install CleanYourTV + debloat + Home button   (first time)
REM   setup.bat theme aurora      switch theme (see cleanyourtv\themes)
REM   setup.bat theme-reset       back to the default look
REM   setup.bat sprik             use Sprik Home instead
REM   setup.bat home              back to CleanYourTV (also fixes Home after a reboot)
REM   setup.bat extra noupdates   run extra steps (see firetv.sh for the list)
REM   setup.bat restore           undo everything
REM
REM Change the IP below if your Fire TV's address changes.
set TV=192.168.1.175:5555
set HERE=%~dp0
set DIST=%HERE%..\dist
set THEMES=%HERE%..\cleanyourtv\themes

where adb >nul 2>nul
if errorlevel 1 if exist "%HERE%adb.exe" set PATH=%HERE%;%PATH%
where adb >nul 2>nul
if errorlevel 1 (
  echo adb not found. Unzip platform-tools and copy adb.exe and its DLLs into this folder.
  pause
  exit /b 1
)

set CMDS=%*
if "%~1"=="" set CMDS=all
if /I "%~1"=="theme" (
  if not exist "%THEMES%\%~2\config.json" (
    echo Pick a theme:
    dir /b "%THEMES%"
    pause
    exit /b 1
  )
  set CMDS=theme
)

echo Connecting to Fire TV at %TV% ...
adb connect %TV%
echo If the TV shows "Allow USB debugging?", pick "Always allow" and OK.
adb -s %TV% wait-for-device
echo Connected.

if "%~1"=="" goto install_cyt
if /I "%~1"=="all" goto install_cyt
if /I "%~1"=="home" goto install_cyt
if /I "%~1"=="sprik" goto install_sprik
goto after_install

:install_cyt
echo Installing CleanYourTV ...
adb -s %TV% install -r "%DIST%\CleanYourTV.apk"
goto after_install

:install_sprik
echo Installing Sprik Home ...
adb -s %TV% install -r "%DIST%\SprikHome.apk"

:after_install
if /I "%~1"=="theme" (
  echo Sending theme %~2 ...
  adb -s %TV% shell rm -rf /data/local/tmp/cyt-theme
  adb -s %TV% push "%THEMES%\%~2" /data/local/tmp/cyt-theme >nul
)

adb -s %TV% push "%HERE%firetv.sh" /data/local/tmp/firetv.sh >nul
adb -s %TV% shell sh /data/local/tmp/firetv.sh %CMDS%
pause
