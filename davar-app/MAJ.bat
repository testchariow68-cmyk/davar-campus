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
echo   Le campus va se mettre a jour depuis GitHub.
echo   Vos valeurs (.env.local) seront preservees.
echo.
pause

powershell -ExecutionPolicy Bypass -NoProfile -NoExit -File "%~dp0scripts\MAJ.ps1"

echo.
echo   Termine. Vous pouvez fermer cette fenetre.
pause
