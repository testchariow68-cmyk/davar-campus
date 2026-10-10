<#
.SYNOPSIS
    Déploie et entretient le campus depuis PowerShell, sans tableau de bord.
.DESCRIPTION
    Tout ce qu'il faut faire, dans l'ordre, depuis cette fenêtre :

      1. Verification  — est-ce que tout est prêt ? (Node, vos valeurs, les tests)
      2. Schema        — crée les 49 tables sur la base Turso de PRODUCTION
      3. Deploiement   — publie le Worker public sur Cloudflare
      4. Secrets       — envoie vos clés à Cloudflare, chiffrées
      5. Recette       — interroge les cinq services et dit ce qui répond

    Vos réglages (sous-domaine, base) sont mémorisés dans .deploy-local.json :
    vous ne les tapez qu'une seule fois.

    SÉCURITÉ : vos valeurs ne sont jamais affichées et ne passent jamais par la
    ligne de commande. Elles sont lues dans .env.local, puis envoyées dans un
    fichier temporaire supprimé aussitôt après.
.EXAMPLE
    .\scripts\DEPLOYER.ps1              # menu
    .\scripts\DEPLOYER.ps1 -Etape Tout
    .\scripts\DEPLOYER.ps1 -Etape Schema -Appliquer
#>
[CmdletBinding()]
param(
    [ValidateSet('Menu', 'Verification', 'Schema', 'Deploiement', 'Secrets', 'Recette', 'Tout')]
    [string]$Etape = 'Menu',

    # Autorise l'ÉCRITURE sur la base de production (étape Schema)
    [switch]$Appliquer
)

$ErrorActionPreference = 'Stop'

$TRAVAILLEUR = 'davar-campus-production-2026'
$racine      = Split-Path -Parent $PSScriptRoot
$envLocal    = Join-Path $racine '.env.local'
$reglages    = Join-Path $racine '.deploy-local.json'

function Dire([string]$Message, [string]$Couleur = 'White') { Write-Host $Message -ForegroundColor $Couleur }
function Etape([string]$Message) { Write-Host ''; Write-Host "==> $Message" -ForegroundColor Cyan }
function Ok([string]$Message) { Write-Host "  ok   $Message" -ForegroundColor Green }
function Echec([string]$Message) { Write-Host "  NON  $Message" -ForegroundColor Red }
function Arreter([string]$Message) {
    Write-Host ''; Write-Host "ARRET : $Message" -ForegroundColor Red; exit 1
}

# --------------------------------------------------------------------------- #
# Lecture de .env.local — jamais d'affichage de valeur
# --------------------------------------------------------------------------- #
function Lire-Valeur([string]$Cle) {
    if (-not (Test-Path $envLocal)) { return $null }
    $trouve = $null
    foreach ($ligne in Get-Content $envLocal) {
        $l = $ligne.Trim()
        if ($l -eq '' -or $l.StartsWith('#')) { continue }
        $i = $l.IndexOf('=')
        if ($i -le 0) { continue }
        if ($l.Substring(0, $i).Trim() -eq $Cle) {
            $trouve = $l.Substring($i + 1).Trim().Trim('"').Trim("'")
        }
    }
    return $trouve
}

# --------------------------------------------------------------------------- #
# Réglages mémorisés : on ne les demande qu'une fois
# --------------------------------------------------------------------------- #
function Charger-Reglages {
    if (Test-Path $reglages) {
        try { return (Get-Content $reglages -Raw | ConvertFrom-Json) } catch { }
    }
    return [pscustomobject]@{ sousDomaine = $null }
}
function Enregistrer-Reglages($objet) {
    ($objet | ConvertTo-Json) | Set-Content $reglages -Encoding UTF8
}

