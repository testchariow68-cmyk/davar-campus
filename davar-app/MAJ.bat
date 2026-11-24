@echo off
REM ============================================================================
REM  DAVAR CAMPUS - BOUTON "MAJ"
REM
REM  Double-cliquez ce fichier : le campus se met a jour tout seul.
REM  Vos valeurs (.env.local) sont preservees. Une copie de secours est faite.
REM ============================================================================
chcp 65001 >nul 2>&1
title DAVAR CAMPUS - Mise a jour

REM  Se placer dans le dossier de ce fichier (davar-app), quel que soit le disque.
cd /d "%~dp0"

echo.
echo   DAVAR CAMPUS - mise a jour
echo   ==========================
echo.
echo   Verification du script avant de le lancer...
echo.

powershell -ExecutionPolicy Bypass -NoProfile -Command "$t=$null;$e=$null;$null=[System.Management.Automation.Language.Parser]::ParseFile('%~dp0scripts\MAJ.ps1',[ref]$t,[ref]$e);if($e){foreach($x in $e){Write-Host ('   ERREUR ligne '+$x.Extent.StartLineNumber+' : '+$x.Message) -ForegroundColor Red};exit 1}else{Write-Host '   Script valide.' -ForegroundColor Green;exit 0}"

if errorlevel 1 (
  echo.
  echo   Le script ne peut pas demarrer.
  echo   Copiez le message d'erreur ci-dessus et envoyez-le.
  echo.
  pause
  exit /b 1
)

echo.
echo   Le campus va se mettre a jour depuis GitHub.
echo   Vos valeurs (.env.local) seront preservees.
echo.
pause

powershell -ExecutionPolicy Bypass -NoProfile -NoExit -File "%~dp0scripts\MAJ.ps1"

echo.
echo   Termine. Vous pouvez fermer cette fenetre.
pause
