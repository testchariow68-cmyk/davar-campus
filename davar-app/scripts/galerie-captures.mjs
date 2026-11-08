/**
 * Galerie de captures — UN SEUL fichier HTML, autonome.
 *
 * Le propriétaire ne peut pas consulter les dossiers d'images : on lui
 * fabrique donc une page qu'il ouvre d'un seul geste. Les images sont
 * incorporées en base64 : le fichier se suffit à lui-même, il voyage par
 * courriel ou par clé USB sans rien perdre.
 *
 * Usage : node scripts/galerie-captures.mjs
 *         node scripts/galerie-captures.mjs /chemin/vers/captures sortie.html
 */
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';

const DOSSIER = process.argv[2] ?? '/home/user/captures-parcours';
const SORTIE = process.argv[3] ?? join(DOSSIER, 'galerie.html');

/** Ce qu'il faut regarder dans chaque capture. Clé = début du nom de fichier. */
const LEGENDES = {
  '1-module-telephone': {
    titre: 'Le module ouvre son cours',
    appareil: 'telephone',
    texte: "On touche « Respirer juste » et le cours s'ouvre : la vidéo principale, les vidéos complémentaires et les ressources. Aucune liste de leçons ne s'intercale.",
  },
  '2-module-tablette': {
    titre: 'Le même écran sur tablette',
    appareil: 'tablette',
    texte: 'Le rail latéral réapparaît à partir de 768 px. Ses libellés passent de 10 à 11,5 px pour rester lisibles au doigt.',
  },
  '3-module-ordinateur': {
    titre: 'Le même écran sur ordinateur',
    appareil: 'ordinateur',
    texte: "Le contenu est désormais plafonné à 1080 px et centré : les lignes ne traversent plus tout l'écran.",
  },
  '4-video-complementaire': {
    titre: 'Une vidéo complémentaire',
    appareil: 'telephone',
    texte: "Elle prend le lecteur principal, s'annonce « hors progression », et « Marquer comme terminé » disparaît : la regarder ne fait pas avancer le cours. Un bouton rend la place à la vidéo principale.",
  },
  '5-visionneuse-telephone': {
    titre: 'Le document s’ouvre en plein écran',
    appareil: 'telephone',
    texte: "Toucher le PDF l'ouvre, il ne se télécharge pas. La croix referme ; en bas, « Ajouter à l'écran d'accueil » et « Télécharger ».",
  },
  '6-visionneuse-tablette': {
    titre: 'La visionneuse sur tablette',
    appareil: 'tablette',
    texte: 'Le cadre occupe toute la surface disponible, la barre du bas reste accessible au pouce.',
  },
  '7-visionneuse-ordinateur': {
    titre: 'La visionneuse sur ordinateur',
    appareil: 'ordinateur',
    texte: 'Plein écran également. Échap, la croix ou un clic sur le fond referment.',
  },
  '8-accueil-ordinateur': {
    titre: 'L’accueil du campus',
    appareil: 'ordinateur',
    texte: 'Largeur utile 1080 px au lieu de 1360 : c’est le plafond du prototype, qu’une règle plus basse annulait.',
  },
  '9-accueil-telephone': {
    titre: 'L’accueil sur téléphone',
    appareil: 'telephone',
    texte: 'Le rail est masqué, tout tient dans la largeur, et chaque cible mesure au moins 31 px.',
  },
};

const APPAREILS = {
  telephone: { nom: 'Téléphone', largeur: '390 px' },
  tablette: { nom: 'Tablette', largeur: '820 px' },
  ordinateur: { nom: 'Ordinateur', largeur: '1440 px' },
};

/** Devine l'appareil d'après le nom si la légende ne le dit pas. */
function appareilDuNom(nom) {
  if (/telephone/i.test(nom)) return 'telephone';
  if (/tablette/i.test(nom)) return 'tablette';
  if (/ordinateur/i.test(nom)) return 'ordinateur';
  return 'ordinateur';
}

