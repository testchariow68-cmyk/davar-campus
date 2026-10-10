<#
.SYNOPSIS
    Deploie et entretient le campus DAVAR depuis PowerShell.
.DESCRIPTION
    Cinq etapes, dans cet ordre la premiere fois :

      1. Verification  - est-ce que tout est pret ?
      2. Schema        - cree les 49 tables sur la base Turso de PRODUCTION
      3. Deploiement   - publie le Worker public sur Cloudflare
      4. Secrets       - envoie vos cles a Cloudflare, chiffrees
      5. Recette       - interroge les cinq services et dit ce qui repond

    Votre sous-domaine est memorise dans .deploy-local.txt :
    vous ne le tapez qu'une seule fois.

    SECURITE : vos valeurs ne sont jamais affichees et ne passent jamais par la
    ligne de commande. Elles sont lues dans .env.local, puis envoyees dans un
    fichier temporaire supprime aussitot apres.

    NOTE : ce fichier est volontairement ecrit SANS ACCENT (ASCII pur).
    Windows PowerShell 5.1 lit un fichier .ps1 en UTF-8 sans BOM comme de
    l'ANSI, ce qui declenche ? Accolade fermante manquante ? des la premiere
    ligne de fonction. En ASCII pur, aucune ambiguite de lecture n'est possible.
.EXAMPLE
    .\scripts\DEPLOYER.ps1
    .\scripts\DEPLOYER.ps1 -Etape Tout
    .\scripts\DEPLOYER.ps1 -Etape Schema -Appliquer
#>
[CmdletBinding()]
param(
    [ValidateSet('Menu', 'Verification', 'Schema', 'Deploiement', 'Secrets', 'Recette', 'Tout')]
    [string]$Etape = 'Menu',

    # Autorise l'ECRITURE sur la base de production (etape Schema)
    [switch]$Appliquer
)

$ErrorActionPreference = 'Stop'

$TRAVAILLEUR = 'davar-campus-production-2026'
$racine      = Split-Path -Parent $PSScriptRoot
$envLocal    = Join-Path $racine '.env.local'
$reglages    = Join-Path $racine '.deploy-local.txt'
$PHRASE      = 'APPLIQUER DAVAR PRODUCTION'

function Dire([string]$Message, [string]$Couleur = 'White') {
    Write-Host $Message -ForegroundColor $Couleur
}
function Etape([string]$Message) {
    Write-Host ''
    Write-Host '==> ' $Message -ForegroundColor Cyan
}
function Ok([string]$Message) {
    Write-Host '  ok   ' $Message -ForegroundColor Green
}
function Echec([string]$Message) {
    Write-Host '  NON  ' $Message -ForegroundColor Red
}
function Arreter([string]$Message) {
    Write-Host ''
    Write-Host 'ARRET : ' $Message -ForegroundColor Red
    exit 1
}

# --------------------------------------------------------------------------- #
# Lecture de .env.local : aucune valeur n'est jamais affichee
# --------------------------------------------------------------------------- #
function Lire-Valeur([string]$Cle) {
    if (-not (Test-Path $envLocal)) { return '' }
    $trouve = ''
    foreach ($ligne in Get-Content $envLocal) {
        $l = $ligne.Trim()
        if ($l -eq '') { continue }
        if ($l.StartsWith('#')) { continue }
        $i = $l.IndexOf('=')
        if ($i -le 0) { continue }
        if ($l.Substring(0, $i).Trim() -eq $Cle) {
            $trouve = $l.Substring($i + 1).Trim()
            $trouve = $trouve.Trim([char]34)
            $trouve = $trouve.Trim([char]39)
        }
    }
    return $trouve
}

