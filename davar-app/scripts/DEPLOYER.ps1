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
    l'ANSI, ce qui declenche "Accolade fermante manquante" des la premiere
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
$schemaApplique = $false   # vrai seulement si les tables ont reellement ete ecrites
$cfConnecte   = $false   # vrai des que "cf auth whoami" repond

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
function Get-SousDomaineParDefaut {
    # Votre sous-domaine *.workers.dev est deja ecrit noir sur blanc dans la
    # configuration : c est celui du Worker de recette, qui appartient au meme
    # compte Cloudflare que la production. On le lit, plutot que de demander au
    # proprietaire d aller le chercher dans un tableau de bord.
    $config = Join-Path $racine 'cloudflare.config.ts'
    if (-not (Test-Path $config)) { return '' }
    $texte = Get-Content $config -Raw
    $trouve = [regex]::Match($texte, "STAGING_ORIGIN\s*=\s*'https://[^']*?\.([A-Za-z0-9-]+)\.workers\.dev'")
    if ($trouve.Success) { return $trouve.Groups[1].Value }
    return ''
}

function Invoke-Externe {
    param(
        [Parameter(Mandatory = $true)][string]$Programme,
        [string[]]$Parametres = @(),
        [switch]$Silencieux
    )
    # Windows PowerShell 5.1 transforme la moindre ligne ecrite sur la sortie
    # d erreur par un programme externe en erreur FATALE des que
    # $ErrorActionPreference vaut Stop. Or npm, npx et node ecrivent leurs
    # simples "notice" sur cette sortie : sans ce garde-fou, un message
    # parfaitement anodin interrompt le deploiement et fait croire a un echec.
    # On baisse donc la garde le temps de l appel, puis on rend le CODE DE
    # SORTIE : c est lui seul qui dit si l operation a reussi.
    $ancien = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        if ($Silencieux) {
            $lignes = & $Programme @Parametres 2>&1
            $script:derniereSortie = ($lignes | Out-String).Trim()
        } else {
            & $Programme @Parametres 2>&1 | Out-Host
        }
        return $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $ancien
    }
}

function Assurer-Connexion {
    if ($script:cfConnecte) { return }
    Etape 'Connexion a Cloudflare'
    Push-Location $racine
    $code = Invoke-Externe 'npx' @('cf', 'auth', 'whoami') -Silencieux
    $sortie = $script:derniereSortie
    if ($code -ne 0) {
        Write-Host ''
        Dire '  Il faut vous connecter a Cloudflare une seule fois.' 'Yellow'
        Dire '  Une fenetre de navigateur va s ouvrir : connectez-vous,' 'Yellow'
        Dire '  autorisez, puis revenez dans cette fenetre noire.' 'Yellow'
        Write-Host ''
        $code = Invoke-Externe 'npx' @('cf', 'auth', 'login')
        if ($code -ne 0) {
            Pop-Location
            Arreter 'Connexion impossible. Reessayez : npx cf auth login'
        }
        $code = Invoke-Externe 'npx' @('cf', 'auth', 'whoami') -Silencieux
        $sortie = $script:derniereSortie
        if ($code -ne 0) {
            Pop-Location
            Arreter 'La connexion n a pas ete retenue. Reessayez.'
        }
    }
    Pop-Location
    $script:cfConnecte = $true
    $compte = ($sortie | Out-String).Trim()
    if ($compte -ne '') { Dire "  $compte" 'DarkGray' }
    Ok 'connecte a Cloudflare'
}

function Normaliser-SousDomaine([string]$brut) {
    # Tolere tout ce que le proprietaire peut coller : le mot seul
    # ("davaracademie"), l hote ("davaracademie.workers.dev") ou l adresse
    # entiere d un Worker (? https://davar-campus-production-2026.davaracademie
    # .workers.dev"). Le sous-domaine *.workers.dev est toujours UN SEUL mot :
    # on garde donc le dernier, ce qui corrige les deux autres formes.
    $v = $brut.Trim()
    $v = $v -replace '^https?://', ''
    $v = ($v -split '/')[0]
    $v = $v -replace '\.workers\.dev$', ''
    $v = $v.Trim('.')
    if ($v -match '\.') { $v = ($v -split '\.')[-1] }
    return $v.Trim()
}

function Get-SousDomaine {
    $valeur = ''
    $brut = ''
    if (Test-Path $reglages) {
        $lu = (Get-Content $reglages -Raw)
        if ($null -ne $lu) { $brut = $lu.Trim() }
    }
    if ($brut -ne '') {
        $valeur = Normaliser-SousDomaine $brut
        # Une valeur ancienne, ou collee en entier, est corrigee puis re-ecrite :
        # sans cela, une mauvaise valeur serait reutilisee a chaque lancement.
        if ($valeur -ne $brut) { Set-Content -Path $reglages -Value $valeur -Encoding ASCII }
    }
    if ($valeur -eq '' -or $valeur -match '[^A-Za-z0-9-]') { $valeur = '' }
    if ($valeur -eq '') {
        $defaut = Get-SousDomaineParDefaut
        Write-Host ''
        Dire '  Une seule information a donner, une seule fois :' 'Yellow'
        Dire '  votre sous-domaine *.workers.dev (Cloudflare ->' 'DarkGray'
        Dire '  Workers et Pages -> colonne de droite).' 'DarkGray'
        if ($defaut -ne '') {
            Dire "  Il a ete trouve dans votre configuration : $defaut" 'Cyan'
            $valeur = (Read-Host "  Entree pour le garder, ou tapez le votre").Trim()
            if ($valeur -eq '') { $valeur = $defaut }
        } else {
            $valeur = (Read-Host '  Votre sous-domaine').Trim()
        }
        $valeur = Normaliser-SousDomaine $valeur
        if ($valeur -eq '') { Arreter 'Sous-domaine vide. Relancez.' }
        Set-Content -Path $reglages -Value $valeur -Encoding ASCII
        Ok "sous-domaine memorise : $valeur"
    }
    return $valeur
}