function Demander-Reglages {
    $objet = Charger-Reglages

    # L'hôte Turso vient de vos valeurs : rien à retaper.
    $url = Lire-Valeur 'TURSO_DATABASE_URL'
    if ($url -match '^libsql://([^/]+)') {
        $objet | Add-Member -MemberType NoteProperty -Name hoteTurso -Value $Matches[1] -Force
    } elseif (-not $objet.hoteTurso) {
        $objet | Add-Member -MemberType NoteProperty -Name hoteTurso -Value $null -Force
    }

    if (-not $objet.sousDomaine) {
        Write-Host ''
        Write-Host '  Une seule information à donner, une seule fois :' -ForegroundColor Yellow
        Write-Host '  Cloudflare -> Workers et Pages -> colonne de droite ->' -ForegroundColor DarkGray
        Write-Host '  « sous-domaine *.workers.dev »' -ForegroundColor DarkGray
        $objet.sousDomaine = (Read-Host '  Votre sous-domaine').Trim().Trim('.')
    }

    $objet | Add-Member -MemberType NoteProperty -Name origine -Value "https://$TRAVAILLEUR.$($objet.sousDomaine).workers.dev" -Force
    Enregistrer-Reglages $objet
    return $objet
}

# --------------------------------------------------------------------------- #
# 1. VÉRIFICATION
# --------------------------------------------------------------------------- #
function Etape-Verification {
    Etape '1. Vérification'

    $version = (node --version) -replace '^v', ''
    if ([version]($version -replace '-.*$', '') -lt [version]'22.18.0') {
        Echec "Node.js $version — il faut 22.18 ou plus (https://nodejs.org)"
        Arreter 'Mettez Node.js à jour, puis relancez.'
    }
    Ok "Node.js $version"

    if (-not (Test-Path $envLocal)) { Arreter "Il manque $envLocal. Lancez : npm run env:local" }
    Ok '.env.local présent'

    $vides = @()
    foreach ($cle in @('TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN', 'MAIL_APPS_SCRIPT_URL', 'MAIL_APPS_SCRIPT_TOKEN', 'R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET')) {
        if ([string]::IsNullOrWhiteSpace((Lire-Valeur $cle))) { $vides += $cle }
    }
    if ($vides.Count -gt 0) {
        Echec "encore vide : $($vides -join ', ')"
        Write-Host '         (Chariow peut rester vide : on le branchera après la mise en ligne.)' -ForegroundColor DarkGray
    } else {
        Ok 'les valeurs essentielles sont renseignées'
    }

    Etape 'Répétition de la migration (sur une copie, jamais sur votre base)'
    Push-Location $racine
    try {
        npm run rehearsal:staging
        if ($LASTEXITCODE -ne 0) { Arreter 'La répétition échoue. Ne touchez pas à la production.' }
    } finally { Pop-Location }

    Etape 'Tests'
    Push-Location $racine
    try {
        npm test 2>&1 | Select-Object -Last 6
    } finally { Pop-Location }
}

