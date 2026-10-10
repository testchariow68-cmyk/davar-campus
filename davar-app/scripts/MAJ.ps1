<#
.SYNOPSIS
    Le bouton « Maj » : met le campus à jour depuis GitHub sans rien perdre.
.DESCRIPTION
    Télécharge la dernière version de la branche et remplace les fichiers du
    projet, en PRÉSERVANT ce qui vous appartient :

      * .env.local     — toutes vos valeurs. Le fichier le plus précieux.
      * dev-data\      — votre base locale de travail.
      * node_modules\  — pour ne pas tout retélécharger à chaque fois.

    Puis réinstalle les dépendances et lance les tests.

    Vous n'avez rien à copier, rien à renommer, rien à déplacer.
.EXAMPLE
    .\scripts\MAJ.ps1
.EXAMPLE
    .\scripts\MAJ.ps1 -SansTest
#>
[CmdletBinding()]
param(
    # Saute les tests à la fin (déconseillé : ils sont la preuve que tout va bien)
    [switch]$SansTest
)

$ErrorActionPreference = 'Stop'

$DEPOT   = 'testchariow68-cmyk/davar-campus'
$BRANCHE = 'arena/09f3da07-davar-campus'
$URL_ZIP = "https://github.com/$DEPOT/archive/refs/heads/$BRANCHE.zip"

# Le projet est le parent de ce script : scripts\ -> davar-app\
$racine   = Split-Path -Parent $PSScriptRoot
$envLocal = Join-Path $racine '.env.local'

function Dire([string]$Message, [string]$Couleur = 'White') {
    Write-Host $Message -ForegroundColor $Couleur
}
function Etape([string]$Message) {
    Write-Host ''
    Write-Host "==> $Message" -ForegroundColor Cyan
}
function Arreter([string]$Message) {
    Write-Host ''
    Write-Host "ARRET : $Message" -ForegroundColor Red
    exit 1
}

# --------------------------------------------------------------------------- #
# 0. Être sûr d'être au bon endroit
# --------------------------------------------------------------------------- #
if (-not (Test-Path (Join-Path $racine 'package.json'))) {
    Arreter "package.json est introuvable dans « $racine ». Lancez ce script depuis le dossier davar-app."
}

Dire ''
Dire '  DAVAR CAMPUS — mise à jour' -Couleur 'Yellow'
Dire "  Dossier : $racine"
Dire "  Branche : $BRANCHE"

# --------------------------------------------------------------------------- #
# 1. Sauvegarde de .env.local — avant TOUTE chose
# --------------------------------------------------------------------------- #
Etape 'Sauvegarde de vos valeurs'
if (-not (Test-Path $envLocal)) {
    Write-Host '  (aucun .env.local : rien à sauvegarder. npm run env:local le créera plus tard.)' -ForegroundColor DarkGray
    $sauvegarde = $null
} else {
    $horodatage = Get-Date -Format 'yyyyMMdd-HHmmss'
    $sauvegarde = Join-Path $racine ".env.local.sauvegarde-$horodatage"
    Copy-Item $envLocal $sauvegarde -Force
    Dire "  Copie de secours : $(Split-Path $sauvegarde -Leaf)" -Couleur 'Green'
}

