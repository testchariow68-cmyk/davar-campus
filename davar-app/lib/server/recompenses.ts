/**
 * RÉCOMPENSES — badges de parcours et badges de formation.
 *
 * Le catalogue est celui du prototype, repris mot pour mot : « L'application
 * n'invente jamais un nom, une icône, une couleur. » Trois familles :
 *   - parcours : Premier Pas, En Route, Régularité, Persévérance, Retour en Force ;
 *   - accomplissement : Mission Accomplie ;
 *   - formation : un badge par formation terminée (10 emplacements prévus).
 *
 * L'attribution est automatique quand la règle est remplie, et manuelle quand la
 * direction le décide — les deux sont journalisées par la date.
 */
import type { Db } from './auth-core';

function texte(valeur: unknown, defaut = ''): string {
  return typeof valeur === 'string' ? valeur : defaut;
}

function entier(valeur: unknown, defaut = 0): number {
  if (typeof valeur === 'number' && Number.isFinite(valeur)) return Math.trunc(valeur);
  if (typeof valeur === 'bigint') return Number(valeur);
  return defaut;
}

export type DefinitionBadge = {
  id: string;
  name: string;
  cat: string;
  icon: string;
  description: string | null;
  shortText: string | null;
  emotionText: string | null;
  trainingId: string | null;
  position: number;
  autoRule: string | null;
};

/**
 * Les trois badges de parcours écrits en toutes lettres dans le prototype.
 * Les textes viennent de `data.js` : ils sont recopiés, jamais réinventés.
 */
export const BADGES_PARCOURS: Array<Omit<DefinitionBadge, 'trainingId' | 'autoRule'> & { autoRule: string }> = [
  {
    id: 'BADGE_PREMIER_PAS',
    name: 'Premier Pas',
    cat: 'parcours',
    icon: 'rw_door',
    description: 'Reconnaît la première entrée réelle dans le Campus, après l’activation de l’accès.',
    shortText: 'Vous avez choisi de commencer. Et tout parcours commence ainsi.',
    emotionText:
      'Il n’est pas nécessaire de savoir jusqu’où l’on ira pour faire le premier pas. Aujourd’hui, vous avez simplement décidé de commencer.',
    position: 1,
    autoRule: 'premiere_connexion',
  },
  {
    id: 'BADGE_EN_ROUTE',
    name: 'En Route',
    cat: 'parcours',
    icon: 'rw_path',
    description: 'Reconnaît le début réel du parcours pédagogique : un premier contenu appris, une première progression.',
    shortText: 'Vous n’êtes plus au point de départ. Vous êtes en chemin.',
    emotionText:
      'Un commencement devient un parcours lorsque l’on choisit d’avancer. Continuez à votre rythme. Chaque étape compte.',
    position: 2,
    autoRule: 'premiere_lecon',
  },
  {
    id: 'BADGE_REGULARITE',
    name: 'Régularité',
    cat: 'parcours',
    icon: 'rw_lines',
    description: 'Reconnaît une progression régulière, semaine après semaine.',
    shortText: 'La constance est votre force.',
    emotionText: 'Ce n’est pas l’intensité d’un jour qui construit un orateur, c’est la répétition fidèle.',
    position: 3,
    autoRule: 'trois_jours',
  },
  {
    id: 'BADGE_PERSEVERANCE',
    name: 'Persévérance',
    cat: 'parcours',
    icon: 'rw_resume',
    description: 'Reconnaît le retour au travail après une interruption.',
    shortText: 'Vous êtes revenu. C’est là que tout se décide.',
    emotionText: 'Revenir après une pause demande plus de courage que continuer sans effort. Vous l’avez fait.',
    position: 4,
    autoRule: 'retour_apres_pause',
  },
  {
    id: 'BADGE_RETOUR_EN_FORCE',
    name: 'Retour en Force',
    cat: 'parcours',
    icon: 'rw_circle',
    description: 'Reconnaît un retour suivi d’un progrès réel.',
    shortText: 'Vous n’êtes pas seulement revenu : vous avez avancé.',
    emotionText: 'La pause n’a rien enlevé à votre valeur. Elle a seulement retardé la suite — que vous venez d’écrire.',
    position: 5,
    autoRule: 'retour_avec_progres',
  },
  {
    id: 'BADGE_MISSION_ACCOMPLIE',
    name: 'Mission Accomplie',
    cat: 'accomplissement',
    icon: 'rw_seal',
    description: 'Reconnaît une formation menée jusqu’au bout, progression complète.',
    shortText: 'Vous avez tenu jusqu’au bout.',
    emotionText: 'Terminer est rare. Vous faites partie de ceux qui finissent ce qu’ils commencent.',
    position: 6,
    autoRule: 'formation_terminee',
  },
];

