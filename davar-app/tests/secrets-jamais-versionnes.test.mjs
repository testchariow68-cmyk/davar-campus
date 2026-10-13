/**
 * VOS SECRETS NE PARTENT JAMAIS SUR GITHUB — la règle, verrouillée par un test.
 *
 * Le dépôt est PUBLIC. Le fichier `.env.local` contient la clé de la base, le
 * jeton du relais d'e-mail, la clé d'API du stockage et le secret de signature
 * des ventes : publié, il donnerait à n'importe qui l'accès à tout.
 *
 * Ce que ce test garantit, exactement :
 *   1. aucun fichier de secrets n'est SUIVI par git (ni `.env`, ni `.env.local`,
 *      ni `.dev.vars`) — alors que `.env.example`, lui, doit rester suivi, car
 *      c'est le modèle sans secret ;
 *   2. git les IGNORE : un `git add .` ne peut pas les emporter par accident ;
 *   3. aucune valeur qui RESSEMBLE à un vrai secret n'existe dans un fichier du
 *      dépôt (clé Groq, secret de signature, clé de vente, jeton JWT de Turso,
 *      identifiant AWS) : les modèles des documents utilisent « … », qui ne
 *      déclenche pas ces motifs.
 *
 * Si git n'est pas installé (dépôt téléchargé en ZIP), les trois contrôles sont
 * ignorés et le test le DIT, plutôt que de faire semblant de passer.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const RACINE = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

function git(...arguments_) {
  return execFileSync('git', ['-C', RACINE, ...arguments_], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

const gitDisponible = (() => {
  try {
    return git('rev-parse', '--is-inside-work-tree') === 'true';
  } catch {
    return false;
  }
})();

const fichiersSuivis = gitDisponible ? git('ls-files', '--full-name').split('\n').filter(Boolean) : [];
/** Les chemins de `ls-files` sont relatifs à la RACINE du dépôt, pas à davar-app. */
const RACINE_DEPOT = gitDisponible ? git('rev-parse', '--show-toplevel') : '';

/** Les fichiers de secrets qui ne doivent JAMAIS être suivis. */
const INTERDITS = ['.env', '.env.local', '.env.production.local', '.dev.vars', '.dev.vars.production'];

test('aucun fichier de secrets n’est suivi par git', { skip: !gitDisponible && 'git indisponible : dépôt téléchargé en ZIP ?' }, () => {
  for (const nom of INTERDITS) {
    const suivi = fichiersSuivis.filter((chemin) => chemin === nom || chemin.endsWith(`/${nom}`));
    assert.deepEqual(suivi, [], `${nom} est suivi par git : il partirait sur GitHub à la prochaine publication`);
  }
  // Le modèle sans secret, lui, doit rester : c'est lui qui documente les noms.
  assert.ok(
    fichiersSuivis.includes('davar-app/.env.example'),
    '.env.example doit rester suivi : c’est le modèle, il ne contient aucun secret'
  );
});

test('git IGNORE ces fichiers : impossible de les emporter par accident', { skip: !gitDisponible && 'git indisponible' }, () => {
  const ignores = ['.env', '.env.local', '.dev.vars'].map((nom) => ({
    nom,
    verdict: (() => {
      try {
        git('check-ignore', '-q', nom);
        return true;
      } catch {
        return false;
      }
    })(),
  }));
  const nonIgnores = ignores.filter((entree) => !entree.verdict).map((entree) => entree.nom);
  assert.deepEqual(nonIgnores, [], `ces fichiers ne sont pas protégés par .gitignore : ${nonIgnores.join(', ')}`);
});

test('aucune valeur qui ressemble à un vrai secret dans le dépôt', { skip: !gitDisponible && 'git indisponible' }, () => {
  // Motifs des clés réelles. Les documents du projet écrivent « whsec_… » ou
  // « gsk_… » avec des points de suspension : ils ne correspondent pas.
  const motifs = [
    { nom: 'clé Groq', expression: /gsk_[A-Za-z0-9]{24,}/ },
    { nom: 'secret de signature Chariow', expression: /whsec_[A-Za-z0-9]{16,}/ },
    { nom: 'clé de vente Chariow', expression: /sk_live_[A-Za-z0-9]{10,}/ },
    { nom: 'jeton de base de données', expression: /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\./ },
    { nom: 'clé AWS/R2', expression: /AKIA[0-9A-Z]{16}/ },
  ];
  const binaires = /\.(zip|png|jpe?g|gif|webp|ico|wav|mp3|pdf|onnx|woff2?)$/i;

  const trouvailles = [];
  let lus = 0;
  for (const chemin of fichiersSuivis) {
    if (binaires.test(chemin)) continue;
    const complet = join(RACINE_DEPOT, chemin);
    let contenu = '';
    try {
      if (statSync(complet).size > 2 * 1024 * 1024) continue; // les gros fichiers ne sont pas du code
      contenu = readFileSync(complet, 'utf8');
    } catch {
      continue;
    }
    lus += 1;
    for (const motif of motifs) {
      if (motif.expression.test(contenu)) trouvailles.push(`${chemin} — ${motif.nom}`);
    }
  }
  // Sans ce garde-fou, une erreur de chemin rendrait ce contrôle inoffensif :
  // il passerait au vert en n'ayant rien lu. On exige donc d'avoir VRAIMENT lu.
  assert.ok(
    lus >= 50,
    `la vérification n’a lu que ${lus} fichier(s) : elle ne prouve rien (chemin des fichiers suivi par git ?)`
  );
  assert.deepEqual(
    trouvailles,
    [],
    `Ces fichiers contiennent ce qui ressemble à un vrai secret :\n${trouvailles.join('\n')}`
  );
});

test('le mot d’ordre est écrit là où on le lira', () => {
  // Ce n'est pas de la décoration : c'est la consigne que le propriétaire doit
  // retrouver avant de saisir ses clés.
  const guide = readFileSync(new URL('../GUIDE-MES-VALEURS.md', import.meta.url), 'utf8');
  assert.match(guide, /jamais/i, 'le guide doit dire clairement que les secrets ne se publient pas');
  assert.match(guide, /\.env\.local/, 'le guide doit nommer le fichier exact');
});
