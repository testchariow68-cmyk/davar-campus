/**
 * RÉSEAUX SOCIAUX — le défilement discret du bas du campus.
 *
 * Décisions du propriétaire, portées du prototype :
 *   - les plateformes qu'un étudiant ne suit pas encore défilent en bas ;
 *   - « S'abonner » ouvre la VRAIE page du réseau, puis l'étudiant confirme ;
 *   - sa confirmation est horodatée, et apparaît chez le propriétaire ;
 *   - dès qu'il confirme, la plateforme disparaît de SON bandeau ;
 *   - le propriétaire (Super Admin) ne voit jamais le bandeau social.
 *
 * Aucune API publique ne permet de vérifier un abonnement : la confirmation
 * horodatée est le contrôle, exactement comme le prototype l'assume.
 */
import type { Db } from './auth-core.ts';
import { notifier } from './notifications.ts';
import { lienSocialValide, lireReglages } from './settings.ts';

function texte(valeur: unknown, defaut = ''): string {
  return typeof valeur === 'string' ? valeur : defaut;
}

function entier(valeur: unknown): number | null {
  if (typeof valeur === 'number' && Number.isFinite(valeur)) return Math.trunc(valeur);
  if (typeof valeur === 'bigint') return Number(valeur);
  return null;
}

/** Les trois plateformes du propriétaire, avec le nom exact du prototype. */
export const PLATEFORMES = [
  { id: 'instagram', reglage: 'social.instagram', nom: 'Instagram' },
  { id: 'tiktok', reglage: 'social.tiktok', nom: 'TikTok' },
  { id: 'facebook', reglage: 'social.facebook', nom: 'Facebook' },
] as const;

export type Plateforme = { id: string; nom: string; lien: string };

/** Les plateformes réellement proposées : un lien absent ou douteux n'existe pas. */
export async function plateformes(db: Db): Promise<Plateforme[]> {
  const reglages = await lireReglages(db);
  return PLATEFORMES.map((entree) => ({
    id: entree.id,
    nom: entree.nom,
    lien: texte(reglages[entree.reglage]),
  })).filter((plateforme) => plateforme.lien.length > 0 && lienSocialValide(plateforme.lien));
}

export function plateformeConnue(id: string): boolean {
  return PLATEFORMES.some((entree) => entree.id === id);
}

/** Les plateformes qu'un étudiant n'a pas encore confirmées. */
export async function plateformesNonSuivies(
  db: Db,
  userId: string
): Promise<Array<{ id: string; nom: string; lien: string }>> {
  const toutes = await plateformes(db);
  if (toutes.length === 0) return [];
  let suivies: string[] = [];
  try {
    const lignes = await db.execute({
      sql: 'SELECT platform FROM social_subscriptions WHERE user_id = ?',
      args: [userId],
    });
    suivies = lignes.rows.map((row) => texte(row.platform));
  } catch {
    suivies = [];
  }
  return toutes.filter((plateforme) => !suivies.includes(plateforme.id));
}

/** La confirmation de l'étudiant, horodatée. Repasser ne change pas la date. */
export async function confirmerAbonnement(
  db: Db,
  userId: string,
  plateforme: string,
  maintenant = Date.now()
): Promise<boolean> {
  if (!plateformeConnue(plateforme)) return false;
  const connues = await plateformes(db);
  const existante = connues.find((entree) => entree.id === plateforme);
  if (!existante) return false;
  await db.execute({
    sql: `INSERT INTO social_subscriptions(user_id, platform, link, confirmed_at_ms) VALUES (?,?,?,?)
          ON CONFLICT(user_id, platform) DO NOTHING`,
    args: [userId, plateforme, existante.lien, maintenant],
  });
  return true;
}

/** Ce que le propriétaire voit : qui s'est abonné, à quoi, quand. */
export async function abonnements(
  db: Db,
  limite = 100
): Promise<Array<{ etudiant: string; courriel: string; plateforme: string; lien: string; atMs: number }>> {
  try {
    const lignes = await db.execute({
      sql: `SELECT u.display_name, u.email_normalized, s.platform, s.link, s.confirmed_at_ms
            FROM social_subscriptions s JOIN users u ON u.id = s.user_id
            ORDER BY s.confirmed_at_ms DESC LIMIT ?`,
      args: [Math.min(Math.max(limite, 1), 500)],
    });
    return lignes.rows.map((row) => ({
      etudiant: texte(row.display_name),
      courriel: texte(row.email_normalized),
      plateforme: texte(row.platform),
      lien: texte(row.link),
      atMs: entier(row.confirmed_at_ms) ?? 0,
    }));
  } catch {
    return [];
  }
}

/** Compteurs par plateforme, pour la vue du propriétaire. */
export async function totalParPlateforme(db: Db): Promise<Array<{ plateforme: string; total: number }>> {
  try {
    const lignes = await db.execute(
      'SELECT platform, COUNT(*) AS n FROM social_subscriptions GROUP BY platform ORDER BY platform'
    );
    return lignes.rows.map((row) => ({ plateforme: texte(row.platform), total: entier(row.n) ?? 0 }));
  } catch {
    return [];
  }
}

