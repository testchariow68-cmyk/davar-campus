/**
 * Tout ce qu'il faut pour MONTRER le campus : du contenu, deux comptes,
 * et les jetons de session pour les captures.
 *
 * Ce script est versionné (contrairement à dev-data/) : un vidage
 * d'environnement ne peut plus l'emporter. Il fabrique aussi les trois
 * fichiers de démonstration servis par public/demo/ (non versionnés, eux).
 *
 * Usage : node --experimental-strip-types scripts/demo.mjs
 *         (le serveur « npm run dev » doit tourner)
 */
import { DatabaseSync } from 'node:sqlite';
import { writeFileSync, mkdirSync } from 'node:fs';
import { deriveClientKey } from '../lib/client/derive.ts';

const BASE = 'http://localhost:3000';
const MOT_DE_PASSE = 'Davar2026!';
const ORIGINE = { origin: BASE, 'content-type': 'application/json' };
const FORMATION = 't-orateur';
const RACINE = '/home/user/davar-campus/davar-app';

// ---------------------------------------------------------------- fichiers
function fabriquerFichiers() {
  const dossier = RACINE + '/public/demo';
  mkdirSync(dossier, { recursive: true });

  // Un vrai PDF d'une page.
  const lignes = [
    [72, 760, 22, 'Fiche respiration & ancrage'],
    [72, 726, 12, 'Davar Academie - Devenir un excellent orateur'],
    [72, 686, 12, '1. Debout, les pieds a la largeur du bassin.'],
    [72, 662, 12, '2. Une main sur le ventre, l autre sur la poitrine.'],
    [72, 638, 12, '3. Inspirez en quatre temps, sans soulever la poitrine.'],
    [72, 614, 12, '4. Retenez deux temps. Expirez en six temps.'],
    [72, 590, 12, '5. Repetez dix fois, deux fois par jour.'],
    [72, 546, 12, 'Le souffle abdominal est la base de la voix posee.'],
    [72, 522, 12, 'Il ne se voit pas : il s entend.'],
  ];
  let contenu = 'BT\n';
  for (const [x, y, t, txt] of lignes) {
    contenu += `/F${t >= 20 ? 1 : 2} ${t} Tf\n1 0 0 1 ${x} ${y} Tm\n(${txt}) Tj\n`;
  }
  contenu += 'ET\n';
  const flux = Buffer.from(contenu, 'latin1');
  const objets = [
    Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'),
    Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
    Buffer.from('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>'),
    Buffer.concat([Buffer.from(`<< /Length ${flux.length} >>\nstream\n`), flux, Buffer.from('\nendstream')]),
    Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>'),
    Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'),
  ];
  let pdf = Buffer.from('%PDF-1.4\n');
  const decalages = [];
  objets.forEach((o, i) => {
    decalages.push(pdf.length);
    pdf = Buffer.concat([pdf, Buffer.from(`${i + 1} 0 obj\n`), o, Buffer.from('\nendobj\n')]);
  });
  const xref = pdf.length;
  let table = `xref\n0 ${objets.length + 1}\n0000000000 65535 f \n`;
  for (const d of decalages) table += `${String(d).padStart(10, '0')} 00000 n \n`;
  pdf = Buffer.concat([
    pdf,
    Buffer.from(table),
    Buffer.from(`trailer\n<< /Size ${objets.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`),
  ]);
  writeFileSync(dossier + '/fiche-respiration.pdf', pdf);

  // Un schéma en SVG.
  writeFileSync(
    dossier + '/schema-souffle.svg',
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 400" width="640" height="400">
  <rect width="640" height="400" fill="#f7f4ef"/>
  <text x="32" y="52" font-family="Georgia,serif" font-size="26" fill="#1b1b1b">Schema du souffle</text>
  <text x="32" y="78" font-family="Georgia,serif" font-size="14" fill="#6b6b6b">Inspirer 4 temps - retenir 2 - expirer 6</text>
  <g stroke="#c8a24a" stroke-width="2" fill="none">
    <path d="M40 300 C 120 300, 140 140, 220 140 S 300 300, 380 300 S 460 140, 540 140 S 600 300, 620 300"/>
  </g>
  <g fill="#1b1b1b" font-family="Georgia,serif" font-size="13">
    <text x="150" y="120">inspirer</text>
    <text x="330" y="120">retenir</text>
    <text x="470" y="120">expirer</text>
  </g>
  <g stroke="#b9b2a6" stroke-width="1">
    <line x1="40" y1="300" x2="620" y2="300"/>
    <line x1="40" y1="90" x2="40" y2="330"/>
  </g>
</svg>
`,
    'utf8',
  );

  // Un guidage audio : une respiration qui monte et descend, en WAV.
  const fe = 22050;
  const duree = 8;
  const trames = [];
  for (let n = 0; n < fe * duree; n += 1) {
    const t = n / fe;
    const cycle = duree / 4;
    const phase = t % cycle;
    const env = Math.sin((Math.PI * phase) / cycle) ** 2;
    const v = 0.28 * env * (Math.sin(2 * Math.PI * 220 * t) * 0.5 + Math.sin(2 * Math.PI * 330 * t) * 0.3);
    const b = Buffer.alloc(2);
    b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32000));
    trames.push(b);
  }
  const donnees = Buffer.concat(trames);
  const entete = Buffer.alloc(44);
  entete.write('RIFF', 0);
  entete.writeUInt32LE(36 + donnees.length, 4);
  entete.write('WAVEfmt ', 8);
  entete.writeUInt32LE(16, 16);
  entete.writeUInt16LE(1, 20);
  entete.writeUInt16LE(1, 22);
  entete.writeUInt32LE(fe, 24);
  entete.writeUInt32LE(fe * 2, 28);
  entete.writeUInt16LE(2, 32);
  entete.writeUInt16LE(16, 34);
  entete.write('data', 36);
  entete.writeUInt32LE(donnees.length, 40);
  writeFileSync(dossier + '/souffle-guide.wav', Buffer.concat([entete, donnees]));
  console.log('fichiers de demonstration : 3 ecrits dans public/demo/');
}

// ------------------------------------------------------------------ contenu
const CHAPITRES = [
  { id: 'chap-demo-1', titre: 'Les fondations', resume: 'Le souffle, la voix, la présence.' },
  { id: 'chap-demo-2', titre: 'Structurer', resume: 'Ouvrir, tenir, conclure.' },
  { id: 'chap-demo-3', titre: 'Convaincre', resume: "L'auditoire et le dernier mot." },
];

const MODULES = [
  { id: 'mod-demo-1-1', chapitre: 'chap-demo-1', titre: 'Respirer juste', resume: 'Poser le souffle avant les mots.' },
  { id: 'mod-demo-1-2', chapitre: 'chap-demo-1', titre: 'La voix posée', resume: 'Timbre, volume, silence.' },
  { id: 'mod-demo-2-1', chapitre: 'chap-demo-2', titre: 'Ouvrir fort', resume: 'Les dix premières secondes.' },
  { id: 'mod-demo-2-2', chapitre: 'chap-demo-2', titre: 'Le plan en trois temps', resume: 'Une idée, trois mouvements.' },
  { id: 'mod-demo-3-1', chapitre: 'chap-demo-3', titre: "L'auditoire", resume: 'Lire la salle.' },
  { id: 'mod-demo-3-2', chapitre: 'chap-demo-3', titre: 'Le dernier mot', resume: 'Finir sans retomber.' },
];

const COURS = [
  { id: 'les-demo-1-1-1', module: 'mod-demo-1-1', titre: 'Le souffle abdominal', duree: 12, ratio: '16:9' },
  { id: 'les-demo-1-1-2', module: 'mod-demo-1-1', titre: 'Le rythme de la phrase', duree: 9, ratio: '16:9' },
  { id: 'les-demo-1-2-1', module: 'mod-demo-1-2', titre: 'Trouver son timbre', duree: 11, ratio: '16:9' },
  { id: 'les-demo-1-2-2', module: 'mod-demo-1-2', titre: 'Le silence qui porte', duree: 8, ratio: '16:9' },
  { id: 'les-demo-2-1-1', module: 'mod-demo-2-1', titre: "L'accroche", duree: 10, ratio: '16:9' },
  { id: 'les-demo-2-1-2', module: 'mod-demo-2-1', titre: 'La première impression', duree: 7, ratio: '9:16' },
  { id: 'les-demo-2-2-1', module: 'mod-demo-2-2', titre: 'Annoncer, démontrer, conclure', duree: 14, ratio: '16:9' },
  { id: 'les-demo-2-2-2', module: 'mod-demo-2-2', titre: 'Les transitions', duree: 6, ratio: '16:9' },
  { id: 'les-demo-3-1-1', module: 'mod-demo-3-1', titre: 'Lire la salle', duree: 13, ratio: '16:9' },
  { id: 'les-demo-3-1-2', module: 'mod-demo-3-1', titre: "L'objection", duree: 9, ratio: '16:9' },
  { id: 'les-demo-3-2-1', module: 'mod-demo-3-2', titre: 'La chute', duree: 10, ratio: '16:9' },
];

const FICHIERS = [
  { id: 'fic-demo-1', cours: 'les-demo-1-1-1', kind: 'illustration', titre: 'Complément : la posture de l’orateur', type: 'video', url: 'https://videos.davarcampus.ci/demo/posture.mp4', duree: '6:00', ratio: '16:9', taille: '24 Mo' },
  { id: 'fic-demo-2', cours: 'les-demo-1-1-1', kind: 'illustration', titre: 'Échauffement vocal en 5 minutes', type: 'video', url: 'https://videos.davarcampus.ci/demo/echauffement.mp4', duree: '5:00', ratio: '9:16', taille: '18 Mo' },
  { id: 'fic-demo-3', cours: 'les-demo-1-1-1', kind: 'ressource', titre: 'Fiche respiration & ancrage', type: 'pdf', url: '/demo/fiche-respiration.pdf', duree: null, ratio: null, taille: '1,1 Mo' },
  { id: 'fic-demo-4', cours: 'les-demo-1-1-1', kind: 'ressource', titre: 'Le souffle guidé', type: 'audio', url: '/demo/souffle-guide.wav', duree: null, ratio: null, taille: '4,2 Mo' },
  { id: 'fic-demo-5', cours: 'les-demo-1-1-1', kind: 'ressource', titre: 'Schéma du souffle', type: 'image', url: '/demo/schema-souffle.svg', duree: null, ratio: null, taille: '320 Ko' },
  { id: 'fic-demo-6', cours: 'les-demo-1-1-2', kind: 'ressource', titre: 'Partition du rythme', type: 'doc', url: '/demo/fiche-respiration.pdf', duree: null, ratio: null, taille: '760 Ko' },
];

function semerContenu(db) {
  db.exec("DELETE FROM lesson_assets WHERE id LIKE 'fic-demo-%'");
  db.exec("DELETE FROM course_lessons WHERE id LIKE 'les-demo-%'");
  db.exec("DELETE FROM course_modules WHERE id LIKE 'mod-demo-%'");
  db.exec("DELETE FROM course_chapters WHERE id LIKE 'chap-demo-%'");

  const insChapitre = db.prepare('INSERT INTO course_chapters(id, training_id, position, title, summary) VALUES (?,?,?,?,?)');
  const insModule = db.prepare('INSERT INTO course_modules(id, training_id, position, title, summary, chapter_id) VALUES (?,?,?,?,?,?)');
  const insCours = db.prepare('INSERT INTO course_lessons(id, module_id, position, title, kind, resource_url, duration_min, content_text, ratio) VALUES (?,?,?,?,?,?,?,?,?)');
  const insFichier = db.prepare('INSERT INTO lesson_assets(id, lesson_id, kind, position, title, type, url, duration, ratio, size) VALUES (?,?,?,?,?,?,?,?,?,?)');

  CHAPITRES.forEach((c, i) => insChapitre.run(c.id, FORMATION, i + 1, c.titre, c.resume));
  MODULES.forEach((m) => {
    insModule.run(m.id, FORMATION, MODULES.indexOf(m) + 1, m.titre, m.resume, m.chapitre);
  });
  COURS.forEach((l) => {
    const rang = COURS.filter((x) => x.module === l.module).indexOf(l) + 1;
    insCours.run(l.id, l.module, rang, l.titre, 'video', 'https://videos.davarcampus.ci/demo/' + l.id + '.mp4', l.duree, 'Dans ce cours : ' + l.titre + '.', l.ratio);
  });
  FICHIERS.forEach((f) => {
    const rang = FICHIERS.filter((x) => x.cours === f.cours && x.kind === f.kind).indexOf(f) + 1;
    insFichier.run(f.id, f.cours, f.kind, rang, f.titre, f.type, f.url, f.duree, f.ratio, f.taille);
  });

  const compte = (t) => db.prepare('SELECT COUNT(*) AS n FROM ' + t).get().n;
  console.log(`contenu : ${compte('course_chapters')} chapitres, ${compte('course_modules')} modules, ${compte('course_lessons')} cours, ${compte('lesson_assets')} fichiers`);
}

// ------------------------------------------------------------------ comptes
const COMPTES = [
  { email: 'visite@davar.test', nom: 'Awa Visiteuse', role: null },
  { email: 'direction@davar.test', nom: 'Monsieur Koffi', role: 'admin' },
];

async function parametres(email) {
  return fetch(BASE + '/api/auth/params', {
    method: 'POST',
    headers: ORIGINE,
    body: JSON.stringify({ email }),
  }).then((r) => r.json());
}

async function creerComptes(db) {
  for (const compte of COMPTES) {
    const deja = db.prepare('SELECT id FROM users WHERE email_normalized=?').get(compte.email);
    if (deja) {
      console.log(compte.email + ' : déjà là.');
    } else {
      const p = await parametres(compte.email);
      if (!p.salt || !p.iterations) throw new Error('paramètres indisponibles pour ' + compte.email);
      const verifier = await deriveClientKey(MOT_DE_PASSE, { salt: p.salt, iterations: p.iterations });
      const r = await fetch(BASE + '/api/auth/register', {
        method: 'POST',
        headers: ORIGINE,
        body: JSON.stringify({ email: compte.email, displayName: compte.nom, verifier, salt: p.salt, iterations: p.iterations }),
      });
      if (!r.ok) throw new Error(compte.email + ' -> ' + (await r.text()).slice(0, 200));
      console.log(compte.email + ' : créé.');
    }
    db.prepare('UPDATE users SET email_verified_at_ms=?, status=? WHERE email_normalized=?').run(Date.now(), 'active', compte.email);
    if (compte.role) db.prepare('UPDATE users SET role=? WHERE email_normalized=?').run(compte.role, compte.email);
  }

  const eleve = db.prepare('SELECT id FROM users WHERE email_normalized=?').get('visite@davar.test');
  db.prepare('INSERT OR REPLACE INTO enrollments(user_id, training_id, source, sale_id, acquired_at_ms) VALUES (?,?,?,?,?)')
    .run(eleve.id, FORMATION, 'staff_grant', null, Date.now());
}

async function sessions(db) {
  const jetons = {};
  for (const { email } of COMPTES) {
    const p = await parametres(email);
    const verifier = await deriveClientKey(MOT_DE_PASSE, { salt: p.salt, iterations: p.iterations });
    const r = await fetch(BASE + '/api/auth/login', {
      method: 'POST',
      headers: ORIGINE,
      body: JSON.stringify({ email, verifier }),
    });
    const m = /davar_session=([^;,\s]+)/.exec(r.headers.get('set-cookie') ?? '');
    if (!m) throw new Error('pas de session pour ' + email);
    jetons[email] = m[1];
  }
  mkdirSync('/tmp/shot', { recursive: true });
  writeFileSync('/tmp/shot/jetons.json', JSON.stringify(jetons, null, 2));

  // Le portail d'attentes barre l'entrée du campus : on y répond une fois.
  const r = await fetch(BASE + '/api/campus/attentes', {
    method: 'POST',
    headers: { ...ORIGINE, cookie: 'davar_session=' + jetons['visite@davar.test'] },
    body: JSON.stringify({
      formationId: FORMATION,
      body: 'Je voudrais parler en public sans que ma voix tremble, et savoir structurer un discours qui tient du debut a la fin.',
    }),
  });
  const j = await r.json();
  console.log('attentes :', j.ok ? 'enregistrées' : JSON.stringify(j));
}

// --------------------------------------------------------------------- tout
fabriquerFichiers();
const db = new DatabaseSync('file:' + RACINE + '/dev-data/davar-dev.db');
semerContenu(db);
await creerComptes(db);
await sessions(db);
console.log('jetons dans /tmp/shot/jetons.json — mot de passe :', MOT_DE_PASSE);
