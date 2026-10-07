/**
 * INVITATIONS — inviter quelqu'un que la plateforme ne connaît pas encore.
 *
 * Trois règles du prototype, reprises telles quelles :
 *   - une invitation se fait PAR E-MAIL (jamais un identifiant interne) ;
 *   - membre du staff : lien valable 7 jours ; accès gracieux étudiant : 3 jours ;
 *   - « s'il expire, rien n'est conservé en base : il n'existe qu'une fois son
 *     compte configuré » — donc aucun compte n'est créé par avance.
 *
 * Le lien n'est rangé qu'en empreinte : même avec la base, on n'entre pas.
 */
import { hashToken, newToken, normalizeEmail, type Db } from './auth-core.ts';
import { normaliserRoles, rolesEnLigne } from './equipe.ts';
import { mailerConfigured, sendEmail } from './mailer.ts';

function texte(valeur: unknown, defaut = ''): string {
  return typeof valeur === 'string' ? valeur : defaut;
}

function entier(valeur: unknown): number | null {
  if (typeof valeur === 'number' && Number.isFinite(valeur)) return Math.trunc(valeur);
  if (typeof valeur === 'bigint') return Number(valeur);
  return null;
}

/** Durées du prototype : 7 jours pour l'équipe, 3 jours pour la grâce. */
export const DUREE_JOURS: Record<string, number> = { staff: 7, student_grace: 3 };

export const LIBELLE_INVITATION: Record<string, string> = {
  staff: 'Membre de l’équipe',
  student_grace: 'Accès gracieux',
};

export type Invitation = {
  id: string;
  email: string;
  kind: string;
  roles: string;
  trainingId: string | null;
  formationTitre: string | null;
  expiresAtMs: number;
  createdAtMs: number;
};

export type ResultatInvitation = { ok: true; invitation: Invitation; token: string } | { ok: false; erreur: string };

function estAssezAncienne(expiresAtMs: number, maintenant: number): boolean {
  return expiresAtMs <= maintenant;
}

/** Relit une invitation par son identifiant (sans le lien). */
async function lire(db: Db, id: string): Promise<Invitation | null> {
  const lignes = await db.execute({
    sql: `SELECT i.id, i.email_normalized, i.kind, i.roles, i.training_id, i.created_at_ms, i.expires_at_ms,
                 t.title AS formation
          FROM invites i LEFT JOIN trainings t ON t.id = i.training_id
          WHERE i.id = ?`,
    args: [id],
  });
  const row = lignes.rows[0];
  if (!row) return null;
  return {
    id: texte(row.id),
    email: texte(row.email_normalized),
    kind: texte(row.kind),
    roles: texte(row.roles),
    trainingId: texte(row.training_id) || null,
    formationTitre: texte(row.formation) || null,
    expiresAtMs: entier(row.expires_at_ms) ?? 0,
    createdAtMs: entier(row.created_at_ms) ?? 0,
  };
}

/**
 * Crée l'invitation et son lien. Si un compte existe déjà pour cette adresse,
 * c'est un refus net : le prototype dit « Un compte existe déjà avec cet e-mail. »
 */
export async function creerInvitation(
  db: Db,
  champs: {
    email: string;
    kind: 'staff' | 'student_grace';
    roles?: string;
    trainingId?: string | null;
    message?: string;
    createur: string;
    baseUrl?: string | null;
  },
  maintenant = Date.now()
): Promise<ResultatInvitation> {
  const email = normalizeEmail(champs.email);
  if (!email.includes('@')) return { ok: false, erreur: 'adresse_invalide' };
  if (!(champs.kind in DUREE_JOURS)) return { ok: false, erreur: 'type_inconnu' };

  const existant = await db.execute({ sql: 'SELECT id FROM users WHERE email_normalized = ?', args: [email] });
  if (existant.rows.length > 0) return { ok: false, erreur: 'compte_existant' };

  const formation = champs.trainingId ? texte(champs.trainingId) : null;
  if (champs.kind === 'student_grace' && formation) {
    const verifie = await db.execute({ sql: 'SELECT id FROM trainings WHERE id = ?', args: [formation] });
    if (verifie.rows.length === 0) return { ok: false, erreur: 'formation_inconnue' };
  }

  // Une invitation en attente pour la même adresse est remplacée : on ne laisse
  // jamais traîner deux liens valables pour la même personne.
  await db.execute({
    sql: 'DELETE FROM invites WHERE email_normalized = ? AND used_at_ms IS NULL AND expires_at_ms > ?',
    args: [email, maintenant],
  });

  const id = `inv_${maintenant.toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const token = newToken(32);
  await db.execute({
    sql: `INSERT INTO invites(id, email_normalized, kind, roles, training_id, token_hash, message, created_by, created_at_ms, expires_at_ms)
          VALUES (?,?,?,?,?,?,?,?,?,?)`,
    args: [
      id,
      email,
      champs.kind,
      texte(champs.roles),
      formation,
      await hashToken(token),
      texte(champs.message).slice(0, 400),
      champs.createur,
      maintenant,
      maintenant + DUREE_JOURS[champs.kind] * 86_400_000,
    ],
  });

  const invitation = await lire(db, id);
  if (!invitation) return { ok: false, erreur: 'unavailable' };

  // L'envoi du lien est un service : s'il n'est pas configuré, l'invitation
  // existe quand même et le propriétaire peut transmettre le lien lui-même.
  if (mailerConfigured() && champs.baseUrl) {
    const lien = `${champs.baseUrl.replace(/\/$/, '')}/invitation?token=${encodeURIComponent(token)}`;
    const jours = DUREE_JOURS[champs.kind];
    try {
      await sendEmail(
        {
          to: email,
          subject:
            champs.kind === 'staff'
              ? 'DAVAR ACADÉMIE — vous êtes invité(e) à rejoindre l’équipe'
              : 'DAVAR ACADÉMIE — votre accès au campus',
          text:
            champs.kind === 'staff'
              ? `Bonjour,

Vous êtes invité(e) à rejoindre l'équipe de DAVAR ACADÉMIE.

Créez votre accès ici (lien valable ${jours} jours) :
${lien}

Si vous n'êtes pas concerné(e), ignorez simplement ce message.`
              : `Bonjour,

Le propriétaire de DAVAR ACADÉMIE vous offre un accès au campus.

Créez votre accès ici (lien valable ${jours} jours) :
${lien}

Si vous n'êtes pas concerné(e), ignorez simplement ce message.`,
        },
        db
      );
    } catch {
      /* le lien reste affiché au propriétaire : rien n'est perdu */
    }
  }

  return { ok: true, invitation, token };
}

