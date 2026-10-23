# DAVAR PRODUCTION uniquement. Aucun fichier .env lu ou créé.
# Ce lanceur refuse une URL de recette : la production et le staging ne se confondent pas.
# -Apply exige de taper la phrase de confirmation dans le terminal.
param([switch]$Apply)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$env:APP_ENV = 'production'
$env:DAVAR_SCHEMA_TARGET = 'production'
try {
    $databaseUrl = (Read-Host 'URL libsql de la base Turso de PRODUCTION (jamais une base staging)').Trim()
    $uri = [System.Uri]$databaseUrl
    if (($uri.Scheme -ne 'libsql' -and $uri.Scheme -ne 'https') -or
        -not $uri.Host.EndsWith('.turso.io') -or
        $uri.Host -match 'staging') {
        throw 'REFUS : URL non reconnue comme base de PRODUCTION (ou contient « staging »).'
    }
    $env:TURSO_DATABASE_URL = $databaseUrl
    $env:TURSO_EXPECTED_HOST = $uri.Host
    $secret = Read-Host 'Jeton limité à cette base de production (saisie masquée)' -AsSecureString
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
    try {
        $env:TURSO_AUTH_TOKEN = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    } finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
        $secret.Dispose()
    }
    if ($Apply) { $mode = '--apply' } else { $mode = '--inspect' }
    & node (Join-Path $root 'scripts\staging-schema.mjs') $mode
    if ($LASTEXITCODE -ne 0) { throw "Contrôle production en échec (code $LASTEXITCODE). Aucune nouvelle commande à lancer." }
} finally {
    Remove-Item Env:TURSO_AUTH_TOKEN -ErrorAction SilentlyContinue
    Remove-Item Env:TURSO_DATABASE_URL -ErrorAction SilentlyContinue
    Remove-Item Env:TURSO_EXPECTED_HOST -ErrorAction SilentlyContinue
    Remove-Item Env:APP_ENV -ErrorAction SilentlyContinue
    Remove-Item Env:DAVAR_SCHEMA_TARGET -ErrorAction SilentlyContinue
}
