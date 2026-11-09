/**
 * TRANSFERT DE PROPRIÉTÉ DU CAMPUS.
 *
 * Le prototype l'annonce sans détour : « Le Super Administrateur est UNIQUE. Le
 * transfert exige votre mot de passe, puis une CONFIRMATION par e-mail du nouveau
 * propriétaire avant d'être effectif. Toutes les données, intégrations et
 * réglages sont transmis. »
 *
 * Et la sortie de secours existe : « ce n'était pas moi ». Celui qui reçoit un
 * lien qu'il n'a pas demandé peut le refuser, et le propriétaire est prévenu —
 * c'est précisément le cas où l'alerte compte le plus.
 */
import { hashToken, newToken, normalizeEmail, verifyPassword, type Db } from './auth-core.ts';
import { mailerConfigured, sendEmail } from './mailer.ts';

function texte(valeur: unknown, defaut = ''): string {
  return typeof valeur === 'string' ? valeur : defaut;
}

function entier(valeur: unknown): number | null {
  if (typeof valeur === 'number' && Number.isFinite(valeur)) return Math.trunc(valeur);
  if (typeof valeur === 'bigint') return Number(valeur);
  return null;
}

/** Le prototype laissait 7 jours au nouveau propriétaire pour confirmer. */
export const DUREE_TRANSFERT_JOURS = 7;

export type Transfert = {
  id: string;
  de: string;
  versEmail: string;
  versNom: string | null;
  createdAtMs: number;
  expiresAtMs: number;
};

export type ResultatTransfert = { ok: true; transfert: Transfert; token: string } | { ok: false; erreur: string };

async function lireTransfert(db: Db, id: string): Promise<Transfert | null> {
  const lignes = await db.execute({
    sql: `SELECT t.id, t.from_user, t.to_email, t.created_at_ms, t.expires_at_ms, u.email_normalized AS de_email, v.display_name AS vers_nom
          FROM ownership_transfers t
          JOIN users u ON u.id = t.from_user
          LEFT JOIN users v ON v.email_normalized = t.to_email
          WHERE t.id = ?`,
    args: [id],
  });
  const row = lignes.rows[0];
  if (!row) return null;
  return {
    id: texte(row.id),
    de: texte(row.de_email),
    versEmail: texte(row.to_email),
    versNom: texte(row.vers_nom) || null,
    createdAtMs: entier(row.created_at_ms) ?? 0,
    expiresAtMs: entier(row.expires_at_ms) ?? 0,
  };
}

/** Ce qu'une page publique peut dire d'un transfert : rien de plus que nécessaire. */
export type TransfertConsomme = { de: string; versEmail: string; expiresAtMs: number };

export async function lireTransfertParToken(
  db: Db,
  token: string,
  maintenant = Date.now()
): Promise<TransfertConsomme | null> {
  if (typeof token !== 'string' || token.length < 20 || token.length > 200) return null;
  const lignes = await db.execute({
    sql: `SELECT t.from_user, t.to_email, t.expires_at_ms, u.email_normalized AS de_email
          FROM ownership_transfers t JOIN users u ON u.id = t.from_user
          WHERE t.token_hash = ? AND t.confirmed_at_ms IS NULL AND t.cancelled_at_ms IS NULL AND t.expires_at_ms > ?`,
    args: [await hashToken(token), maintenant],
  });
  const row = lignes.rows[0];
  if (!row) return null;
  return {
    de: texte(row.de_email),
    versEmail: texte(row.to_email),
    expiresAtMs: entier(row.expires_at_ms) ?? 0,
  };
}

/** Le transfert en attente, s'il y en a un. Un seul à la fois : c'est la règle. */
export async function transfertEnAttente(db: Db, maintenant = Date.now()): Promise<Transfert | null> {
  const lignes = await db.execute({
    sql: `SELECT id FROM ownership_transfers
          WHERE confirmed_at_ms IS NULL AND cancelled_at_ms IS NULL AND expires_at_ms > ?
          ORDER BY created_at_ms DESC LIMIT 1`,
    args: [maintenant],
  });
  const id = texte(lignes.rows[0]?.id);
  return id ? lireTransfert(db, id) : null;
}