/**
 * Le bandeau d'annonce : un texte, une audience.
 * « all » tout le monde, « students » les étudiants seuls, « staff » l'équipe seule.
 */
export type Annonce = { texte: string; audience: 'all' | 'students' | 'staff' };

export function annonceDepuisReglages(reglages: Record<string, string>): Annonce | null {
  const texteBrut = texte(reglages['announce.text']).trim();
  if (texteBrut.length === 0 || reglages['announce.active'] !== '1') return null;
  const audience = reglages['announce.audience'];
  return {
    texte: texteBrut.slice(0, 300),
    audience: audience === 'students' || audience === 'staff' ? audience : 'all',
  };
}

export function annonceViseLUtilisateur(annonce: Annonce | null, role: 'student' | 'staff' | 'admin'): boolean {
  if (!annonce) return false;
  if (annonce.audience === 'all') return true;
  if (annonce.audience === 'staff') return role === 'staff' || role === 'admin';
  return role === 'student';
}


/* ---------------------------------------------------------------- cours --- */

/** Les six glyphes du prototype : ils restent des caractères Unicode, jamais des icônes SVG. */
export const EMOJIS_COURS = ['👍', '❤️', '🔥', '👏', '😂', '🤩'] as const;
export type EmojiCours = (typeof EMOJIS_COURS)[number];

export type ReactionCours = { emoji: EmojiCours; total: number; parMoi: boolean };
export type CommentaireCours = {
  id: string;
  parentId: string | null;
  auteurId: string;
  auteur: string;
  initiales: string;
  couleur: string;
  texte: string;
  atMs: number;
};
export type SocialCours = {
  reactions: ReactionCours[];
  totalReactions: number;
  commentaires: CommentaireCours[];
  totalCommentaires: number;
};

export class ErreurSocialCours extends Error {
  readonly code: 'not_enrolled' | 'invalid_input' | 'invalid_parent' | 'unavailable';

  constructor(code: 'not_enrolled' | 'invalid_input' | 'invalid_parent' | 'unavailable') {
    super(`cours_social:${code}`);
    this.name = 'ErreurSocialCours';
    this.code = code;
  }
}

const COULEURS_AVATAR = ['#7C3AED', '#6D28D9', '#C9A24B', '#2B6CB0', '#1F8A4C', '#C0392B'];

function initialesPour(nom: string): string {
  const morceaux = nom.trim().split(/\s+/).filter(Boolean);
  return (morceaux.map((mot) => mot[0]).join('').slice(0, 2) || '??').toUpperCase();
}

function couleurPour(id: string): string {
  let somme = 0;
  for (let index = 0; index < id.length; index += 1) somme = (somme * 31 + id.charCodeAt(index)) | 0;
  return COULEURS_AVATAR[Math.abs(somme) % COULEURS_AVATAR.length];
}

function estEmojiCours(value: unknown): value is EmojiCours {
  return typeof value === 'string' && (EMOJIS_COURS as readonly string[]).includes(value);
}

/** Le droit de lire/écrire les interactions : le cours appartient à une formation suivie. */
async function leconAccessible(
  db: Db,
  userId: string,
  lessonId: string,
  apercu = false
): Promise<boolean> {
  const resultat = await db.execute({
    sql: `SELECT t.published,
                 EXISTS(SELECT 1 FROM enrollments e WHERE e.training_id = m.training_id AND e.user_id = ?) AS enrolled
          FROM course_lessons l
          JOIN course_modules m ON m.id = l.module_id
          JOIN trainings t ON t.id = m.training_id
          WHERE l.id = ?`,
    args: [userId, lessonId],
  });
  const row = resultat.rows[0];
  if (!row) return false;
  if (entier(row.enrolled) === 1) return true;
  return apercu && entier(row.published) === 1;
}

/**
 * Lecture publique et cohérente du cours : les mêmes compteurs et les mêmes
 * commentaires sont renvoyés à chaque étudiant inscrit.
 */
