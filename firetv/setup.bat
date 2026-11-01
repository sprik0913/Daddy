@echo off
REM Windows. Needs adb (Android platform-tools) in this folder or on PATH.
REM
REM   setup.bat                   install Sprik Home + debloat + speed tweaks + Home button
REM   setup.bat extra noupdates   run extra steps (see firetv.sh for the list)
REM   setup.bat restore           undo everything
REM
REM Change the IP below if your Fire TV's address changes.
set TV=192.168.1.175:5555
set HERE=%~dp0

where adb >nul 2>nul
if errorlevel 1 if exist "%HERE%adb.exe" set PATH=%HERE%;%PATH%
where adb >nul 2>nul
if errorlevel 1 (
  echo adb not found. Unzip platform-tools and copy adb.exe and its DLLs into this folder.
  pause
  exit /b 1
)

echo Connecting to Fire TV at %TV% ...
adb connect %TV%
echo If the TV shows "Allow USB debugging?", pick "Always allow" and OK.
adb -s %TV% wait-for-device
echo Connected.

if "%~1"=="" goto install
if /I "%~1"=="all" goto install
goto run

:install
echo Installing Sprik Home ...
adb -s %TV% install -r "%HERE%..\dist\SprikHome.apk"

:run
adb -s %TV% push "%HERE%firetv.sh" /data/local/tmp/firetv.sh >nul
adb -s %TV% shell sh /data/local/tmp/firetv.sh %*
pause
