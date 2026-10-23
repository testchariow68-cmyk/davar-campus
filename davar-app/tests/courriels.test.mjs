/**
 * LES NEUF SCÉNARIOS D'E-MAIL — les mots du prototype, le bon expéditeur.
 *
 * Ce que le prototype écrit dans `emails.js` (MAIL_FLOWS + MAIL_SIGNS) doit
 * sortir tel quel de la plateforme. Ce test est la corde qui attache nos
 * e-mails au prototype : si quelqu'un réécrit une phrase, il casse ici.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { applyAllMigrations } from './helpers/migrations.mjs';
import {
  SCENARIOS,
  adresseDuRole,
  composerCourriel,
  envoyerScenario,
} from '../lib/server/courriels.ts';

async function base() {
  const db = createClient({
    url: pathToFileURL(join(mkdtempSync(join(tmpdir(), 'davar-courriels-')), 'test.db')).href,
  });
  await applyAllMigrations(db);
  return db;
}

test('les neuf scénarios, et pas un de plus', () => {
  assert.deepEqual(
    Object.keys(SCENARIOS).sort(),
    [
      'bienvenue',
      'certificat-pret',
      'demande-certificat',
      'grace-etudiant',
      'invitation-staff',
      'paiement-confirme',
      'reactivation',
      'reset-mdp',
      'suspension',
    ],
    'les dix modèles de l’écran « E-mails », moins la motivation qui part en notification'
  );
});

test('chaque scénario parle avec la voix du rôle que le prototype lui donne', () => {
  const roles = {
    bienvenue: 'infos',
    'invitation-staff': 'direction',
    'grace-etudiant': 'direction',
    'reset-mdp': 'support',
    suspension: 'direction',
    reactivation: 'direction',
    'certificat-pret': 'direction',
    'demande-certificat': 'support',
    'paiement-confirme': 'support',
  };
  for (const [scenario, role] of Object.entries(roles)) {
    assert.equal(SCENARIOS[scenario].role, role, scenario);
  }
});

test('les textes sont ceux du prototype, au mot près', () => {
  const accueil = composerCourriel('bienvenue', 'awa@exemple.test', { nom: 'Awa' });
  assert.equal(accueil.subject, 'Bienvenue sur Davar Académie Campus');
  assert.match(accueil.text, /^Bonjour Awa,\n\nVotre compte est prêt :/);
  assert.match(accueil.text, /Bonne formation !\n\nCordialement,\nL’équipe Davar Académie/);
  assert.equal(adresseDuRole(SCENARIOS.bienvenue.role), 'infos@davarcampus.co');

  const paiement = composerCourriel('paiement-confirme', 'awa@exemple.test', { titre: 'Orateur' });
  assert.equal(paiement.subject, 'Votre achat est confirmé — Davar Académie Campus');
  assert.match(paiement.text, /Votre paiement pour « Orateur » est confirmé/);
  assert.match(paiement.text, /accès 12 mois, certificat inclus/);
  assert.equal(adresseDuRole(SCENARIOS['paiement-confirme'].role), 'support@davarcampus.co');

  const certificat = composerCourriel('certificat-pret', 'awa@exemple.test', { code: 'PRI-001' });
  assert.equal(certificat.subject, 'Votre certificat PRI-001 est prêt — Davar Académie');
  assert.match(certificat.text, /La Direction a le plaisir de vous informer/);
  assert.equal(adresseDuRole(SCENARIOS['certificat-pret'].role), 'direction@davarcampus.co');

  const suspendu = composerCourriel('suspension', 'awa@exemple.test', { nom: 'Awa' });
  assert.match(suspendu.text, /^Bonjour Awa,\n\nLa Direction vous informe que votre compte est suspendu/);

  const reactivation = composerCourriel('reactivation', 'awa@exemple.test', {});
  assert.match(reactivation.text, /Madame, Monsieur,\n\nLa Direction vous informe que votre compte est réactivé/);

  const invitation = composerCourriel('invitation-staff', 'kofi@exemple.test', { roles: 'admin, instructeur' });
  assert.equal(invitation.subject, 'Invitation à rejoindre Davar Académie Campus (valable 7 jours) — rôles : admin, instructeur');
  assert.match(invitation.text, /avec les rôles suivants : admin, instructeur/);

  const demande = composerCourriel('demande-certificat', 'awa@exemple.test', {});
  assert.match(demande.text, /le document officiel vous sera adressé par e-mail de la Direction dès émission/);
});

test('la désinscription ne s’affiche que sur le canal « infos »', () => {
  const infos = composerCourriel('bienvenue', 'awa@exemple.test', {});
  assert.match(infos.text, /Pour vous désinscrire : https:\/\/davarcampus\.co\/#\/desinscription\?e=awa%40exemple\.test/);
  const support = composerCourriel('paiement-confirme', 'awa@exemple.test', { titre: 'X' });
  assert.doesNotMatch(support.text, /Pour vous désinscrire/);
});

test('un e-mail qui ne peut pas partir ne casse jamais ce que faisait la personne', async () => {
  const db = await base();
  // Le service d'envoi n'est pas configuré dans ce test : l'envoi doit
  // simplement renoncer, sans jeter d'erreur à la figure de l'appelant.
  const parti = await envoyerScenario(db, 'bienvenue', 'awa@exemple.test', { nom: 'Awa', userId: 'u-1' });
  assert.equal(parti, false);
});

test('les quatre adresses de l’académie', () => {
  assert.equal(adresseDuRole('support'), 'support@davarcampus.co');
  assert.equal(adresseDuRole('contact'), 'contact@davarcampus.co');
  assert.equal(adresseDuRole('infos'), 'infos@davarcampus.co');
  assert.equal(adresseDuRole('direction'), 'direction@davarcampus.co');
});
