@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo.
echo   DAVAR CAMPUS - deploiement
echo   ==========================
echo.
echo   Verification du script avant de le lancer...
echo.

powershell -ExecutionPolicy Bypass -NoProfile -Command "$t=$null;$e=$null;$null=[System.Management.Automation.Language.Parser]::ParseFile('%~dp0scripts\DEPLOYER.ps1',[ref]$t,[ref]$e);if($e){foreach($x in $e){Write-Host ('   ERREUR ligne '+$x.Extent.StartLineNumber+' : '+$x.Message) -ForegroundColor Red};exit 1}else{Write-Host '   Script valide.' -ForegroundColor Green;exit 0}"

if errorlevel 1 (
  echo.
  echo   Le script ne peut pas demarrer.
  echo   Copiez le message d'erreur ci-dessus et envoyez-le.
  echo.
  pause
  exit /b 1
)

echo.
echo   Un menu va s'afficher avec les 5 etapes.
echo   Tapez un chiffre, puis Entree.
echo.

pause
powershell -ExecutionPolicy Bypass -NoProfile -NoExit -File "%~dp0scripts\DEPLOYER.ps1"
