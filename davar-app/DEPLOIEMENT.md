# Déploiement DAVAR Campus — Guide ÉTANCHE (v1)

> **Objectif** : mettre le campus en ligne tout seul, du début à la fin, sans
> revenir vers l'agent. Chaque commande est à copier-coller TELLE QUELLE.
>
> **Durée totale : environ 30 minutes** (vos valeurs sont déjà prêtes).
> **Coût : 0 FCFA.**
>
> Vous êtes sur **Windows PowerShell** (le fond bleu ou noir où l'on tape des
> commandes). Chaque fois que ce guide donne une commande, copiez-la entière,
> collez-la avec le clic droit, puis Entrée.
>
> ⚠️ **Votre nom d'utilisateur contient un espace** (`Conquérant 8`).
> Les guillemets sont donc **OBLIGATOIRES** dans chaque commande qui contient un
> chemin. C'est la cause d'erreur la plus fréquente.

---

## VOTRE FICHE — à remplir au fur et à mesure

Imprimez ou recopiez ce tableau ; vous en aurez besoin à chaque étape.

| Quoi | Où je le trouve | Ma valeur |
|---|---|---|
| URL de la base Turso (`libsql://...`) | déjà dans votre `.env.local` | ____________________ |
| Hôte de la base (le même, sans `libsql://`) | déjà dans votre `.env.local` | ____________________ |
| Votre sous-domaine `workers.dev` | Cloudflare → Workers et Pages → colonne de droite | ____________________ |
| Adresse du campus | Étape 4, affichée par la commande | ____________________ |
| URL du Pulse Chariow | Étape 7 (adresse du campus + `/api/chariow/pulse`) | ____________________ |

---

## Étape 1 — RÉCUPÉRER LE CODE

### Lien direct (si vous préférez cliquer)

```
https://github.com/testchariow68-cmyk/davar-campus/archive/refs/heads/arena/09f3da07-davar-campus.zip
```

### Variante AUTOMATIQUE — vous avez DÉJÀ un `.env.local` rempli

C'est votre cas. Copiez **tout le bloc ci-dessous** d'un seul coup, collez-le
dans PowerShell (clic droit), et appuyez sur Entrée. Il fait tout :

1. **retrouve votre `.env.local` rempli** où qu'il soit dans Téléchargements ou
   sur le Bureau, et en fait une sauvegarde sur votre Bureau ;
2. télécharge la dernière version et l'installe proprement dans
   `...\Davar\davar-app` (un chemin **sans espace**, pour éviter les pièges) ;
3. **remet vos valeurs** dans le nouveau dossier ;
4. installe les dépendances et ouvre le dossier.

