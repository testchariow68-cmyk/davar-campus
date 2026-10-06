# Correctif LOCAL seulement : aucune commande Cloudflare, Turso ou npm.
# Refuse de remplacer un fichier modifié, conserve une copie avant changement.
$ErrorActionPreference = 'Stop'
$project = Join-Path $env:USERPROFILE 'Downloads\davar-app-deploiement-prive'
$source = Join-Path $PSScriptRoot 'cloudflare.config.ts'
$target = Join-Path $project 'cloudflare.config.ts'
$backup = Join-Path $project 'cloudflare.config.ts.before-free-staging.bak'
$oldHash = 'dd80b35bcde44fba98e95b0e1c2ea86ebbd811c710ab100d0e8dbdbdad824668'
$newHash = '2e1324d1db59df351c5f857e7575a1ff83bb8b501e0ad1fc9de42d35516ce992'
if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {throw 'Correctif introuvable dans ce kit.'}
if (-not (Test-Path -LiteralPath $target -PathType Leaf)) {throw 'Projet DAVAR introuvable au chemin prévu.'}
if ((Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLowerInvariant() -ne $newHash) {throw 'Correctif modifié : arrêt.'}
$actual = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actual -eq $newHash) {Write-Host 'Configuration déjà mise à jour ; aucune modification.'; return}
if ($actual -ne $oldHash) {throw 'Configuration actuelle inattendue : arrêt, aucun fichier écrasé.'}
if (Test-Path -LiteralPath $backup) {throw 'Sauvegarde déjà présente : arrêt, aucun fichier écrasé.'}
Copy-Item -LiteralPath $target -Destination $backup -ErrorAction Stop
Copy-Item -LiteralPath $source -Destination $target -ErrorAction Stop
if ((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant() -ne $newHash) {
    throw 'Copie à vérifier ; sauvegarde locale conservée. Ne pas déployer.'
}
Write-Host 'Configuration locale staging mise à jour ; ancienne version sauvegardée.'
Write-Host 'AUCUN déploiement et AUCUNE modification Turso.'
