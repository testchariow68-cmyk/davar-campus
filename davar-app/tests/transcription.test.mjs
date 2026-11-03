/**
 * TRANSCRIPTION VOCALE DES AVIS — les règles du propriétaire, verrouillées.
 *
 * Décision du 7 octobre 2026 : « Plan A : Whisper large-v3 via Groq. Plan B :
 * Whisper dans le navigateur. C'est ce qu'on garde. » Les deux moteurs vivent
 * donc côte à côte, Groq en premier (comme dans le prototype), et le navigateur
 * sert aussi de repli.
 *
 * Ce que ces tests protègent :
 *   - rien ne part sans clé : l'application le dit, elle n'échoue pas ;
 *   - le contrat envoyé au moteur est celui de Groq (URL, modèle, langue, format) ;
 *   - les plafonds du palier gratuit sont comptés AVANT l'appel, et le 2 000e appel
 *     du jour refuse le suivant au lieu de le dépenser ;
 *   - un enregistrement trop lourd ne consomme même pas une requête.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MODELE_GROQ,
  MODELE_GEMINI,
  MOTEURS_EN_LIGNE,
  cleDuMoteur,
  MOTEURS_TRANSCRIPTION,
  PLAFOND_AUDIO_OCTETS,
  nomFichierPour,
  moteurTranscription,
  transcrireAudio,
  transcriptionEnLigneDisponible,
} from '../lib/server/transcription.ts';
import { DEFAULT_BUDGETS, budgetFor, pendingTotals, resetLocalCounters } from '../lib/server/quota.ts';
import { urlGroq } from '../lib/server/http.ts';

const AUDIO = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);

function sansCle() {
  delete process.env.GROQ_API_KEY;
}

function avecCle() {
  process.env.GROQ_API_KEY = 'gsk_de_remplacement_pour_les_tests';
}

/** Un faux moteur : il enregistre ce qu'on lui envoie et répond ce qu'on veut. */
function fauxMoteur(reponse = { status: 200, texte: 'Bonjour, voici mon avis.' }) {
  const appels = [];
  const fetchImpl = async (url, init) => {
    appels.push({ url, init });
    return new Response(JSON.stringify({ text: reponse.texte }), {
      status: reponse.status,
      headers: { 'content-type': 'application/json' },
    });
  };
  return { appels, fetchImpl };
}

test('les trois moteurs sont gardés : Groq en premier, le navigateur en dernier', () => {
  assert.deepEqual(
    MOTEURS_TRANSCRIPTION.map((moteur) => moteur.valeur),
    ['groq-whisper', 'gemini-audio', 'browser-whisper'],
    'l’ordre du prototype : Groq, puis le relais en ligne, puis l’appareil'
  );
  assert.match(MOTEURS_TRANSCRIPTION[0].libelle, /recommandé/);
  assert.equal(MOTEURS_TRANSCRIPTION[2].repli, true, 'le navigateur reste le moteur de repli');
  assert.equal(MOTEURS_EN_LIGNE.length, 2, 'deux moteurs côté serveur, un sur l’appareil');
  assert.equal(moteurTranscription('browser-whisper'), 'browser-whisper');
  assert.equal(moteurTranscription('groq-whisper'), 'groq-whisper');
  assert.equal(moteurTranscription(''), 'groq-whisper', 'sans réglage, le défaut du prototype');
  assert.equal(moteurTranscription(undefined), 'groq-whisper');
  assert.equal(moteurTranscription('valeur-inconnue'), 'groq-whisper', 'une valeur inconnue ne casse pas l’envoi d’avis');
});