```powershell
$ErrorActionPreference='Stop'
[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12

# 1. Retrouver votre .env.local rempli (le fichier le plus precieux)
$lieux = @("$HOME\Downloads","$HOME\Desktop","$HOME\Davar","$HOME\OneDrive\Bureau") | Where-Object { Test-Path $_ }
$fiche = Get-ChildItem -Path $lieux -Filter '.env.local' -Recurse -Depth 6 -Force -ErrorAction SilentlyContinue |
         Where-Object { $_.FullName -notlike '*\node_modules\*' } |
         Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($fiche) {
  Write-Host "Valeurs trouvees : $($fiche.FullName)" -ForegroundColor Green
  Copy-Item $fiche.FullName "$HOME\Desktop\env-local-sauvegarde.txt" -Force
  Write-Host "Sauvegarde faite sur votre Bureau (env-local-sauvegarde.txt)" -ForegroundColor Green
} else {
  Write-Host "Aucun .env.local trouve : il faudra le remplir (npm run env:local)" -ForegroundColor Yellow
}

# 2. Telecharger et installer
$base = "$HOME\Davar"
New-Item -ItemType Directory -Path $base -Force | Out-Null
$zip = Join-Path $env:TEMP 'davar.zip'
Write-Host 'Telechargement en cours (environ 26 Mo)...' -ForegroundColor Cyan
Invoke-WebRequest -Uri 'https://github.com/testchariow68-cmyk/davar-campus/archive/refs/heads/arena/09f3da07-davar-campus.zip' -OutFile $zip -UseBasicParsing
Expand-Archive -LiteralPath $zip -DestinationPath $base -Force

# 3. Ranger : on veut ...\Davar\davar-app, pas le nom d'archive a rallonge
$extrait = Get-ChildItem -Path $base -Directory -Filter 'davar-campus-*' | Select-Object -First 1
$cible = Join-Path $base 'davar-app'
if (Test-Path $cible) { Remove-Item $cible -Recurse -Force -ErrorAction SilentlyContinue }
Move-Item -LiteralPath (Join-Path $extrait.FullName 'davar-app') -Destination $cible -Force
Remove-Item -LiteralPath $extrait.FullName -Recurse -Force
Remove-Item $zip -Force

# 4. Remettre VOS valeurs
if ($fiche) { Copy-Item $fiche.FullName (Join-Path $cible '.env.local') -Force; Write-Host 'Vos valeurs sont en place.' -ForegroundColor Green }

# 5. Installer les dependances (2 a 3 minutes)
Set-Location $cible
npm install

Write-Host ''
Write-Host "PRET. Votre campus est dans : $cible" -ForegroundColor Green
Write-Host 'Double-cliquez DEPLOYER.bat dans ce dossier.' -ForegroundColor Cyan
explorer $cible
```

> **Le seul critère de réussite :** le message `PRET. Votre campus est dans : …`
> suivi de `Vos valeurs sont en place.` Le dossier s'ouvre tout seul.
>
> Si le bloc s'interrompt, **rien n'est perdu** : votre sauvegarde est sur votre
> Bureau, et votre ancien dossier n'a pas été touché.

### Sinon, à la main (si vous n'avez pas encore de `.env.local`)

Le code n'est pas encore sur votre ordinateur **avec les scripts de
déploiement**. Une seule fois, téléchargez-le :

```powershell
cd "$HOME\Downloads"
curl.exe -L -o davar.zip "https://github.com/testchariow68-cmyk/davar-campus/archive/refs/heads/arena/09f3da07-davar-campus.zip"
Expand-Archive davar.zip -DestinationPath "$HOME\Downloads\Davar" -Force
cd "$HOME\Downloads\Davar\davar-campus-arena-09f3da07-davar-campus\davar-app"
npm install
```

> **Vous avez déjà un `.env.local` rempli ?** Prenez la **variante
> automatique** ci-dessus : elle le retrouve toute seule et le conserve. Ne le
> recopiez jamais à la main.

Vérifiez que vous êtes au bon endroit :

```powershell
Get-Location
npm run
```

> **Le seul critère :** la liste des commandes doit contenir `env:local`,
> `recette:services` et `test`. Si vous ne les voyez pas, vous n'êtes pas dans
> `davar-app` — c'est le piège n°1.

---

## Étape 1 bis — LES OUTILS (une seule fois, 10 minutes)

```powershell
node --version
```

Si la réponse commence par `v22` ou plus → parfait.
Si « node n'est pas reconnu » → installez Node.js LTS : <https://nodejs.org>
→ installez (tout par défaut), puis **fermez et rouvrez PowerShell** et
revenez dans le dossier.

Puis connectez Cloudflare (une seule fois par machine) :

```powershell
npx cf auth login
```

→ le navigateur s'ouvre → « Allow ».
Vérifiez que c'est bon :

```powershell
npx cf auth whoami
```

> ⚠️ **N'installez pas `wrangler` ni `turso`.** Ce projet utilise un autre
> outil (`cf`), déjà fourni avec le code. Les installer créerait des
> conflits.

---

## Étape 2 — VOS VALEURS (déjà faites pour vous)