/** Les invitations encore valables, les plus récentes d'abord. */
export async function listerInvitations(db: Db, maintenant = Date.now()): Promise<Invitation[]> {
  const lignes = await db.execute({
    sql: `SELECT id FROM invites WHERE used_at_ms IS NULL AND expires_at_ms > ? ORDER BY created_at_ms DESC LIMIT 100`,
    args: [maintenant],
  });
  const invitations: Invitation[] = [];
  for (const row of lignes.rows) {
    const invitation = await lire(db, texte(row.id));
    if (invitation) invitations.push(invitation);
  }
  return invitations;
}

export async function revoquerInvitation(db: Db, id: string): Promise<boolean> {
  const resultat = await db.execute({ sql: 'DELETE FROM invites WHERE id = ? AND used_at_ms IS NULL', args: [id] });
  return Number(resultat.rowsAffected ?? 0) > 0;
}

/** L'invitation portée par un lien, si le lien est encore bon. */
export async function invitationDuToken(db: Db, token: string, maintenant = Date.now()): Promise<Invitation | null> {
  if (typeof token !== 'string' || token.length < 20 || token.length > 200) return null;
  const lignes = await db.execute({
    sql: 'SELECT id FROM invites WHERE token_hash = ? AND used_at_ms IS NULL AND expires_at_ms > ?',
    args: [await hashToken(token), maintenant],
  });
  const id = texte(lignes.rows[0]?.id);
  if (!id) return null;
  return lire(db, id);
}

/** Le lien a servi : il ne sert plus. */
export async function marquerInvitationUtilisee(
  db: Db,
  id: string,
  userId: string,
  maintenant = Date.now()
): Promise<boolean> {
  const resultat = await db.execute({
    sql: 'UPDATE invites SET used_at_ms = ?, used_by = ? WHERE id = ? AND used_at_ms IS NULL',
    args: [maintenant, userId, id],
  });
  return Number(resultat.rowsAffected ?? 0) > 0;
}

export type EffetInvitation = { role: string | null; formations: string[]; roles?: string[] };

/**
 * Après confirmation de l'adresse : l'invitation produit son effet.
 * Un membre d'équipe devient membre d'équipe ; un accès gracieux ouvre la
 * formation offerte, comme un achat — sans vente, d'où la source `staff_grant`.
 */
export async function appliquerInvitations(db: Db, userId: string, maintenant = Date.now()): Promise<EffetInvitation> {
  const utilisateur = await db.execute({
    sql: 'SELECT email_normalized, role FROM users WHERE id = ?',
    args: [userId],
  });
  const email = texte(utilisateur.rows[0]?.email_normalized);
  const role = texte(utilisateur.rows[0]?.role);
  if (!email) return { role: null, formations: [] };

  const lignes = await db.execute({
    sql: `SELECT id, kind, roles, training_id FROM invites
          WHERE email_normalized = ? AND used_at_ms IS NOT NULL AND used_by = ?`,
    args: [email, userId],
  });

  let nouveauRole: string | null = null;
  const formations: string[] = [];
  const rolesAppliques = new Set<string>();
  for (const row of lignes.rows) {
    const kind = texte(row.kind);
    if (kind === 'staff' && role === 'student') {
      await db.execute({ sql: "UPDATE users SET role = 'staff' WHERE id = ? AND role = 'student'", args: [userId] });
      nouveauRole = 'staff';
    }
    // Les rôles choisis au moment de l'invitation ouvrent leur périmètre dès la
    // confirmation de l'adresse — la personne n'a pas à attendre le propriétaire.
    if (kind === 'staff') {
      const voulus = normaliserRoles(texte(row.roles));
      if (voulus.length) {
        await db.execute({ sql: 'UPDATE users SET staff_roles = ? WHERE id = ?', args: [rolesEnLigne(voulus), userId] });
        rolesAppliques.add(rolesEnLigne(voulus));
      }
    }
    if (kind === 'student_grace') {
      const formation = texte(row.training_id);
      if (formation) {
        const insertion = await db.execute({
          sql: `INSERT INTO enrollments(user_id, training_id, source, sale_id, acquired_at_ms)
                SELECT ?, ?, 'staff_grant', NULL, ?
                WHERE EXISTS (SELECT 1 FROM trainings WHERE id = ?)
                ON CONFLICT(user_id, training_id) DO NOTHING`,
          args: [userId, formation, maintenant, formation],
        });
        if (Number(insertion.rowsAffected ?? 0) > 0) formations.push(formation);
      }
    }
  }
  return {
    role: nouveauRole,
    formations,
    roles: rolesAppliques.size ? [...rolesAppliques].pop()!.split(',').filter(Boolean) : [],
  };
}
