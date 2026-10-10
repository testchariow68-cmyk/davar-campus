@echo off
REM ============================================================================
REM  DAVAR CAMPUS - DEPLOIEMENT
REM
REM  Double-cliquez ce fichier : un menu s'ouvre avec les 5 etapes.
REM  Verification / Schema / Deploiement / Secrets / Recette
REM ============================================================================
chcp 65001 >nul 2>&1
title DAVAR CAMPUS - Deploiement

REM  Se placer dans le dossier de ce fichier (davar-app), quel que soit le disque.
cd /d "%~dp0"

echo.
echo   DAVAR CAMPUS - deploiement
echo   ==========================
echo.
echo   Un menu va s'afficher avec les 5 etapes.
echo   La premiere fois, choisissez 1 puis 2, 3, 4, 5 dans l'ordre.
echo.
pause

powershell -ExecutionPolicy Bypass -NoProfile -NoExit -File "%~dp0scripts\DEPLOYER.ps1"

echo.
echo   Termine. Vous pouvez fermer cette fenetre.
pause
