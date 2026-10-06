# DAVAR staging uniquement. Aucun fichier .env lu ou créé.
# -Apply requiert l'accord explicite déjà donné pour le SQL SHA-256 vérifié.
param([switch]$Apply)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$env:APP_ENV = 'staging'
try {
    $databaseUrl = (Read-Host 'URL libsql de davar-campus-staging (pas de production)').Trim()
    $uri = [System.Uri]$databaseUrl
    if (($uri.Scheme -ne 'libsql' -and $uri.Scheme -ne 'https') -or
        -not $uri.Host.StartsWith('davar-campus-staging-') -or
        -not $uri.Host.EndsWith('.turso.io')) {
        throw 'REFUS : URL de la base staging DAVAR non reconnue.'
    }
    $env:TURSO_DATABASE_URL = $databaseUrl
    $env:TURSO_EXPECTED_HOST = $uri.Host
    $secret = Read-Host 'Jeton limité à davar-campus-staging (saisie masquée)' -AsSecureString
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
    try {
        $env:TURSO_AUTH_TOKEN = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    } finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
        $secret.Dispose()
    }
    if ($Apply) { $mode = '--apply' } else { $mode = '--inspect' }
    & node (Join-Path $root 'scripts\staging-schema.mjs') $mode
    if ($LASTEXITCODE -ne 0) { throw "Contrôle staging en échec (code $LASTEXITCODE). Aucune nouvelle commande à lancer." }
} finally {
    Remove-Item Env:TURSO_AUTH_TOKEN -ErrorAction SilentlyContinue
    Remove-Item Env:TURSO_DATABASE_URL -ErrorAction SilentlyContinue
    Remove-Item Env:TURSO_EXPECTED_HOST -ErrorAction SilentlyContinue
    Remove-Item Env:APP_ENV -ErrorAction SilentlyContinue
}