# --------------------------------------------------------------------------- #
# 1. VERIFICATION
# --------------------------------------------------------------------------- #
function Etape-Verification {
    Etape '1. Verification'

    $code = Invoke-Externe 'node' @('--version') -Silencieux
    if ($code -ne 0) { Arreter 'Node.js ne repond pas. Installez-le : https://nodejs.org' }
    $brut = $script:derniereSortie
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
    $code = Invoke-Externe 'npm' @('run', 'rehearsal:staging')
    Pop-Location
    if ($code -ne 0) { Arreter 'La repetition echoue. Ne touchez pas a la production.' }

    Etape 'Tests'
    Push-Location $racine
    $code = Invoke-Externe 'npm' @('test')
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
    $code = Invoke-Externe 'node' @('scripts/staging-schema.mjs', '--inspect')

    if ($code -eq 0) {
        $faire = $Appliquer
        if (-not $faire) {
            Write-Host ''
            Dire '  Inspection terminee. Les 49 tables ne sont PAS encore creees.' 'Yellow'
            $reponse = (Read-Host '  Voulez-vous les creer maintenant ? (o/n)').Trim().ToLower()
            if ($reponse -eq 'o' -or $reponse -eq 'oui' -or $reponse -eq 'y') { $faire = $true }
        }
        if ($faire) {
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
            $code = Invoke-Externe 'node' @('scripts/staging-schema.mjs', '--apply')
            if ($code -eq 0) {
                Ok 'base de production a jour'
                $script:schemaApplique = $true
            }
        } else {
            Write-Host ''
            Dire '  Rien n a ete ecrit. Pour appliquer plus tard :' 'Yellow'
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

    Assurer-Connexion
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

    # Un Worker qui DECLARE des secrets ne peut pas etre cree sans les recevoir
    # en meme temps : Cloudflare refuse de creer le Worker sans eux, et refuse
    # aussi de poser un secret sur un Worker qui n existe pas encore. Le serpent
    # se mord la queue. --secrets-file le tranche : les valeurs partent avec la
    # publication, dans un fichier supprime juste apres.
    Etape 'Preparation de vos cles (fichier temporaire)'
    $secrets = Join-Path ([System.IO.Path]::GetTempPath()) ('davar-deploy-secrets-' + [System.Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $secrets -Force | Out-Null
    $fichierSecrets = Join-Path $secrets 'secrets.env'

    Push-Location $racine
    $code = Invoke-Externe 'node' @('scripts/preparer-secrets.mjs', '--production', '--format', 'env', '--out', $fichierSecrets)
    if ($code -ne 0) {
        Pop-Location
        Remove-Item -LiteralPath $secrets -Recurse -Force -ErrorAction SilentlyContinue
        Arreter 'Impossible de preparer vos cles. Rien n a ete publie.'
    }

    Etape 'Construction a blanc (rien n est envoye)'
    $code = Invoke-Externe 'npx' @('cf', 'deploy', '--dry-run', '--secrets-file', $fichierSecrets)
    if ($code -eq 0) {
        Etape 'Publication reelle'
        $code = Invoke-Externe 'npx' @('cf', 'deploy', '--secrets-file', $fichierSecrets)
    }
    Pop-Location

    Remove-Item -LiteralPath $secrets -Recurse -Force -ErrorAction SilentlyContinue
    Dire '  Fichier de cles temporaire supprime.' 'DarkGray'

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

    Assurer-Connexion

    $dossier = Join-Path ([System.IO.Path]::GetTempPath()) ('davar-secrets-' + [System.Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $dossier -Force | Out-Null
    $corps = Join-Path $dossier 'corps.json'

    Push-Location $racine
    $code = Invoke-Externe 'node' @('scripts/preparer-secrets.mjs', '--production', '--out', $corps)
    Pop-Location

    if ($code -ne 0) {
        Remove-Item -LiteralPath $dossier -Recurse -Force -ErrorAction SilentlyContinue
        Arreter 'Aucun secret a envoyer.'
    }

    Write-Host ''
    Dire '  Envoi...' 'DarkGray'
    Push-Location $racine
    $code = Invoke-Externe 'npx' @('cf', 'workers', 'secrets', 'bulk', '--worker', $TRAVAILLEUR, '--body', "@$corps")
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
    $null = Invoke-Externe 'npm' @('run', 'recette:services')
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
    # La connexion d abord : la fenetre du navigateur s ouvre tout de suite,
    # au lieu de vous attendre au bout de vingt minutes de tests.
    Assurer-Connexion
    Etape-Verification
    Etape-Schema
    # On ne publie JAMAIS un campus sur une base qui n a pas ses tables :
    # il serait en ligne mais vide, et l echec ne se verrait qu apres coup.
    if (-not $script:schemaApplique) {
        Write-Host ''
        Dire '  Les tables n ont pas ete creees : on s arrete AVANT de publier.' 'Red'
        Dire '  Relancez et repondez "o" a la question du schema.' 'Yellow'
        exit 1
    }
    Etape-Deploiement
    Etape-Secrets
    Etape-Recette
}
else {
    Dire '  A bientot.' 'DarkGray'
}

Write-Host ''