# --------------------------------------------------------------------------- #
# 2. Téléchargement
# --------------------------------------------------------------------------- #
Etape 'Téléchargement de la dernière version'
$temporaire = Join-Path ([System.IO.Path]::GetTempPath()) ("davar-maj-" + [System.Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temporaire -Force | Out-Null
$zip = Join-Path $temporaire 'maj.zip'

try {
    # TLS 1.2 : sans cela, GitHub refuse parfois la connexion sur Windows.
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Write-Host '  Téléchargement en cours (≈ 26 Mo)…' -ForegroundColor DarkGray
    Invoke-WebRequest -Uri $URL_ZIP -OutFile $zip -UseBasicParsing
    Dire "  Téléchargé : $([math]::Round((Get-Item $zip).Length / 1MB, 1)) Mo" -Couleur 'Green'

    # ----------------------------------------------------------------------- #
    # 3. Extraction
    # ----------------------------------------------------------------------- #
    Etape 'Décompression'
    Expand-Archive -LiteralPath $zip -DestinationPath $temporaire -Force
    $extrait = Get-ChildItem -Path $temporaire -Directory | Where-Object { $_.Name -like 'davar-campus-*' } | Select-Object -First 1
    if (-not $extrait) { Arreter "Impossible de trouver le dossier extrait dans $temporaire." }
    $source = Join-Path $extrait.FullName 'davar-app'
    if (-not (Test-Path $source)) { Arreter "Le dossier davar-app est introuvable dans l'archive." }

    # ----------------------------------------------------------------------- #
    # 4. Remplacement — en préservant ce qui est à vous
    # ----------------------------------------------------------------------- #
    Etape 'Remplacement des fichiers (vos valeurs sont préservées)'
    $journal = Join-Path $temporaire 'robocopy.log'
    # /MIR : met la destination au miroir de la source.
    # /XD  : dossiers JAMAIS touchés. /XF : fichiers JAMAIS touchés.
    $arguments = @(
        "`"$source`"", "`"$racine`"", '/MIR',
        '/XD', 'node_modules', 'dev-data', '.git', '.next', '.vinext', '.cloudflare',
        '/XF', '.env.local', '.env.local.*', '.deploy-local.json',
        '/NFL', '/NDL', '/NJH', '/NJS', '/NP', "/LOG:`"$journal`""
    )
    $code = (Start-Process -FilePath 'robocopy.exe' -ArgumentList $arguments -Wait -PassThru -NoNewWindow).ExitCode
    # robocopy : 0 à 7 signifient « réussi » (1 = fichiers copiés, etc.).
    if ($code -ge 8) {
        Write-Host (Get-Content $journal -Tail 20 -ErrorAction SilentlyContinue) -ForegroundColor Red
        Arreter "robocopy a échoué (code $code). Vos fichiers n'ont pas été modifiés."
    }
    Dire '  Fichiers à jour.' -Couleur 'Green'

    # ----------------------------------------------------------------------- #
    # 5. Vérification que vos valeurs sont toujours là
    # ----------------------------------------------------------------------- #
    Etape 'Contrôle de vos valeurs'
    if ($sauvegarde) {
        if (-not (Test-Path $envLocal)) {
            Copy-Item $sauvegarde $envLocal -Force
            Dire '  .env.local restauré depuis la sauvegarde.' -Couleur 'Yellow'
        } else {
            Dire '  .env.local est intact.' -Couleur 'Green'
        }
    }

    # ----------------------------------------------------------------------- #
    # 6. Dépendances
    # ----------------------------------------------------------------------- #
    Etape 'Installation des dépendances (patience)'
    Push-Location $racine
    try {
        npm install
        if ($LASTEXITCODE -ne 0) { Arreter 'npm install a échoué.' }
    } finally {
        Pop-Location
    }

    # ----------------------------------------------------------------------- #
    # 7. Preuve que tout va bien
    # ----------------------------------------------------------------------- #
    if (-not $SansTest) {
        Etape 'Tests'
        Push-Location $racine
        try {
            npm test
            if ($LASTEXITCODE -ne 0) { Arreter 'Des tests échouent. Ne déployez pas : signalez-le.' }
        } finally {
            Pop-Location
        }
    }
} finally {
    # Le dossier temporaire contient une copie du projet : on le supprime.
    Remove-Item -LiteralPath $temporaire -Recurse -Force -ErrorAction SilentlyContinue
}

Dire ''
Dire '  MISE À JOUR TERMINÉE.' -Couleur 'Green'
if ($sauvegarde) { Dire "  Votre copie de secours : $(Split-Path $sauvegarde -Leaf)" -Couleur 'DarkGray' }
Dire ''
Dire '  Ensuite :  .\scripts\DEPLOYER.ps1' -Couleur 'Cyan'
Dire ''