export async function lireCoursSocial(
  db: Db,
  userId: string,
  lessonId: string,
  apercu = false
): Promise<SocialCours | null> {
  if (typeof lessonId !== 'string' || lessonId.length < 3 || lessonId.length > 120) return null;
  if (!(await leconAccessible(db, userId, lessonId, apercu))) return null;

  const [compteurs, miens, commentaires] = await Promise.all([
    db.execute({
      sql: 'SELECT emoji, COUNT(*) AS n FROM lesson_reactions WHERE lesson_id = ? GROUP BY emoji',
      args: [lessonId],
    }),
    db.execute({
      sql: 'SELECT emoji FROM lesson_reactions WHERE lesson_id = ? AND user_id = ?',
      args: [lessonId, userId],
    }),
    db.execute({
      sql: `SELECT c.id, c.parent_id, c.user_id, u.display_name, c.text, c.created_at_ms
            FROM lesson_comments c JOIN users u ON u.id = c.user_id
            WHERE c.lesson_id = ?
            ORDER BY c.created_at_ms DESC LIMIT 500`,
      args: [lessonId],
    }),
  ]);

  const nombres = new Map<string, number>();
  for (const row of compteurs.rows) {
    if (estEmojiCours(row.emoji)) nombres.set(row.emoji, entier(row.n) ?? 0);
  }
  const miensSet = new Set(miens.rows.map((row) => texte(row.emoji)));
  const reactions = EMOJIS_COURS.map((emoji) => ({
    emoji,
    total: nombres.get(emoji) ?? 0,
    parMoi: miensSet.has(emoji),
  }));
  const totalReactions = reactions.reduce((total, reaction) => total + reaction.total, 0);

  const liste = commentaires.rows.map((row) => {
    const auteurId = texte(row.user_id);
    const auteur = texte(row.display_name, 'Membre');
    return {
      id: texte(row.id),
      parentId: row.parent_id === null || row.parent_id === undefined ? null : texte(row.parent_id),
      auteurId,
      auteur,
      initiales: initialesPour(auteur),
      couleur: couleurPour(auteurId),
      texte: texte(row.text),
      atMs: entier(row.created_at_ms) ?? 0,
    } satisfies CommentaireCours;
  });

  return {
    reactions,
    totalReactions,
    commentaires: liste,
    totalCommentaires: liste.length,
  };
}

/** Une réaction = un interrupteur, sans supprimer celles des autres étudiants. */
export async function basculerReactionCours(
  db: Db,
  userId: string,
  lessonId: string,
  emoji: unknown,
  maintenant = Date.now()
): Promise<SocialCours> {
  if (typeof lessonId !== 'string' || lessonId.length < 3 || lessonId.length > 120 || !estEmojiCours(emoji))
    throw new ErreurSocialCours('invalid_input');
  if (!(await leconAccessible(db, userId, lessonId))) throw new ErreurSocialCours('not_enrolled');

  const existante = await db.execute({
    sql: 'SELECT id FROM lesson_reactions WHERE lesson_id = ? AND user_id = ? AND emoji = ?',
    args: [lessonId, userId, emoji],
  });
  if (existante.rows.length > 0) {
    await db.execute({
      sql: 'DELETE FROM lesson_reactions WHERE lesson_id = ? AND user_id = ? AND emoji = ?',
      args: [lessonId, userId, emoji],
    });
  } else {
    await db.execute({
      sql: `INSERT INTO lesson_reactions(id, lesson_id, user_id, emoji, created_at_ms)
            VALUES (?, ?, ?, ?, ?)`,
      args: [`react_${maintenant.toString(36)}_${Math.random().toString(36).slice(2, 10)}`, lessonId, userId, emoji, maintenant],
    });
  }
  const social = await lireCoursSocial(db, userId, lessonId);
  if (!social) throw new ErreurSocialCours('unavailable');
  return social;
}

/** Publication d'un commentaire racine ou d'une réponse, visible par tous les inscrits. */
export async function ajouterCommentaireCours(
  db: Db,
  userId: string,
  lessonId: string,
  contenu: unknown,
  parentId: unknown,
  maintenant = Date.now()
): Promise<SocialCours> {
  if (typeof lessonId !== 'string' || lessonId.length < 3 || lessonId.length > 120)
    throw new ErreurSocialCours('invalid_input');
  const texteCommentaire = typeof contenu === 'string' ? contenu.trim() : '';
  if (texteCommentaire.length === 0 || texteCommentaire.length > 2000)
    throw new ErreurSocialCours('invalid_input');
  if (!(await leconAccessible(db, userId, lessonId))) throw new ErreurSocialCours('not_enrolled');

  const reponseA = typeof parentId === 'string' && parentId.length > 0 ? parentId : null;
  let destinataire = '';
  if (reponseA) {
    const parent = await db.execute({
      sql: 'SELECT user_id, parent_id FROM lesson_comments WHERE id = ? AND lesson_id = ?',
      args: [reponseA, lessonId],
    });
    const ligne = parent.rows[0];
    if (!ligne || (ligne.parent_id !== null && ligne.parent_id !== undefined))
      throw new ErreurSocialCours('invalid_parent');
    destinataire = texte(ligne.user_id);
  }

  const id = `cmt_${maintenant.toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  await db.execute({
    sql: `INSERT INTO lesson_comments(id, lesson_id, user_id, parent_id, text, created_at_ms)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [id, lessonId, userId, reponseA, texteCommentaire, maintenant],
  });

  if (destinataire && destinataire !== userId) {
    const auteur = await db.execute({ sql: 'SELECT display_name FROM users WHERE id = ?', args: [userId] });
    const nom = texte(auteur.rows[0]?.display_name, 'Un membre');
    try {
      await notifier(
        db,
        {
          userId: destinataire,
          kind: 'reply',
          titre: 'Quelqu’un a répondu à votre commentaire',
          corps: `${nom} : « ${texteCommentaire.slice(0, 70)}${texteCommentaire.length > 70 ? '…' : ''} »`,
        },
        maintenant
      );
    } catch {
      /* Une notification ne doit jamais empêcher la publication publique. */
    }
  }

  const social = await lireCoursSocial(db, userId, lessonId);
  if (!social) throw new ErreurSocialCours('unavailable');
  return social;
}
