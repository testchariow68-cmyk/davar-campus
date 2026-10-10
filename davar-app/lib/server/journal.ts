/**
 * LE JOURNAL DE L'ÉQUIPE — qui a fait quoi, et ce qui compte.
 *
 * Le prototype a un écran « Activités de l'équipe » avec deux règles :
 *   - chaque action est écrite avec son auteur, son sujet et sa date ;
 *   - les actions LOURDES sont marquées « importante », et le manager ne voit
 *     PAS celles du Super Administrateur.
 *
 * Ce fichier porte les deux : une table de lecture (`staff_events`), un
 * vocabulaire fermé d'actions — jamais une chaîne libre, sinon le journal
 * deviendrait illisible en trois semaines — et la règle de retrait.
 *
 * Rien n'est inventé : si une action n'est pas listée ici, elle n'est pas
 * journalisée. Et le journal ne remplace pas la preuve : les données restent
 * dans leurs tables, il raconte seulement qui les a touchées.
 */
import type { Db } from './auth-core.ts';
import { notifier } from './notifications.ts';

export type NiveauAction = 'importante' | 'routine';

export type DefinitionAction = {
  /** Le libellé exact affiché dans le journal. */
  libelle: string;
  /** Une action lourde : elle mérite l'attention du propriétaire et du manager. */
  importante: boolean;
};

export const ACTIONS = {
  'acces-accorde': { libelle: 'a ouvert un accès à une formation', importante: true },
  'acces-retire': { libelle: 'a retiré un accès à une formation', importante: true },
  'role-change': { libelle: 'a changé le rôle d’une personne', importante: true },
  'roles-equipe': { libelle: 'a changé les rôles d’un membre du staff', importante: true },
  'statut-compte': { libelle: 'a suspendu ou réactivé un compte', importante: true },
  'compte-test': { libelle: 'a touché aux comptes de test', importante: true },
  'invitation-creee': { libelle: 'a invité quelqu’un', importante: true },
  'invitation-revoquee': { libelle: 'a révoqué une invitation', importante: true },
  'purge-contenu': { libelle: 'a purgé du contenu', importante: true },
  'transfert-initie': { libelle: 'a initié un transfert de propriété', importante: true },
  'transfert-annule': { libelle: 'a annulé un transfert de propriété', importante: true },
  'cycle-de-vie': { libelle: 'a lancé une passe du cycle de vie', importante: true },
  'export-donnees': { libelle: 'a exporté des données', importante: true },
  'rappel-cycle': { libelle: 'a vérifié le cycle d’assiduité', importante: false },
  'distinction-manuelle': { libelle: 'a attribué une distinction à la main', importante: true },
  'recompenses-reglages': { libelle: 'a changé les réglages des récompenses', importante: true },
  'reponse-conversation': { libelle: 'a répondu à une question', importante: false },
  'validation-conversation': { libelle: 'a validé une réponse de l’assistant', importante: false },
  'resolution-conversation': { libelle: 'a clos une conversation', importante: false },
  'decision-devoir': { libelle: 'a statué sur un devoir', importante: false },
  'validation-certificat': { libelle: 'a statué sur un certificat', importante: true },
  'formation-creation': { libelle: 'a créé une formation', importante: false },
  'formation-modification': { libelle: 'a modifié une formation', importante: false },
  'formation-publication': { libelle: 'a publié ou retiré une formation', importante: true },
  'formation-suppression': { libelle: 'a supprimé une formation', importante: true },
  'contenu-structure': { libelle: 'a modifié les modules ou les leçons', importante: false },
  'ressource-depot': { libelle: 'a déposé une ressource', importante: false },
  'ressource-attribution': { libelle: 'a attribué une ressource', importante: false },
  'motivation-envoyee': { libelle: 'a envoyé la motivation du dimanche', importante: true },
  'assistant-reglages': { libelle: 'a changé la configuration de l’assistant', importante: true },
  'reglages-campus': { libelle: 'a changé les réglages du campus', importante: true },
} as const satisfies Record<string, DefinitionAction>;

export type ActionJournal = keyof typeof ACTIONS;

function texte(valeur: unknown, defaut = ''): string {
  return typeof valeur === 'string' && valeur.length > 0 ? valeur : defaut;
}

function entier(valeur: unknown): number {
  const nombre = typeof valeur === 'bigint' ? Number(valeur) : Number(valeur ?? 0);
  return Number.isFinite(nombre) ? Math.trunc(nombre) : 0;
}