Votre fichier `davar-app\.env.local` est déjà rempli, sauf Chariow (on le
branche à l'étape 7). Vérifiez d'un coup d'œil :

```powershell
npm run recette:services
```

> Lisez la section **6. ASSISTANTS ET DICTÉE VOCALE** : elle doit dire
> « N moteur(s) branché(s) ». Les lignes Chariow en « attente » sont
> normales à ce stade.

---

## Étape 3 — LA BASE : créer les 49 tables (5 minutes)

Le campus a besoin de **49 tables**. On les crée sur votre base Turso, en deux
temps : d'abord on regarde, ensuite on écrit.

```powershell
.\scripts\DEPLOYER.ps1 -Etape Schema
```

Le script affiche ce qu'il va faire, **sans rien écrire**. Puis :

```powershell
.\scripts\DEPLOYER.ps1 -Etape Schema -Appliquer
```

Il vous demandera de taper exactement :

```
APPLIQUER DAVAR PRODUCTION
```

> **Le seul critère de réussite :** la ligne `base de production a jour` (sans accent : le script est en ASCII).
>
> Le script **refuse** de continuer si votre base contient le mot « staging »
> (c'est une base de recette, jamais la production) ou si l'URL ne commence pas
> par `libsql://`. S'il refuse, c'est une protection qui fonctionne.

> **Vous ne créez aucune table à la main** : les 16 migrations le font, dans
> l'ordre, et chacune est vérifiée.

---

## Étape 4 — PUBLIER LE CAMPUS (10 minutes)

```powershell
.\scripts\DEPLOYER.ps1 -Etape Deploiement
```

Le script vous demande **une seule information, une seule fois** : votre
sous-domaine `workers.dev` (Cloudflare → Workers et Pages → colonne de droite).
Il est mémorisé ensuite dans `.deploy-local.txt`, à la racine du projet (jamais dans Git).

Puis il construit « à blanc » (rien n'est envoyé), vous montre le résultat, et
publie réellement.

> **Le seul critère de réussite :** la ligne
> `campus publie : https://davar-campus-production-2026.<votre-sous-domaine>.workers.dev`
>
> → **notez cette adresse dans votre fiche.** C'est l'adresse de votre campus.
>
> Des avertissements jaunes peuvent apparaître : ce sont des INFORMATIONS,
> jamais des blocages.

---

## Étape 5 — VOS CLÉS (5 minutes)

```powershell
.\scripts\DEPLOYER.ps1 -Etape Secrets
```

Le script lit votre `.env.local`, fabrique le paquet, l'envoie à Cloudflare
**chiffré**, puis supprime le fichier temporaire.

> **Ce qu'il fait tout seul, et pourquoi c'est important :**
> - il n'affiche **jamais** une valeur, seulement des noms ;
> - une valeur **vide n'est jamais envoyée** (elle n'écrase rien) ;
> - `MAILER_KIND` et `APP_PUBLIC_ORIGIN` sont **exclus** : le déploiement les
>   écrit lui-même, les saisir à la main créerait deux vérités qui se
>   contredisent ;
> - vos clés **ne passent jamais par la ligne de commande**, où elles seraient
>   visibles dans la liste des processus.
>
> **Le seul critère de réussite :** `cles envoyees et chiffrees par Cloudflare` (sans accent : le script est en ASCII).

---

## Étape 6 — TESTER (2 minutes)

Remplacez `<adresse>` par celle de votre fiche.

**Test 1 — le campus répond :**

```powershell
curl.exe -I "https://<adresse>/"
```

Réponse `HTTP/2 200` → ✅ le Worker est en ligne.

**Test 2 — la base est connectée :** collez votre jeton de diagnostic
(c'est la valeur de `APP_DIAGNOSTIC_TOKEN` dans votre `.env.local`) :

```powershell
curl.exe -H "Authorization: Bearer VOTRE_JETON_DE_DIAGNOSTIC" "https://<adresse>/api/internal/turso-readiness"
```

Vous devez voir ceci (copie conforme — seules quelques valeurs changent) :

```json
{"provider":"turso","environment":"production","status":"ok","auth":{"kdf":{"iterations":600000,"target":600000,"policy":"ok"},"emailDelivery":"configured"}}
```

> **Le seul critère de réussite :** `"status":"ok"` et
> `"emailDelivery":"configured"`.
>
> `401 unauthorized` → le jeton collé n'est pas le bon (c'est la valeur de
> `APP_DIAGNOSTIC_TOKEN` dans votre `.env.local`).
> `503 not_ready` → le jeton n'est pas encore arrivé sur Cloudflare : attendez
> 30 secondes et refaites. Refaites l'étape 5 si cela persiste.
> `"status":"unavailable"` → la base ne répond pas : refaites l'étape 3.

---

## Étape 7 — BRANCHER CHARIOW (5 minutes)

Maintenant que le campus a une adresse, le Pulse peut pointer dessus.

1. Chariow → **Automatisations → Pulses** → votre Pulse → remplacez l'URL
   d'attente par :

   ```
   https://<adresse>/api/chariow/pulse
   ```

2. Mettez les quatre valeurs `CHARIOW_*` dans votre `.env.local`.
3. Envoyez-les :

```powershell
.\scripts\DEPLOYER.ps1 -Etape Secrets
```

> `CHARIOW_ENABLE_PULSE` reste sur `false` : on ne l'ouvre qu'après un achat
> de test réel. Rien ne peut être perdu d'ici là.

---

## Étape 8 — LE GRAND TEST : le premier e-mail réel (5 minutes)

Ouvrez votre campus → **Inscription** → entrez votre vraie adresse e-mail.

Votre boîte de réception (regardez les spams) : l'e-mail aux couleurs DAVAR
arrive, envoyé par votre relais Google Apps Script. Cliquez le lien →
« Votre e-mail est vérifié ».

Si rien n'arrive, regardez la réponse du relais :

```powershell
.\scripts\DEPLOYER.ps1 -Etape Recette
```

> L'e-mail part de votre compte Google. Le plafond Gmail est d'environ
> 100 e-mails/jour — très loin au-dessus de vos besoins de départ.

---

## Étape 9 — CHECK-LIST DE TESTS (30 minutes)

- [ ] Ordinateur : inscription → confirmation → campus
- [ ] Android (Chrome) : idem
- [ ] iPhone (Safari) : idem
- [ ] Une leçon s'ouvre et la progression s'enregistre
- [ ] L'assistant répond à une question
- [ ] La dictée vocale d'un avis fonctionne
- [ ] Mode clair ↔ sombre
- [ ] Écran Direction : tous les onglets s'ouvrent
- [ ] Achat test sur Chariow → accès ouvert automatiquement

---

## Étape 10 — VOS COURS (la dernière étape)

C'est **vous** qui déposez vos formations, modules, leçons et ressources, depuis
votre espace **Direction**, dans le campus en ligne. Rien n'est à déployer
pour cela : ce que vous enregistrez est visible immédiatement.

---

## MISE À JOUR — la méthode RAPIDE (MAJ.bat, 2 minutes)

Après votre première mise en ligne, **toutes** les mises à jour se font en un
**double-clic** sur `MAJ.bat`, à la racine du dossier `davar-app`.

Le script télécharge la dernière version, remplace les fichiers, réinstalle, et
lance les tests. **Ce qui est à vous est préservé :**

| Préservé | Pourquoi |
|---|---|
| `.env.local` | toutes vos valeurs — le fichier le plus précieux |
| `dev-data\` | votre base locale |
| `node_modules\` | pour ne pas tout retélécharger |

Une copie de secours horodatée de votre `.env.local` est faite à chaque fois.

> Si un test échoue après une mise à jour, **ne déployez pas** : signalez-le.
> Le script s'arrête et vous le dit.

---

## DÉPANNAGE — tout ce qu'on a déjà rencontré

| Problème | Cause | Solution |
|---|---|---|
| `npm error Missing script: "env:local"` | vous êtes dans l'ancien dossier (66 fichiers) | téléchargez la branche `arena/09f3da07-davar-campus`, pas `main` (voir étape 1) |
| `cd : chemin introuvable` | le nom d'utilisateur contient un espace | mettez le chemin **entre guillemets** |
| `node` ou `npx` non reconnu | Node absent, ou terminal ouvert avant l'installation | installez Node LTS puis **ROUVREZ** PowerShell |
| La commande `npm run` ne liste pas `env:local` | vous n'êtes pas dans `davar-app` | `cd` jusqu'au dossier qui contient `package.json` |
| `Schema` refuse de continuer | base « staging » ou URL non `libsql://` | protection volontaire : vérifiez `TURSO_DATABASE_URL` |
| `/api/internal/turso-readiness` → 503 | secret pas encore propagé | attendez 30 s, refaites ; sinon refaites l'étape 5 |
| `/health` → 404 | cette adresse n'existe pas chez nous | utilisez `/api/internal/turso-readiness` |
| Inscription : aucune réponse | relais e-mail mal branché | `.\scripts\DEPLOYER.ps1 -Etape Recette` |
| E-mail jamais reçu | spams, ou quota Gmail | regardez les spams ; puis la Recette |
| « Access denied. Please check your network settings. » (Groq) | Groq bloque les adresses de serveur — **ce n'est pas votre clé** | sans conséquence : Gemini prend la main (voir `GUIDE-MES-VALEURS.md` §5a) |
| L'assistant ne répond pas | aucune clé de moteur posée | une seule clé suffit : `GEMINI_API_KEY` |
| `cf auth login` reste bloqué | pare-feu ou antivirus | autorisez le port local, ou ouvrez le lien à la main |
| **`Accolade fermante « } » manquante` au lancement** | le `.ps1` était lu avec des accents corrompus | **corrigé** : les scripts sont désormais en ASCII pur. Relancez `MAJ.bat`, puis `DEPLOYER.bat` |
| `ERREUR ligne … : …` au moment de « Vérification du script » | le script ne peut pas être lu | copiez la ligne affichée et envoyez-la |

---

## Limites gratuites — quand basculer ?

| Ressource | Gratuit jusqu'à | Puis |
|---|---|---|
| Requêtes (Workers) | 100 000 / jour | Workers Paid 5 $/mois |
| Base Turso | 9 Go, 500 bases | plan payant Turso |
| Stockage R2 | 10 Go | 0,015 $/Go/mois |
| E-mails (Apps Script) | ~100 / jour | relais payant |
| Assistant (Groq + Gemini) | 1 000 + 1 500 questions / jour | les moteurs se relaient, puis palier payant |
| Dictée vocale | 2 000 transcriptions / jour | repli automatique sur l'appareil de l'étudiant |

> Avec **3 000 étudiants**, le palier gratuit tient sur le stockage et la base.
> Les requêtes sont le premier poste à surveiller.

---

## Sécurité — rappels immuables

- **Aucun secret, jamais, côté client.** Vos clés vivent sur Cloudflare, jamais
  dans le navigateur d'un étudiant.
- **`.env.local` ne va jamais sur GitHub.** Le dépôt est public.
- **L'URL `/exec` de votre Apps Script est secrète** : si elle fuit, redéployez
  le script (nouvelle URL).
- **Ne changez jamais `AUTH_PARAMS_SECRET` ni `AUTH_VERIFIER_PEPPER` après
  l'ouverture** : cela déconnecterait tous les comptes créés.
- **Après un changement de secret, Cloudflare republie le Worker** : attendez
  ~30 secondes, puis relancez la Recette.
- **Ne saisissez jamais `MAILER_KIND` ni `APP_PUBLIC_ORIGIN` à la main** : le
  déploiement les écrit.