# --------------------------------------------------------------------------- #
# 2. SCHÉMA DE LA BASE DE PRODUCTION
# --------------------------------------------------------------------------- #
function Etape-Schema {
    Etape '2. Schéma de la base de PRODUCTION'

    $url   = Lire-Valeur 'TURSO_DATABASE_URL'
    $jeton = Lire-Valeur 'TURSO_AUTH_TOKEN'
    if ([string]::IsNullOrWhiteSpace($url))   { Arreter 'TURSO_DATABASE_URL est vide dans .env.local' }
    if ([string]::IsNullOrWhiteSpace($jeton)) { Arreter 'TURSO_AUTH_TOKEN est vide dans .env.local' }

    # Garde-fou : la production et la recette ne partagent jamais la même base.
    if ($url -notmatch '^libsql://')   { Arreter "TURSO_DATABASE_URL doit commencer par libsql:// (actuellement : une autre forme)" }
    if ($url -match '(?i)staging')     { Arreter 'Cette base est une base de RECETTE. Déploiement refusé.' }
    $hote = if ($url -match '^libsql://([^/]+)') { $Matches[1] } else { Arreter 'Hôte introuvable dans l’URL.' }
    if ($hote -notmatch '\.turso\.io$') { Arreter "Hôte inattendu : $hote" }

    $env:APP_ENV             = 'production'
    $env:DAVAR_SCHEMA_TARGET = 'production'
    $env:TURSO_DATABASE_URL  = $url
    $env:TURSO_AUTH_TOKEN    = $jeton
    $env:TURSO_EXPECTED_HOST = $hote

    try {
        Push-Location $racine
        try {
            Write-Host '  Inspection d’abord (aucune écriture)…' -ForegroundColor DarkGray
            node scripts/staging-schema.mjs --inspect
            if ($LASTEXITCODE -ne 0) { Arreter 'Inspection en échec. Rien n’a été écrit.' }

            if (-not $Appliquer) {
                Write-Host ''
                Write-Host '  Inspection terminée. Pour APPLIQUER, relancez :' -ForegroundColor Yellow
                Write-Host '    .\scripts\DEPLOYER.ps1 -Etape Schema -Appliquer' -ForegroundColor Cyan
                return
            }

            Write-Host ''
            Write-Host '  Vous allez écrire dans la base de PRODUCTION.' -ForegroundColor Red
            $confirmation = (Read-Host '  Tapez exactement: APPLIQUER DAVAR PRODUCTION').Trim()
            if ($confirmation -cne 'APPLIQUER DAVAR PRODUCTION') {
                Arreter 'Phrase incorrecte. Rien n’a été écrit.'
            }
            node scripts/staging-schema.mjs --apply
            if ($LASTEXITCODE -ne 0) { Arreter 'Application en échec.' }
            Ok 'base de production à jour'
        } finally { Pop-Location }
    } finally {
        Remove-Item Env:TURSO_AUTH_TOKEN    -ErrorAction SilentlyContinue
        Remove-Item Env:TURSO_DATABASE_URL  -ErrorAction SilentlyContinue
        Remove-Item Env:TURSO_EXPECTED_HOST -ErrorAction SilentlyContinue
        Remove-Item Env:DAVAR_SCHEMA_TARGET -ErrorAction SilentlyContinue
    }
}

# --------------------------------------------------------------------------- #
# 3. DÉPLOIEMENT DU WORKER
# --------------------------------------------------------------------------- #
function Etape-Deploiement {
    Etape '3. Publication du Worker public'

    $r = Demander-Reglages
    if (-not $r.hoteTurso) { Arreter 'Hôte Turso introuvable dans .env.local' }

    Write-Host "  Travailleur : $TRAVAILLEUR" -ForegroundColor DarkGray
    Write-Host "  Base        : $($r.hoteTurso)" -ForegroundColor DarkGray
    Write-Host "  Adresse     : $($r.origine)" -ForegroundColor DarkGray

    $env:DAVAR_DEPLOY_TARGET     = 'production'
    $env:DAVAR_PRODUCTION_DB_HOST = $r.hoteTurso
    $env:DAVAR_PUBLIC_ORIGIN      = $r.origine

    Push-Location $racine
    try {
        Etape 'Construction à blanc (rien n’est envoyé)'
        npx cf deploy --dry-run
        if ($LASTEXITCODE -ne 0) { Arreter 'La construction échoue. Rien n’a été publié.' }

        Etape 'Publication réelle'
        npx cf deploy
        if ($LASTEXITCODE -ne 0) { Arreter 'La publication a échoué.' }
        Ok "campus publié : $($r.origine)"
    } finally {
        Pop-Location
        Remove-Item Env:DAVAR_DEPLOY_TARGET      -ErrorAction SilentlyContinue
        Remove-Item Env:DAVAR_PRODUCTION_DB_HOST -ErrorAction SilentlyContinue
        Remove-Item Env:DAVAR_PUBLIC_ORIGIN      -ErrorAction SilentlyContinue
    }
}