export async function installerCatalogue(db: Db, formations: Array<{ id: string; title: string }>, maintenant = Date.now()): Promise<number> {
  let posees = 0;
  for (const badge of BADGES_PARCOURS) {
    await db.execute({
      sql: `INSERT INTO badge_defs(id, name, cat, icon, description, short_text, emotion_text, training_id, position, auto_rule)
            VALUES (?,?,?,?,?,?,?,NULL,?,?)
            ON CONFLICT(id) DO UPDATE SET name = excluded.name, cat = excluded.cat, icon = excluded.icon,
              description = excluded.description, short_text = excluded.short_text,
              emotion_text = excluded.emotion_text, position = excluded.position, auto_rule = excluded.auto_rule`,
      args: [badge.id, badge.name, badge.cat, badge.icon, badge.description, badge.shortText, badge.emotionText, badge.position, badge.autoRule],
    });
    posees += 1;
  }
  // Un badge de formation par formation : « un badge par formation terminée ».
  let rang = 1;
  for (const formation of formations) {
    const id = `BADGE_FORMATION_${String(rang).padStart(2, '0')}`;
    await db.execute({
      sql: `INSERT INTO badge_defs(id, name, cat, icon, description, short_text, emotion_text, training_id, position, auto_rule)
            VALUES (?,?, 'formation', 'quote', ?, ?, ?, ?, ?, 'formation_terminee')
            ON CONFLICT(id) DO UPDATE SET name = excluded.name, training_id = excluded.training_id,
              description = excluded.description`,
      args: [
        id,
        formation.title,
        `Reconnaît la formation « ${formation.title} » menée jusqu’au bout.`,
        'Votre travail porte ses fruits.',
        'Chaque module traversé vous a rapproché de la personne que vous voulez devenir.',
        formation.id,
        100 + rang,
      ],
    });
    posees += 1;
    rang += 1;
  }
  void maintenant;
  return posees;
}

export async function attribuerBadge(
  db: Db,
  options: { userId: string; badgeId: string; trainingId?: string | null; source?: 'auto' | 'manuel'; awardedBy?: string | null },
  maintenant = Date.now()
): Promise<boolean> {
  const resultat = await db.execute({
    sql: `INSERT INTO badge_awards(id, user_id, badge_id, training_id, source, awarded_by, at_ms)
          VALUES (?,?,?,?,?,?,?)
          ON CONFLICT(user_id, badge_id) DO NOTHING`,
    args: [
      `baw_${maintenant.toString(36)}${Math.random().toString(36).slice(2, 8)}`,
      options.userId,
      options.badgeId,
      options.trainingId ?? null,
      options.source ?? 'auto',
      options.awardedBy ?? null,
      maintenant,
    ],
  });
  return (resultat.rowsAffected ?? 0) > 0;
}

export type BadgeObtenu = DefinitionBadge & { obtenuLeMs: number; source: string };

