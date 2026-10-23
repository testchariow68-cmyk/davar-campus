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