# --------------------------------------------------------------------------- #
# 4. LES SECRETS
# --------------------------------------------------------------------------- #
function Etape-Secrets {
    Etape '4. Envoi de vos clés à Cloudflare'

    # Le corps est fabriqué par un script Node TESTÉ : la ligne de commande
    # Cloudflare accepte un corps mal formé et répond « succès » sans rien
    # appliquer. On ne prend pas ce risque.
    $dossier = Join-Path ([System.IO.Path]::GetTempPath()) ('davar-secrets-' + [System.Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $dossier -Force | Out-Null
    $corps = Join-Path $dossier 'corps.json'

    try {
        Push-Location $racine
        try {
            node scripts/preparer-secrets.mjs --production --out $corps
            if ($LASTEXITCODE -ne 0) { Arreter 'Aucun secret à envoyer.' }
        } finally { Pop-Location }

        Write-Host ''
        Write-Host '  Envoi…' -ForegroundColor DarkGray
        # --body @fichier : les valeurs ne passent pas par la ligne de commande.
        # Surtout PAS --file (il envoie le corps en octet-stream : l’API ne lit
        # rien, et la commande répond 200 sans rien changer).
        Push-Location $racine
        try {
            npx cf workers secrets bulk --worker $TRAVAILLEUR --body "@$corps"
            if ($LASTEXITCODE -ne 0) { Arreter 'L’envoi a échoué. Vos valeurs n’ont pas quitté votre machine.' }
        } finally { Pop-Location }
        Ok 'clés envoyées et chiffrées par Cloudflare'
    } finally {
        # Le fichier contenait vos secrets : il ne doit pas survivre.
        Remove-Item -LiteralPath $dossier -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host '  Fichier temporaire supprimé.' -ForegroundColor DarkGray
    }

    Write-Host ''
    Write-Host '  Rappel : modifier un secret REPUBLIE le Worker.' -ForegroundColor Yellow
    Write-Host '  Après un changement, relancez : .\scripts\DEPLOYER.ps1 -Etape Recette' -ForegroundColor DarkGray
}

# --------------------------------------------------------------------------- #
# 5. RECETTE
# --------------------------------------------------------------------------- #
function Etape-Recette {
    Etape '5. Recette des services'
    Push-Location $racine
    try {
        npm run recette:services
    } finally { Pop-Location }
    Write-Host ''
    Write-Host '  Copiez cette sortie et envoyez-la : elle ne contient aucun secret.' -ForegroundColor Cyan
}

# --------------------------------------------------------------------------- #
# Menu
# --------------------------------------------------------------------------- #
function Afficher-Menu {
    Write-Host ''
    Write-Host '  DAVAR CAMPUS — tout faire depuis ici' -ForegroundColor Yellow
    Write-Host ''
    Write-Host '   1. Verification   tout est prêt ?'
    Write-Host '   2. Schema         créer les tables sur la base de production'
    Write-Host '   3. Deploiement    publier le campus'
    Write-Host '   4. Secrets        envoyer vos clés à Cloudflare'
    Write-Host '   5. Recette        vérifier les cinq services'
    Write-Host '   6. Tout           enchaîner 1 → 5'
    Write-Host '   0. Quitter'
    Write-Host ''
}

if (-not (Test-Path (Join-Path $racine 'package.json'))) {
    Arreter "Lancez ce script depuis le dossier davar-app (ici : $racine)."
}

if ($Etape -eq 'Menu') {
    Afficher-Menu
    $choix = (Read-Host '  Votre choix').Trim()
    $Etape = switch ($choix) {
        '1' { 'Verification' }
        '2' { 'Schema' }
        '3' { 'Deploiement' }
        '4' { 'Secrets' }
        '5' { 'Recette' }
        '6' { 'Tout' }
        default { 'Quitter' }
    }
}

switch ($Etape) {
    'Verification' { Etape-Verification }
    'Schema'       { Etape-Schema }
    'Deploiement'  { Etape-Deploiement }
    'Secrets'      { Etape-Secrets }
    'Recette'      { Etape-Recette }
    'Tout'         { Etape-Verification; Etape-Schema; Etape-Deploiement; Etape-Secrets; Etape-Recette }
    default        { Write-Host '  À bientôt.' -ForegroundColor DarkGray }
}

Write-Host ''