export async function badgesDeEtudiant(db: Db, userId: string): Promise<BadgeObtenu[]> {
  const lignes = await db.execute({
    sql: `SELECT d.id, d.name, d.cat, d.icon, d.description, d.short_text, d.emotion_text, d.training_id,
                 d.position, d.auto_rule, a.at_ms, a.source
          FROM badge_awards a JOIN badge_defs d ON d.id = a.badge_id
          WHERE a.user_id = ? ORDER BY a.at_ms DESC`,
    args: [userId],
  });
  return lignes.rows.map((row) => ({
    id: texte(row.id),
    name: texte(row.name),
    cat: texte(row.cat),
    icon: texte(row.icon, 'award'),
    description: texte(row.description) || null,
    shortText: texte(row.short_text) || null,
    emotionText: texte(row.emotion_text) || null,
    trainingId: texte(row.training_id) || null,
    position: entier(row.position),
    autoRule: texte(row.auto_rule) || null,
    obtenuLeMs: entier(row.at_ms),
    source: texte(row.source, 'auto'),
  }));
}

export async function catalogueBadges(db: Db): Promise<DefinitionBadge[]> {
  const lignes = await db.execute('SELECT * FROM badge_defs ORDER BY position');
  return lignes.rows.map((row) => ({
    id: texte(row.id),
    name: texte(row.name),
    cat: texte(row.cat),
    icon: texte(row.icon, 'award'),
    description: texte(row.description) || null,
    shortText: texte(row.short_text) || null,
    emotionText: texte(row.emotion_text) || null,
    trainingId: texte(row.training_id) || null,
    position: entier(row.position),
    autoRule: texte(row.auto_rule) || null,
  }));
}

/**
 * LES RÈGLES AUTOMATIQUES. Elles sont vérifiées après chaque leçon terminée :
 * aucun badge ne s'attribue par hasard, et un badge déjà obtenu ne se reprend pas.
 */
export async function verifierReglesBadges(
  db: Db,
  userId: string,
  maintenant = Date.now()
): Promise<string[]> {
  const obtenus: string[] = [];

  const progression = await db.execute({
    sql: `SELECT COUNT(*) AS terminees,
                 (SELECT COUNT(*) FROM course_lessons l JOIN course_modules m ON m.id = l.module_id
                   WHERE m.training_id = (SELECT m2.training_id FROM lesson_completions c
                     JOIN course_lessons l2 ON l2.id = c.lesson_id
                     JOIN course_modules m2 ON m2.id = l2.module_id
                     WHERE c.user_id = ? ORDER BY c.completed_at_ms LIMIT 1)) AS total
          FROM lesson_completions WHERE user_id = ?`,
    args: [userId, userId],
  });
  const terminees = entier(progression.rows[0]?.terminees);
  const total = entier(progression.rows[0]?.total);

  // Premier Pas : dès la première connexion réelle (compte actif).
  if (await attribuerBadge(db, { userId, badgeId: 'BADGE_PREMIER_PAS' }, maintenant)) obtenus.push('BADGE_PREMIER_PAS');
  // En Route : un premier contenu réellement appris.
  if (terminees >= 1 && (await attribuerBadge(db, { userId, badgeId: 'BADGE_EN_ROUTE' }, maintenant))) obtenus.push('BADGE_EN_ROUTE');
  // Mission Accomplie : toute la formation traversée.
  if (total > 0 && terminees >= total && (await attribuerBadge(db, { userId, badgeId: 'BADGE_MISSION_ACCOMPLIE' }, maintenant)))
    obtenus.push('BADGE_MISSION_ACCOMPLIE');

  // Badge de la formation concernée, attribué en même temps que la mission.
  if (total > 0 && terminees >= total) {
    const formation = await db.execute({
      sql: `SELECT DISTINCT m.training_id FROM lesson_completions c
            JOIN course_lessons l ON l.id = c.lesson_id
            JOIN course_modules m ON m.id = l.module_id
            WHERE c.user_id = ?`,
      args: [userId],
    });
    for (const row of formation.rows) {
      const formationId = texte(row.training_id);
      if (!formationId) continue;
      const badge = await db.execute({
        sql: "SELECT id FROM badge_defs WHERE training_id = ? AND cat = 'formation' LIMIT 1",
        args: [formationId],
      });
      const badgeId = texte(badge.rows[0]?.id);
      if (badgeId && (await attribuerBadge(db, { userId, badgeId, trainingId: formationId }, maintenant))) obtenus.push(badgeId);
    }
  }
  return obtenus;
}