/**
 * Écrire une ligne du journal. Une action inconnue est REFUSÉE : c'est ce qui
 * garantit que le journal reste lisible et que son vocabulaire ne dérive pas.
 *
 * Le détail est borné : un journal n'est pas une archive de données.
 */
export async function enregistrerEvenement(
  db: Db,
  evenement: { actorId: string | null; action: ActionJournal; detail?: string | null },
  maintenant = Date.now()
): Promise<boolean> {
  const definition = ACTIONS[evenement.action];
  if (!definition) return false;
  const detail = evenement.detail ? evenement.detail.slice(0, 300) : null;
  await db.execute({
    sql: `INSERT INTO staff_events(id, actor_id, action, detail, important, at_ms) VALUES (?,?,?,?,?,?)`,
    args: [
      `evt_${maintenant.toString(36)}${Math.random().toString(36).slice(2, 8)}`,
      evenement.actorId,
      evenement.action,
      detail,
      definition.importante ? 1 : 0,
      maintenant,
    ],
  });

  // Règle du prototype : « les actions importantes déclenchent une alerte pour
  // le Super Admin et le Manager ». L'alerte vit dans la cloche, qui est le
  // canal réellement branché ; l'envoi push viendra s'y ajouter, pas le remplacer.
  if (definition.importante) await alerterSurActionImportante(db, evenement, maintenant);
  return true;
}

/**
 * Prévenir le propriétaire et les managers d'une action lourde — jamais celui
 * qui vient de la faire. Une alerte qui revient à son auteur n'informe personne.
 */
async function alerterSurActionImportante(
  db: Db,
  evenement: { actorId: string | null; action: ActionJournal; detail?: string | null },
  maintenant: number
): Promise<void> {
  const destinataires = await db.execute({
    sql: `SELECT id FROM users
           WHERE status = 'active' AND id <> COALESCE(?, '')
             AND (role = 'admin' OR (role = 'staff' AND staff_roles LIKE '%manager%'))`,
    args: [evenement.actorId],
  });
  if (!destinataires.rows.length) return;
  const definition = ACTIONS[evenement.action];
  const acteur = evenement.actorId
    ? await db.execute({ sql: 'SELECT display_name FROM users WHERE id = ?', args: [evenement.actorId] })
    : null;
  const nom = typeof acteur?.rows[0]?.display_name === 'string' ? acteur.rows[0].display_name : 'L’équipe';
  for (const ligne of destinataires.rows) {
    await notifier(
      db,
      {
        userId: String(ligne.id),
        kind: 'equipe',
        titre: 'Action importante dans la Direction',
        corps: `${nom} ${definition.libelle}${evenement.detail ? ` — ${evenement.detail}` : ''}`,
        route: '/direction/activites',
      },
      maintenant
    );
  }
}

export type LigneJournal = {
  id: string;
  acteur: string;
  action: string;
  libelle: string;
  detail: string | null;
  niveau: NiveauAction;
  atMs: number;
};

/**
 * Lire le journal. `horsProprietaire` applique la règle du prototype : le
 * manager ne voit pas les actions du Super Administrateur.
 */
export async function lireJournal(
  db: Db,
  options: { limite?: number; horsProprietaire?: boolean } = {}
): Promise<LigneJournal[]> {
  const limite = Math.min(Math.max(options.limite ?? 120, 1), 500);
  const resultat = await db.execute({
    sql: `SELECT e.id, e.action, e.detail, e.important, e.at_ms,
                 u.display_name AS acteur, u.role AS role_acteur
            FROM staff_events e
            LEFT JOIN users u ON u.id = e.actor_id
           WHERE (? = 0 OR u.role IS NULL OR u.role <> 'admin')
           ORDER BY e.at_ms DESC LIMIT ?`,
    args: [options.horsProprietaire ? 1 : 0, limite],
  });
  return resultat.rows.map((ligne) => {
    const action = texte(ligne.action);
    const definition = (ACTIONS as Record<string, DefinitionAction>)[action];
    const important = entier(ligne.important) === 1;
    return {
      id: texte(ligne.id),
      acteur: texte(ligne.acteur, 'Système'),
      action,
      libelle: definition?.libelle ?? action,
      detail: texte(ligne.detail) || null,
      niveau: important ? 'importante' : 'routine',
      atMs: entier(ligne.at_ms),
    };
  });
}