function echapper(texte) {
  return String(texte)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const fichiers = readdirSync(DOSSIER)
  .filter((f) => /\.png$/i.test(f))
  .filter((f) => !/^galerie/i.test(f))
  .sort((a, b) => a.localeCompare(b, 'fr', { numeric: true }));

if (fichiers.length === 0) {
  console.error('Aucune capture .png dans ' + DOSSIER);
  process.exit(1);
}

const figures = [];
for (const nom of fichiers) {
  const cle = nom.replace(/\.png$/i, '');
  const chemin = join(DOSSIER, nom);
  const octets = readFileSync(chemin);
  const base64 = octets.toString('base64');
  const legende = LEGENDES[cle] ?? {};
  const appareil = legende.appareil ?? appareilDuNom(nom);
  let largeurReelle = null;
  try {
    // Largeur réelle lue dans l'en-tête PNG, pour l'afficher à sa taille vraie.
    largeurReelle = octets.readUInt32BE(16);
  } catch {
    largeurReelle = null;
  }
  figures.push({
    nom,
    appareil,
    titre: legende.titre ?? cle.replace(/-/g, ' '),
    texte: legende.texte ?? '',
    base64,
    poids: statSync(chemin).size,
    largeurReelle,
  });
}

const total = figures.reduce((s, f) => s + f.poids, 0);
const date = new Date().toLocaleDateString('fr-FR', {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
});

const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Captures du campus DAVAR — ${echapper(date)}</title>
<style>
  :root{
    --fond:#0F0D16; --carte:#191622; --bord:#2C2740;
    --texte:#EDE9F6; --douce:#A79FC0; --or:#D9B662; --violet:#6D28D9;
  }
  *{box-sizing:border-box}
  body{margin:0;background:var(--fond);color:var(--texte);
    font:16px/1.6 Georgia,'Times New Roman',serif}
  .entete{padding:38px 24px 26px;border-bottom:1px solid var(--bord);
    background:radial-gradient(900px 320px at 20% -40%,rgba(109,40,217,.35),transparent)}
  .entete .dans{max-width:1180px;margin:0 auto}
  .entete h1{margin:0 0 6px;font-size:27px;letter-spacing:.2px}
  .entete p{margin:0;color:var(--douce);font-size:14.5px}
  .entete .mention{margin-top:12px;font-size:13px;color:var(--or)}
  .barre{position:sticky;top:0;z-index:20;background:rgba(15,13,22,.94);
    backdrop-filter:blur(8px);border-bottom:1px solid var(--bord);padding:10px 24px}
  .barre .dans{max-width:1180px;margin:0 auto;display:flex;gap:8px;
    flex-wrap:wrap;align-items:center}
  .filtre{background:transparent;border:1px solid var(--bord);color:var(--douce);
    padding:8px 15px;border-radius:99px;cursor:pointer;font:600 13.5px/1 Georgia,serif}
  .filtre:hover{border-color:var(--or);color:var(--texte)}
  .filtre.actif{background:var(--violet);border-color:var(--violet);color:#fff}
  .compte{margin-left:auto;color:var(--douce);font-size:13px}
  .grille{max-width:1180px;margin:0 auto;padding:28px 24px 70px;
    display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:26px}
  figure{margin:0;background:var(--carte);border:1px solid var(--bord);
    border-radius:14px;overflow:hidden;display:flex;flex-direction:column}
  figure.cache{display:none}
  .cadre{position:relative;background:#0B0912;cursor:zoom-in;
    display:flex;align-items:center;justify-content:center;padding:14px}
  .cadre img{display:block;max-width:100%;height:auto;border-radius:6px}
  .puce{position:absolute;top:10px;left:10px;background:rgba(11,9,18,.82);
    border:1px solid var(--bord);color:var(--douce);font:700 11px/1 Georgia,serif;
    letter-spacing:.08em;text-transform:uppercase;padding:6px 10px;border-radius:99px}
  .puce.telephone{border-color:#3E7BFA;color:#9DC0FF}
  .puce.tablette{border-color:#12B886;color:#7BE3C4}
  .puce.ordinateur{border-color:var(--or);color:var(--or)}
  figcaption{padding:15px 17px 18px;border-top:1px solid var(--bord);flex:1}
  figcaption h2{margin:0 0 7px;font-size:16.5px}
  figcaption p{margin:0;color:var(--douce);font-size:14px}
  figcaption .meta{margin-top:9px;font-size:12px;color:#6F688A}
  .voile{position:fixed;inset:0;z-index:100;background:rgba(8,6,14,.95);
    display:none;align-items:center;justify-content:center;padding:22px;cursor:zoom-out}
  .voile.ouvert{display:flex}
  .voile img{max-width:100%;max-height:100%;border-radius:8px;
    box-shadow:0 30px 90px rgba(0,0,0,.7)}
  .voile .fermer{position:absolute;top:16px;right:18px;background:transparent;
    border:1px solid var(--bord);color:var(--douce);width:42px;height:42px;
    border-radius:50%;cursor:pointer;font-size:20px;line-height:1}
  .voile .fermer:hover{border-color:var(--or);color:var(--texte)}
  .pied{max-width:1180px;margin:0 auto;padding:0 24px 60px;
    color:#6F688A;font-size:13px;border-top:1px solid var(--bord);padding-top:20px}
  @media (max-width:600px){
    .entete h1{font-size:22px}
    .grille{grid-template-columns:1fr;padding:18px 14px 50px}
  }
</style>
</head>
<body>

<header class="entete">
  <div class="dans">
    <h1>Captures du campus DAVAR</h1>
    <p>${echapper(date)} — ${figures.length} vues, téléphone · tablette · ordinateur.</p>
    <p class="mention">Touchez une image pour l’agrandir. Les boutons du haut filtrent par appareil.</p>
  </div>
</header>

<nav class="barre">
  <div class="dans">
    <button class="filtre actif" data-appareil="tout">Tout voir</button>
    <button class="filtre" data-appareil="telephone">Téléphone · 390 px</button>
    <button class="filtre" data-appareil="tablette">Tablette · 820 px</button>
    <button class="filtre" data-appareil="ordinateur">Ordinateur · 1440 px</button>
    <span class="compte" id="compte"></span>
  </div>
</nav>

<main class="grille" id="grille">
${figures
  .map(
    (f) => `  <figure data-appareil="${f.appareil}">
    <div class="cadre">
      <span class="puce ${f.appareil}">${APPAREILS[f.appareil].nom} · ${APPAREILS[f.appareil].largeur}</span>
      <img src="data:image/png;base64,${f.base64}" alt="${echapper(f.titre)}" loading="lazy">
    </div>
    <figcaption>
      <h2>${echapper(f.titre)}</h2>
      <p>${echapper(f.texte)}</p>
      <div class="meta">${echapper(f.nom)}${f.largeurReelle ? ' — ' + f.largeurReelle + ' px de large' : ''}</div>
    </figcaption>
  </figure>`,
  )
  .join('\n')}
</main>

<footer class="pied">
  Fichier autonome : les images y sont incorporées, aucune connexion n’est nécessaire.
  ${(total / 1024 / 1024).toFixed(1)} Mo au total.
</footer>

<div class="voile" id="voile">
  <button class="fermer" id="fermer" aria-label="Fermer">×</button>
  <img id="agrandie" src="" alt="">
</div>

<script>
  var voile = document.getElementById('voile');
  var agrandie = document.getElementById('agrandie');
  document.getElementById('grille').addEventListener('click', function (e) {
    var img = e.target.closest('.cadre') && e.target.closest('.cadre').querySelector('img');
    if (!img) return;
    agrandie.src = img.src;
    agrandie.alt = img.alt;
    voile.classList.add('ouvert');
    document.body.style.overflow = 'hidden';
  });
  function fermer() {
    voile.classList.remove('ouvert');
    document.body.style.overflow = '';
  }
  document.getElementById('fermer').addEventListener('click', fermer);
  voile.addEventListener('click', fermer);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') fermer();
  });

  var figures = [].slice.call(document.querySelectorAll('figure'));
  var boutons = [].slice.call(document.querySelectorAll('.filtre'));
  function filtrer(appareil) {
    var vus = 0;
    figures.forEach(function (f) {
      var garder = appareil === 'tout' || f.dataset.appareil === appareil;
      f.classList.toggle('cache', !garder);
      if (garder) vus += 1;
    });
    document.getElementById('compte').textContent = vus + ' vue' + (vus > 1 ? 's' : '');
    boutons.forEach(function (b) {
      b.classList.toggle('actif', b.dataset.appareil === appareil);
    });
  }
  boutons.forEach(function (b) {
    b.addEventListener('click', function () { filtrer(b.dataset.appareil); });
  });
  filtrer('tout');
</script>

</body>
</html>
`;

writeFileSync(SORTIE, html, 'utf8');
console.log('Galerie ecrite : ' + SORTIE);
console.log('  ' + figures.length + ' captures, ' + (statSync(SORTIE).size / 1024 / 1024).toFixed(2) + ' Mo, fichier autonome.');
