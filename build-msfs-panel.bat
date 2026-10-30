@echo off
title Build Flight Bag Lido panel (MSFS 2024)
cd /d "%~dp0msfs\lido-bridge"
if "%MSFS2024_SDK%"=="" (
  echo The MSFS 2024 SDK is not installed. Install it from Dev Mode in MSFS 2024.
  pause & exit /b 1
)
echo Building with the MSFS 2024 package tool (it starts the simulator's builder, this takes a few minutes)...
"%MSFS2024_SDK%Tools\bin\fspackagetool.exe" "LidoBridge.xml" -nopause
if not exist "Packages\rotaidem-lido-bridge\InGamePanels\rotaidem-lido-bridge.spb" (
  echo Build failed - see _PackageInt\_RPTErrors.xml
  pause & exit /b 1
)
rem The builder does not always write layout.json; generate it so the sim loads the package.
if not exist "Packages\rotaidem-lido-bridge\layout.json" powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$r=(Resolve-Path 'Packages\rotaidem-lido-bridge').Path; $c=Get-ChildItem $r -Recurse -File | ?{ $_.Name -notin 'layout.json','manifest.json' } | Sort-Object FullName | %%{ [ordered]@{ path=$_.FullName.Substring($r.Length+1).Replace('\','/'); size=$_.Length; date=$_.LastWriteTimeUtc.ToFileTimeUtc() } }; @{ content=@($c) } | ConvertTo-Json -Depth 4 | Set-Content -Encoding UTF8 (Join-Path $r 'layout.json')"
set "COMMUNITY=%APPDATA%\Microsoft Flight Simulator 2024\Packages\Community"
if exist "%COMMUNITY%" (
  echo Copying to %COMMUNITY%
  robocopy "Packages\rotaidem-lido-bridge" "%COMMUNITY%\rotaidem-lido-bridge" /MIR /NFL /NDL /NJH /NJS >nul
  echo Done. Start MSFS 2024 and open "Flight Bag Lido" from the toolbar.
) else (
  echo Built: msfs\lido-bridge\Packages\rotaidem-lido-bridge  - copy it into your Community folder.
)
pause