/**
 * Initier le transfert : mot de passe vérifié à l'instant, cible réelle,
 * et surtout — jamais soi-même : « Vous êtes déjà propriétaire du campus. »
 */
export async function initierTransfert(
  db: Db,
  champs: { acteurId: string; acteurEmail: string; emailCible: string; motDePasse: string; baseUrl?: string | null },
  maintenant = Date.now()
): Promise<ResultatTransfert> {
  const cible = normalizeEmail(champs.emailCible);
  if (!cible.includes('@')) return { ok: false, erreur: 'adresse_invalide' };
  if (cible === normalizeEmail(champs.acteurEmail)) return { ok: false, erreur: 'deja_proprietaire' };

  const empreinte = await db.execute({ sql: 'SELECT password_hash FROM users WHERE id = ?', args: [champs.acteurId] });
  const stockee = texte(empreinte.rows[0]?.password_hash);
  if (!stockee) return { ok: false, erreur: 'compte_inconnu' };
  const verdict = await verifyPassword(champs.motDePasse, stockee).catch(() => ({ ok: false }));
  if (!verdict.ok) return { ok: false, erreur: 'mot_de_passe_incorrect' };

  const destine = await db.execute({
    sql: "SELECT id, role, status FROM users WHERE email_normalized = ?",
    args: [cible],
  });
  const destinataireId = texte(destine.rows[0]?.id);
  if (!destinataireId) return { ok: false, erreur: 'compte_inconnu' };
  if (texte(destine.rows[0]?.status) !== 'active') return { ok: false, erreur: 'compte_inactif' };

  // Un seul transfert en attente : le précédent est annulé, sans trace effacée.
  await db.execute({
    sql: `UPDATE ownership_transfers SET cancelled_at_ms = ?, cancelled_reason = 'remplacé par un nouveau transfert'
          WHERE confirmed_at_ms IS NULL AND cancelled_at_ms IS NULL`,
    args: [maintenant],
  });

  const id = `tr_${maintenant.toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const token = newToken(32);
  await db.execute({
    sql: `INSERT INTO ownership_transfers(id, from_user, to_email, to_user, token_hash, created_at_ms, expires_at_ms)
          VALUES (?,?,?,?,?,?,?)`,
    args: [id, champs.acteurId, cible, destinataireId, await hashToken(token), maintenant, maintenant + DUREE_TRANSFERT_JOURS * 86_400_000],
  });

  const transfert = await lireTransfert(db, id);
  if (!transfert) return { ok: false, erreur: 'unavailable' };

  if (mailerConfigured() && champs.baseUrl) {
    const lien = `${champs.baseUrl.replace(/\/$/, '')}/transfert?token=${encodeURIComponent(token)}`;
    try {
      await sendEmail(
        {
          to: cible,
          subject: 'DAVAR ACADÉMIE — transfert de propriété du campus',
          text: `Bonjour,

Le propriétaire actuel de DAVAR ACADÉMIE vous propose de devenir propriétaire du campus.
Toutes les données, intégrations et réglages seront transmis.

Pour confirmer (lien valable ${DUREE_TRANSFERT_JOURS} jours) :
${lien}

Si vous n'êtes pas à l'origine de cette demande, ouvrez ce même lien et choisissez
« Ce n'était pas moi » : le transfert sera annulé et le propriétaire prévenu.`,
        },
        db
      );
    } catch {
      /* le lien reste affiché au propriétaire */
    }
  }

  return { ok: true, transfert, token };
}

export async function annulerTransfert(db: Db, id: string, raison = 'annulé par le propriétaire'): Promise<boolean> {
  const resultat = await db.execute({
    sql: `UPDATE ownership_transfers SET cancelled_at_ms = ?, cancelled_reason = ?
          WHERE id = ? AND confirmed_at_ms IS NULL AND cancelled_at_ms IS NULL`,
    args: [Date.now(), raison, id],
  });
  return Number(resultat.rowsAffected ?? 0) > 0;
}

/**
 * Confirmation : le nouveau propriétaire devient l'unique Super Admin,
 * l'ancien reste membre de l'équipe (rôle « staff »), comme promis dans le
 * message du prototype.
 */