test('les plafonds du palier gratuit Groq sont déclarés et surchargeables', () => {
  assert.equal(DEFAULT_BUDGETS['transcription.requests'].limit, 2_000);
  assert.equal(DEFAULT_BUDGETS['transcription.seconds'].limit, 28_800);
  assert.equal(DEFAULT_BUDGETS['transcription.requests'].hard, true);
  assert.equal(DEFAULT_BUDGETS['transcription.seconds'].hard, true);
  process.env.QUOTA_DAILY_TRANSCRIPTIONS = '5';
  assert.equal(budgetFor('transcription.requests').limit, 5);
  delete process.env.QUOTA_DAILY_TRANSCRIPTIONS;
  assert.equal(budgetFor('transcription.requests').limit, 2_000);
});

test('sans clé, l’application le dit — elle n’appelle personne', async () => {
  sansCle();
  resetLocalCounters();
  let appele = 0;
  const resultat = await transcrireAudio({
    audio: AUDIO,
    typeMime: 'audio/webm',
    fetchImpl: async () => {
      appele += 1;
      return new Response('{}');
    },
  });
  assert.equal(resultat.ok, false);
  assert.equal(resultat.raison, 'sans_cle');
  assert.equal(resultat.repli, 'navigateur', 'l’étudiant doit pouvoir dicter sur son appareil');
  assert.equal(appele, 0, 'aucune requête ne doit partir sans clé');
  assert.equal(transcriptionEnLigneDisponible(), false);
});

test('l’appel respecte le contrat de Groq, et le texte revient', async () => {
  avecCle();
  resetLocalCounters();
  const { appels, fetchImpl } = fauxMoteur();
  const resultat = await transcrireAudio({ audio: AUDIO, typeMime: 'audio/webm;codecs=opus', secondes: 42, fetchImpl });

  assert.equal(resultat.ok, true);
  assert.equal(resultat.texte, 'Bonjour, voici mon avis.');
  assert.equal(resultat.moteur, 'groq-whisper');

  assert.equal(appels.length, 1);
  assert.equal(appels[0].url, 'https://api.groq.com/openai/v1/audio/transcriptions');
  assert.equal(appels[0].init.method, 'POST');
  assert.match(appels[0].init.headers.authorization, /^Bearer /);

  const forme = appels[0].init.body;
  assert.equal(forme.get('model'), MODELE_GROQ);
  assert.equal(forme.get('language'), 'fr');
  assert.equal(forme.get('response_format'), 'json');
  const fichier = forme.get('file');
  assert.ok(fichier instanceof Blob, 'le fichier doit être envoyé comme un fichier, pas comme du texte');
  assert.equal(fichier.name, 'avis.webm');

  // Les compteurs du palier gratuit ont bien été consommés, une seule fois.
  const totaux = Object.fromEntries(pendingTotals().map((entree) => [entree.bucket, entree.count]));
  assert.equal(totaux['transcription.requests'], 1);
  assert.equal(totaux['transcription.seconds'], 42);
});

test('un enregistrement court est compté au minimum facturé par le moteur', async () => {
  avecCle();
  resetLocalCounters();
  const { fetchImpl } = fauxMoteur();
  await transcrireAudio({ audio: AUDIO, typeMime: 'audio/mp4', secondes: 2, fetchImpl });
  const totaux = Object.fromEntries(pendingTotals().map((entree) => [entree.bucket, entree.count]));
  assert.equal(totaux['transcription.seconds'], 10, 'le moteur facture 10 secondes minimum');
});

test('le plafond du jour refuse le 2 001e appel au lieu de le dépenser', async () => {
  avecCle();
  resetLocalCounters();
  process.env.QUOTA_DAILY_TRANSCRIPTIONS = '5';
  const { appels, fetchImpl } = fauxMoteur();

  for (let index = 0; index < 5; index += 1) {
    const resultat = await transcrireAudio({ audio: AUDIO, typeMime: 'audio/webm', secondes: 30, fetchImpl });
    assert.equal(resultat.ok, true, `l’appel ${index + 1} doit passer`);
  }
  const refuse = await transcrireAudio({ audio: AUDIO, typeMime: 'audio/webm', secondes: 30, fetchImpl });
  assert.equal(refuse.ok, false);
  assert.equal(refuse.raison, 'quota');
  assert.equal(refuse.repli, 'navigateur');
  assert.equal(appels.length, 5, 'aucune requête ne doit partir une fois le plafond atteint');

  delete process.env.QUOTA_DAILY_TRANSCRIPTIONS;
});