# --------------------------------------------------------------------------- #
# Le sous-domaine : demande une seule fois, memorise dans un simple fichier texte
# --------------------------------------------------------------------------- #
function Get-SousDomaine {
    $valeur = ''
    if (Test-Path $reglages) {
        $valeur = (Get-Content $reglages -Raw)
        if ($null -ne $valeur) { $valeur = $valeur.Trim() }
    }
    if ($valeur -eq '') {
        Write-Host ''
        Dire '  Une seule information a donner, une seule fois :' 'Yellow'
        Dire '  Cloudflare -> Workers et Pages -> colonne de droite' 'DarkGray'
        Dire '  -> "sous-domaine *.workers.dev"' 'DarkGray'
        $valeur = (Read-Host '  Votre sous-domaine').Trim()
        $valeur = $valeur.Trim('.')
        if ($valeur -eq '') { Arreter 'Sous-domaine vide. Relancez.' }
        Set-Content -Path $reglages -Value $valeur -Encoding ASCII
        Ok 'sous-domaine memorise'
    }
    return $valeur
}

# --------------------------------------------------------------------------- #
# 1. VERIFICATION
# --------------------------------------------------------------------------- #
function Etape-Verification {
    Etape '1. Verification'

    $brut = (node --version)
    if ($LASTEXITCODE -ne 0) { Arreter 'Node.js ne repond pas. Installez-le : https://nodejs.org' }
    $version = $brut -replace '^v', ''
    $majeur = ($version -split '\.')[0]
    if ([int]$majeur -lt 22) {
        Echec "Node.js $version : il faut 22.18 ou plus (https://nodejs.org)"
        Arreter 'Mettez Node.js a jour, puis relancez.'
    }
    Ok "Node.js $version"

    if (-not (Test-Path $envLocal)) {
        Arreter "Il manque .env.local dans $racine . Lancez : npm run env:local"
    }
    Ok '.env.local present'

    $cles = @('TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN', 'MAIL_APPS_SCRIPT_URL', 'MAIL_APPS_SCRIPT_TOKEN', 'R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET')
    $vides = @()
    foreach ($cle in $cles) {
        $v = Lire-Valeur $cle
        if ($v -eq '') { $vides = $vides + $cle }
    }
    if ($vides.Count -gt 0) {
        Echec "encore vide : $($vides -join ', ')"
        Dire '         (Chariow peut rester vide : on le branchera apres la mise en ligne.)' 'DarkGray'
    } else {
        Ok 'les valeurs essentielles sont renseignees'
    }

    Etape 'Repetition de la migration (sur une copie, jamais sur votre base)'
    Push-Location $racine
    npm run rehearsal:staging
    $code = $LASTEXITCODE
    Pop-Location
    if ($code -ne 0) { Arreter 'La repetition echoue. Ne touchez pas a la production.' }

    Etape 'Tests'
    Push-Location $racine
    npm test
    $code = $LASTEXITCODE
    Pop-Location
    if ($code -ne 0) { Arreter 'Des tests echouent. Ne deployez pas : signalez-le.' }
    Ok 'tests verts'
}