export async function confirmerTransfert(
  db: Db,
  token: string,
  maintenant = Date.now()
): Promise<{ ok: true; nouveauProprietaire: string; ancienProprietaire: string } | { ok: false; erreur: string }> {
  if (typeof token !== 'string' || token.length < 20 || token.length > 200) return { ok: false, erreur: 'lien_invalide' };
  const lignes = await db.execute({
    sql: `SELECT id, from_user, to_email, to_user FROM ownership_transfers
          WHERE token_hash = ? AND confirmed_at_ms IS NULL AND cancelled_at_ms IS NULL AND expires_at_ms > ?`,
    args: [await hashToken(token), maintenant],
  });
  const row = lignes.rows[0];
  if (!row) return { ok: false, erreur: 'lien_invalide' };

  const id = texte(row.id);
  const ancien = texte(row.from_user);
  const nouvelId = texte(row.to_user);
  const emailCible = texte(row.to_email);

  const cible = await db.execute({ sql: "SELECT id FROM users WHERE email_normalized = ? AND status = 'active'", args: [emailCible] });
  const destinataire = nouvelId || texte(cible.rows[0]?.id);
  if (!destinataire) return { ok: false, erreur: 'compte_inconnu' };

  await db.execute({ sql: "UPDATE users SET role = 'admin' WHERE id = ?", args: [destinataire] });
  await db.execute({ sql: "UPDATE users SET role = 'staff' WHERE id = ? AND role = 'admin'", args: [ancien] });
  await db.execute({
    sql: 'UPDATE ownership_transfers SET confirmed_at_ms = ?, to_user = ? WHERE id = ?',
    args: [maintenant, destinataire, id],
  });
  // Tout autre transfert en attente tombe : il n'y a qu'un propriétaire.
  await db.execute({
    sql: `UPDATE ownership_transfers SET cancelled_at_ms = ?, cancelled_reason = 'un autre transfert a été confirmé'
          WHERE id <> ? AND confirmed_at_ms IS NULL AND cancelled_at_ms IS NULL`,
    args: [maintenant, id],
  });

  return { ok: true, nouveauProprietaire: emailCible, ancienProprietaire: ancien };
}

/**
 * « CE N'ÉTAIT PAS MOI » — la sortie de secours.
 *
 * Le transfert est annulé, et l'ancien propriétaire reçoit une alerte : si
 * quelqu'un a initié un transfert sans son accord, il doit le savoir tout de suite.
 */
export async function refuserTransfert(
  db: Db,
  token: string,
  maintenant = Date.now()
): Promise<{ ok: true; proprietairePrevenu: boolean } | { ok: false; erreur: string }> {
  if (typeof token !== 'string' || token.length < 20 || token.length > 200) return { ok: false, erreur: 'lien_invalide' };
  const lignes = await db.execute({
    sql: `SELECT id, from_user FROM ownership_transfers
          WHERE token_hash = ? AND confirmed_at_ms IS NULL AND cancelled_at_ms IS NULL`,
    args: [await hashToken(token)],
  });
  const row = lignes.rows[0];
  if (!row) return { ok: false, erreur: 'lien_invalide' };

  await db.execute({
    sql: 'UPDATE ownership_transfers SET cancelled_at_ms = ?, cancelled_reason = ? WHERE id = ?',
    args: [maintenant, 'ce n’était pas moi', texte(row.id)],
  });

  const proprietaire = texte(row.from_user);
  let prevenu = false;
  if (proprietaire) {
    try {
      await db.execute({
        sql: `INSERT INTO notifications(id, user_id, kind, title, body, route, created_at_ms, expires_at_ms)
              VALUES (?,?,'security','Un transfert de propriété a été refusé',
                      'Quelqu’un a reçu un lien de transfert du campus et a répondu « ce n’était pas moi ». Vérifiez votre équipe et changez votre mot de passe si vous n’êtes pas à l’origine de la demande.',
                      '/direction/equipe',?,?)`,
        args: [
          `ntf_${maintenant.toString(36)}${Math.random().toString(36).slice(2, 8)}`,
          proprietaire,
          maintenant,
          maintenant + 180 * 86_400_000,
        ],
      });
      prevenu = true;
    } catch {
      prevenu = false;
    }
  }
  return { ok: true, proprietairePrevenu: prevenu };
}