test('un refus 429 du moteur épuise le compteur du jour et fait basculer', async () => {
  avecCle();
  resetLocalCounters();
  let appels = 0;
  const fetchImpl = async () => {
    appels += 1;
    return new Response('{"error":"rate limit"}', { status: 429 });
  };
  const premier = await transcrireAudio({ audio: AUDIO, typeMime: 'audio/webm', secondes: 30, fetchImpl });
  assert.equal(premier.ok, false);
  assert.equal(premier.raison, 'quota');
  assert.equal(premier.repli, 'navigateur');

  const second = await transcrireAudio({ audio: AUDIO, typeMime: 'audio/webm', secondes: 30, fetchImpl });
  assert.equal(second.raison, 'quota');
  assert.equal(appels, 1, 'après un 429, on n’insiste plus aujourd’hui depuis cette instance');
});

test('un enregistrement vide ou trop lourd ne consomme aucune requête', async () => {
  avecCle();
  resetLocalCounters();
  const { appels, fetchImpl } = fauxMoteur();

  const vide = await transcrireAudio({ audio: new Uint8Array(0), typeMime: 'audio/webm', fetchImpl });
  assert.equal(vide.raison, 'vide');

  const enorme = await transcrireAudio({
    audio: new Uint8Array(PLAFOND_AUDIO_OCTETS + 1),
    typeMime: 'audio/webm',
    fetchImpl,
  });
  assert.equal(enorme.raison, 'trop_lourd');
  assert.equal(enorme.repli, 'navigateur');
  assert.equal(appels.length, 0, 'aucune requête pour un enregistrement inutilisable');
});

test('le nom du fichier transmis suit le format du navigateur', () => {
  assert.equal(nomFichierPour('audio/webm;codecs=opus'), 'avis.webm');
  assert.equal(nomFichierPour('audio/mp4'), 'avis.m4a');
  assert.equal(nomFichierPour('audio/ogg;codecs=opus'), 'avis.ogg');
  assert.equal(nomFichierPour('audio/wav'), 'avis.wav');
  assert.equal(nomFichierPour(''), 'avis.webm');
});

/**
 * Groq refuse les appels venant d'un centre de données (politique anti-fraude,
 * indépendante de la validité de la clé) : un serveur ou un Worker Cloudflare
 * reçoit « Access denied. Please check your network settings. ». D'où la
 * possibilité de passer par une passerelle. Ces trois tests vérifient que
 * l'adresse est bien composée, et que Rien ne change si l'on ne déclare rien.
 */
test('sans passerelle déclarée, on appelle l’API officielle de Groq', () => {
  const avant = process.env.GROQ_BASE_URL;
  delete process.env.GROQ_BASE_URL;
  try {
    assert.equal(urlGroq('chat/completions'), 'https://api.groq.com/openai/v1/chat/completions');
    assert.equal(urlGroq('audio/transcriptions'), 'https://api.groq.com/openai/v1/audio/transcriptions');
  } finally {
    if (avant !== undefined) process.env.GROQ_BASE_URL = avant;
  }
});

test('avec une passerelle déclarée, les appels passent par elle', () => {
  const avant = process.env.GROQ_BASE_URL;
  process.env.GROQ_BASE_URL = 'https://gateway.ai.cloudflare.com/v1/compte-123/davar/groq';
  try {
    assert.equal(urlGroq('chat/completions'), 'https://gateway.ai.cloudflare.com/v1/compte-123/davar/groq/chat/completions');
    assert.equal(urlGroq('audio/transcriptions'), 'https://gateway.ai.cloudflare.com/v1/compte-123/davar/groq/audio/transcriptions');
  } finally {
    if (avant === undefined) delete process.env.GROQ_BASE_URL;
    else process.env.GROQ_BASE_URL = avant;
  }
});