# --------------------------------------------------------------------------- #
# 2. SCHEMA DE LA BASE DE PRODUCTION
# --------------------------------------------------------------------------- #
function Etape-Schema {
    Etape '2. Schema de la base de PRODUCTION'

    $url = Lire-Valeur 'TURSO_DATABASE_URL'
    $jeton = Lire-Valeur 'TURSO_AUTH_TOKEN'
    if ($url -eq '') { Arreter 'TURSO_DATABASE_URL est vide dans .env.local' }
    if ($jeton -eq '') { Arreter 'TURSO_AUTH_TOKEN est vide dans .env.local' }

    if (-not $url.StartsWith('libsql://')) {
        Arreter 'TURSO_DATABASE_URL doit commencer par libsql://'
    }
    if ($url -match '(?i)staging') {
        Arreter 'Cette base est une base de RECETTE. Deploiement refuse.'
    }
    $hote = $url -replace '^libsql://', ''
    $hote = ($hote -split '/')[0]
    if (-not $hote.EndsWith('.turso.io')) {
        Arreter "Hote inattendu : $hote"
    }

    $env:APP_ENV = 'production'
    $env:DAVAR_SCHEMA_TARGET = 'production'
    $env:TURSO_DATABASE_URL = $url
    $env:TURSO_AUTH_TOKEN = $jeton
    $env:TURSO_EXPECTED_HOST = $hote

    Push-Location $racine
    Dire '  Inspection d abord (aucune ecriture)...' 'DarkGray'
    node scripts/staging-schema.mjs --inspect
    $code = $LASTEXITCODE

    if ($code -eq 0) {
        if ($Appliquer) {
            Write-Host ''
            Dire '  Vous allez ecrire dans la base de PRODUCTION.' 'Red'
            $confirmation = (Read-Host "  Tapez exactement: $PHRASE").Trim()
            if ($confirmation -cne $PHRASE) {
                Pop-Location
                Remove-Item Env:TURSO_AUTH_TOKEN -ErrorAction SilentlyContinue
                Remove-Item Env:TURSO_DATABASE_URL -ErrorAction SilentlyContinue
                Remove-Item Env:TURSO_EXPECTED_HOST -ErrorAction SilentlyContinue
                Remove-Item Env:DAVAR_SCHEMA_TARGET -ErrorAction SilentlyContinue
                Arreter 'Phrase incorrecte. Rien n a ete ecrit.'
            }
            node scripts/staging-schema.mjs --apply
            $code = $LASTEXITCODE
            if ($code -eq 0) { Ok 'base de production a jour' }
        } else {
            Write-Host ''
            Dire '  Inspection terminee. Pour APPLIQUER, relancez :' 'Yellow'
            Dire '    .\scripts\DEPLOYER.ps1 -Etape Schema -Appliquer' 'Cyan'
        }
    }
    Pop-Location

    Remove-Item Env:TURSO_AUTH_TOKEN -ErrorAction SilentlyContinue
    Remove-Item Env:TURSO_DATABASE_URL -ErrorAction SilentlyContinue
    Remove-Item Env:TURSO_EXPECTED_HOST -ErrorAction SilentlyContinue
    Remove-Item Env:DAVAR_SCHEMA_TARGET -ErrorAction SilentlyContinue
    Remove-Item Env:APP_ENV -ErrorAction SilentlyContinue

    if ($code -ne 0) { Arreter 'Etape Schema en echec.' }
}

# --------------------------------------------------------------------------- #
# 3. DEPLOIEMENT DU WORKER
# --------------------------------------------------------------------------- #
function Etape-Deploiement {
    Etape '3. Publication du Worker public'

    $sousDomaine = Get-SousDomaine
    $url = Lire-Valeur 'TURSO_DATABASE_URL'
    $hote = $url -replace '^libsql://', ''
    $hote = ($hote -split '/')[0]
    if ($hote -eq '') { Arreter 'Hote Turso introuvable dans .env.local' }
    $origine = "https://$TRAVAILLEUR.$sousDomaine.workers.dev"

    Dire "  Travailleur : $TRAVAILLEUR" 'DarkGray'
    Dire "  Base        : $hote" 'DarkGray'
    Dire "  Adresse     : $origine" 'DarkGray'

    $env:DAVAR_DEPLOY_TARGET = 'production'
    $env:DAVAR_PRODUCTION_DB_HOST = $hote
    $env:DAVAR_PUBLIC_ORIGIN = $origine

    Push-Location $racine
    Etape 'Construction a blanc (rien n est envoye)'
    npx cf deploy --dry-run
    $code = $LASTEXITCODE
    if ($code -eq 0) {
        Etape 'Publication reelle'
        npx cf deploy
        $code = $LASTEXITCODE
    }
    Pop-Location

    Remove-Item Env:DAVAR_DEPLOY_TARGET -ErrorAction SilentlyContinue
    Remove-Item Env:DAVAR_PRODUCTION_DB_HOST -ErrorAction SilentlyContinue
    Remove-Item Env:DAVAR_PUBLIC_ORIGIN -ErrorAction SilentlyContinue

    if ($code -ne 0) { Arreter 'La publication a echoue.' }
    Ok "campus publie : $origine"
    Write-Host ''
    Dire "  NOTEZ CETTE ADRESSE dans votre fiche : $origine" 'Yellow'
}