test('une barre oblique finale dans la passerelle ne fait pas de double slash', () => {
  const avant = process.env.GROQ_BASE_URL;
  process.env.GROQ_BASE_URL = 'https://gateway.ai.cloudflare.com/v1/compte-123/davar/groq///';
  try {
    assert.equal(urlGroq('chat/completions'), 'https://gateway.ai.cloudflare.com/v1/compte-123/davar/groq/chat/completions');
    assert.ok(!urlGroq('chat/completions').includes('//', 'https://'.length));
  } finally {
    if (avant === undefined) delete process.env.GROQ_BASE_URL;
    else process.env.GROQ_BASE_URL = avant;
  }
});

/* ------------------------------------------------------------------------- *
 * Le relais : Groq REFUSE les appels venant d'un centre de données (serveurs,
 * VPN, Workers Cloudflare) en renvoyant « Access denied. Please check your
 * network settings. » même avec une clé valide. Sans relais, un campus déployé
 * renverrait l'étudiant vers 41 Mo à télécharger sur son téléphone. Ces tests
 * vérifient que Gemini prend la main sans rien demander à personne.
 * ------------------------------------------------------------------------- */

/** Un faux moteur GEMINI : il enregistre l'appel et rend un texte. */
function fauxGemini(reponse = { status: 200, texte: 'Bonjour, voici mon avis.' }) {
  const appels = [];
  const fetchImpl = async (url, init) => {
    appels.push({ url, init });
    return new Response(
      JSON.stringify({ candidates: [{ content: { parts: [{ text: reponse.texte }] } }] }),
      { status: reponse.status, headers: { 'content-type': 'application/json' } }
    );
  };
  return { appels, fetchImpl };
}

function sansGemini() {
  delete process.env.GEMINI_API_KEY;
}

function avecGemini() {
  process.env.GEMINI_API_KEY = 'AIza_cle_de_test';
}

test('sans aucune clé, aucune requête ne part — l’étudiant dicte sur son appareil', async () => {
  sansCle();
  sansGemini();
  resetLocalCounters();
  let appele = 0;
  const resultat = await transcrireAudio({
    audio: AUDIO,
    typeMime: 'audio/webm',
    fetchImpl: async () => {
      appele += 1;
      return new Response('{}');
    },
  });
  assert.equal(resultat.ok, false);
  assert.equal(resultat.raison, 'sans_cle');
  assert.equal(resultat.repli, 'navigateur');
  assert.equal(appele, 0, 'aucune requête ne doit partir sans clé');
  assert.equal(transcriptionEnLigneDisponible(), false);
});

test('Groq injoignable : Gemini prend la main, sans rien demander à l’étudiant', async () => {
  sansCle();
  avecGemini();
  resetLocalCounters();
  const { appels, fetchImpl } = fauxGemini();
  const resultat = await transcrireAudio({ audio: AUDIO, typeMime: 'audio/webm;codecs=opus', secondes: 30, fetchImpl });

  assert.equal(resultat.ok, true, 'l’étudiant est transcrit, pas renvoyé vers un téléchargement');
  assert.equal(resultat.texte, 'Bonjour, voici mon avis.');
  assert.equal(resultat.moteur, 'gemini-audio');

  assert.equal(appels.length, 1, 'une seule requête : Groq n’a même pas été tenté, faute de clé');
  assert.match(appels[0].url, /generativelanguage\.googleapis\.com/);
  assert.match(appels[0].url, new RegExp(MODELE_GEMINI));

  const totaux = Object.fromEntries(pendingTotals().map((entree) => [entree.bucket, entree.count]));
  assert.equal(totaux['transcription.requests'], 1, 'le plafond du jour est consommé une fois');
  assert.equal(totaux['transcription.seconds'], 30);
  sansGemini();
});

test('la requête Gemini porte une consigne de fidélité et l’audio en base64', async () => {
  sansCle();
  avecGemini();
  resetLocalCounters();
  const { appels, fetchImpl } = fauxGemini();
  await transcrireAudio({ audio: AUDIO, typeMime: 'audio/webm', fetchImpl });

  const corps = JSON.parse(appels[0].init.body);
  const parties = corps.contents[0].parts;
  const texte = parties.find((partie) => typeof partie.text === 'string')?.text ?? '';
  const audioPartie = parties.find((partie) => partie.inline_data);

  assert.match(texte, /Transcris fidèlement/, 'sans consigne, un modèle résume au lieu de transcrire');
  assert.match(texte, /français/);
  assert.equal(corps.generationConfig.temperature, 0, 'aucune invention : la fidélité d’abord');
  assert.equal(audioPartie.inline_data.mime_type, 'audio/webm', 'le type est nettoyé de son codec');
  assert.equal(audioPartie.inline_data.data, btoa(String.fromCharCode(...AUDIO)), 'l’audio part bien, encodé');
  sansGemini();
});

test('les deux moteurs en ligne cohabitent : le réglé est essayé en premier', async () => {
  avecCle();
  avecGemini();
  resetLocalCounters();
  const { appels, fetchImpl } = fauxGemini();
  const resultat = await transcrireAudio({ audio: AUDIO, typeMime: 'audio/webm', moteur: 'gemini-audio', fetchImpl });
  assert.equal(resultat.moteur, 'gemini-audio');
  assert.equal(appels.length, 1, 'le moteur choisi par le propriétaire est respecté');
  assert.match(appels[0].url, /generativelanguage\.googleapis\.com/);
  sansGemini();
});

test('si Groq échoue et que Gemini est là, la chaîne continue sans l’étudiant', async () => {
  avecCle();
  avecGemini();
  resetLocalCounters();
  const urls = [];
  const fetchImpl = async (url, init) => {
    urls.push(String(url));
    if (String(url).includes('api.groq.com'))
      return new Response('{"error":"Access denied. Please check your network settings."}', { status: 403 });
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Texte dicté.' }] } }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  const resultat = await transcrireAudio({ audio: AUDIO, typeMime: 'audio/webm', fetchImpl });
  assert.equal(resultat.ok, true, 'le blocage de Groq n’est plus un mur');
  assert.equal(resultat.moteur, 'gemini-audio');
  assert.deepEqual(
    urls.map((url) => (url.includes('api.groq.com') ? 'groq' : 'gemini')),
    ['groq', 'gemini'],
    'Groq est bien tenté en premier, comme dans le prototype'
  );
  sansGemini();
});

test('le propriétaire a choisi l’appareil : le serveur n’envoie rien en ligne', async () => {
  avecCle();
  avecGemini();
  resetLocalCounters();
  let appele = 0;
  const resultat = await transcrireAudio({
    audio: AUDIO,
    typeMime: 'audio/webm',
    moteur: 'browser-whisper',
    fetchImpl: async () => {
      appele += 1;
      return new Response('{}');
    },
  });
  assert.equal(resultat.ok, false);
  assert.equal(resultat.repli, 'navigateur');
  assert.equal(appele, 0, 'le choix « sur l’appareil » doit être respecté coûte que coûte');
  sansGemini();
});

test('la clé lue dépend du moteur : Groq et Gemini ont chacun la leur', () => {
  avecCle();
  avecGemini();
  assert.equal(cleDuMoteur('groq-whisper'), 'gsk_de_remplacement_pour_les_tests');
  assert.equal(cleDuMoteur('gemini-audio'), 'AIza_cle_de_test');
  sansGemini();
  assert.equal(cleDuMoteur('gemini-audio'), '');
  assert.equal(transcriptionEnLigneDisponible(), true, 'Groq seul suffit à dire « branché »');
});