# --------------------------------------------------------------------------- #
# 4. LES SECRETS
# --------------------------------------------------------------------------- #
function Etape-Secrets {
    Etape '4. Envoi de vos cles a Cloudflare'

    $dossier = Join-Path ([System.IO.Path]::GetTempPath()) ('davar-secrets-' + [System.Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $dossier -Force | Out-Null
    $corps = Join-Path $dossier 'corps.json'

    Push-Location $racine
    node scripts/preparer-secrets.mjs --production --out $corps
    $code = $LASTEXITCODE
    Pop-Location

    if ($code -ne 0) {
        Remove-Item -LiteralPath $dossier -Recurse -Force -ErrorAction SilentlyContinue
        Arreter 'Aucun secret a envoyer.'
    }

    Write-Host ''
    Dire '  Envoi...' 'DarkGray'
    Push-Location $racine
    npx cf workers secrets bulk --worker $TRAVAILLEUR --body "@$corps"
    $code = $LASTEXITCODE
    Pop-Location

    Remove-Item -LiteralPath $dossier -Recurse -Force -ErrorAction SilentlyContinue
    Dire '  Fichier temporaire supprime.' 'DarkGray'

    if ($code -ne 0) {
        Arreter 'L envoi a echoue. Vos valeurs n ont pas quitte votre machine.'
    }
    Ok 'cles envoyees et chiffrees par Cloudflare'
    Write-Host ''
    Dire '  Rappel : modifier un secret REPUBLIE le Worker.' 'Yellow'
    Dire '  Apres un changement : .\scripts\DEPLOYER.ps1 -Etape Recette' 'DarkGray'
}

# --------------------------------------------------------------------------- #
# 5. RECETTE
# --------------------------------------------------------------------------- #
function Etape-Recette {
    Etape '5. Recette des services'
    Push-Location $racine
    npm run recette:services
    Pop-Location
    Write-Host ''
    Dire '  Copiez cette sortie et envoyez-la : elle ne contient aucun secret.' 'Cyan'
}

# --------------------------------------------------------------------------- #
# Menu
# --------------------------------------------------------------------------- #
function Afficher-Menu {
    Write-Host ''
    Dire '  DAVAR CAMPUS - tout faire depuis ici' 'Yellow'
    Write-Host ''
    Write-Host '   1. Verification   tout est pret ?'
    Write-Host '   2. Schema         creer les tables sur la base de production'
    Write-Host '   3. Deploiement    publier le campus'
    Write-Host '   4. Secrets        envoyer vos cles a Cloudflare'
    Write-Host '   5. Recette        verifier les cinq services'
    Write-Host '   6. Tout           enchainer 1 -> 5'
    Write-Host '   0. Quitter'
    Write-Host ''
}

if (-not (Test-Path (Join-Path $racine 'package.json'))) {
    Arreter "Lancez ce script depuis le dossier davar-app (ici : $racine)."
}

if ($Etape -eq 'Menu') {
    Afficher-Menu
    $choix = (Read-Host '  Votre choix').Trim()
    if ($choix -eq '1') { $Etape = 'Verification' }
    elseif ($choix -eq '2') { $Etape = 'Schema' }
    elseif ($choix -eq '3') { $Etape = 'Deploiement' }
    elseif ($choix -eq '4') { $Etape = 'Secrets' }
    elseif ($choix -eq '5') { $Etape = 'Recette' }
    elseif ($choix -eq '6') { $Etape = 'Tout' }
    else { $Etape = 'Quitter' }
}

if ($Etape -eq 'Verification') { Etape-Verification }
elseif ($Etape -eq 'Schema') { Etape-Schema }
elseif ($Etape -eq 'Deploiement') { Etape-Deploiement }
elseif ($Etape -eq 'Secrets') { Etape-Secrets }
elseif ($Etape -eq 'Recette') { Etape-Recette }
elseif ($Etape -eq 'Tout') {
    Etape-Verification
    Etape-Schema
    Etape-Deploiement
    Etape-Secrets
    Etape-Recette
}
else {
    Dire '  A bientot.' 'DarkGray'
}

Write-Host ''
