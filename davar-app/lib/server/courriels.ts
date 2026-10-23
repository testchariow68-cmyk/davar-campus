/**
 * LES NEUF SCÉNARIOS D'E-MAIL — les mots du prototype, pas les nôtres.
 *
 * Le prototype adresse chaque événement à l'une des quatre adresses de
 * l'académie, avec le ton du rôle : le support rassure, la Direction
 * solennise, « infos » informe et porte la désinscription. Les textes
 * ci-dessous sont repris tels quels de `reference/prototype-campus/js/emails.js`
 * (MAIL_FLOWS + MAIL_SIGNS) : pas un mot n'a été réécrit.
 *
 * Les dix modèles de l'écran « E-mails » restent ce qu'ils sont : ce sont des
 * modèles d'essai. Ici, ce sont les neuf scénarios que la plateforme envoie
 * vraiment — le dixième, la motivation, part en notification et n'a jamais
 * été un e-mail dans le prototype.
 */
import type { Db } from './auth-core';
import { notifier } from './notifications.ts';
import { sendEmail, type OutgoingEmail } from './mailer.ts';

/** support@ aide, contact@ entreprises, infos@ pédagogie, direction@ décisions. */
export type RoleCourriel = 'support' | 'contact' | 'infos' | 'direction';

const DOMAINE = 'davarcampus.co';
const LIGNE_ADRESSE = 'Yopougon, Abidjan — Côte d’Ivoire';
const SITE = 'https://davarcampus.co';

export function adresseDuRole(role: RoleCourriel): string {
  return `${role}@${DOMAINE}`;
}

const SIGNATURES: Record<RoleCourriel, string> = {
  support: `\n\nCordialement,\nL’équipe Support Davar Académie\n\n${LIGNE_ADRESSE}\n${adresseDuRole('support')}\n${SITE}`,
  contact: `\n\nCordialement,\nL’équipe Commerciale Davar Académie\n\n${LIGNE_ADRESSE}\n${adresseDuRole('contact')}\n${SITE}`,
  infos: `\n\nCordialement,\nL’équipe Davar Académie\n\n${LIGNE_ADRESSE}\n${adresseDuRole('infos')}\n${SITE}`,
  direction: `\n\nCordialement,\nLa Direction Davar Académie\n\n${LIGNE_ADRESSE}\n${adresseDuRole('direction')}\n${SITE}`,
};

/** Le canal « infos » est le seul qui porte la désinscription, comme le prototype. */
function piedInfos(destinataire: string): string {
  return (
    `\n\n———\nVous recevez cet e-mail car vous êtes inscrit(e) sur Davar Académie Campus.` +
    `\nVos données vous appartiennent : vous avez des droits dessus (y accéder, les faire corriger ou supprimer)` +
    ` — écrivez-nous à ${adresseDuRole('support')}.` +
    `\nPour vous désinscrire : ${SITE}/#/desinscription?e=${encodeURIComponent(destinataire)}`
  );
}

export type ScenarioCourriel =
  | 'bienvenue'
  | 'invitation-staff'
  | 'grace-etudiant'
  | 'reset-mdp'
  | 'suspension'
  | 'reactivation'
  | 'certificat-pret'
  | 'demande-certificat'
  | 'paiement-confirme';

export type VariablesCourriel = {
  nom?: string;
  titre?: string;
  code?: string;
  roles?: string;
  userId?: string;
};

type Scenario = {
  role: RoleCourriel;
  /** Le prototype double certains envois : la cloche sonne en même temps. */
  dual?: boolean;
  objet: (v: VariablesCourriel) => string;
  corps: (v: VariablesCourriel) => string;
};

export const SCENARIOS: Record<ScenarioCourriel, Scenario> = {
  bienvenue: {
    role: 'infos',
    dual: true,
    objet: () => 'Bienvenue sur Davar Académie Campus',
    corps: (v) =>
      `Bonjour${v.nom ? ' ' + v.nom : ''},\n\nVotre compte est prêt : vos formations vous attendent, votre progression et vos certificats seront disponibles depuis votre campus personnel.\n\nBonne formation !`,
  },
  'invitation-staff': {
    role: 'direction',
    objet: (v) => `Invitation à rejoindre Davar Académie Campus (valable 7 jours) — rôles : ${v.roles}`,
    corps: (v) =>
      `Madame, Monsieur,\n\nLa Direction vous invite à rejoindre l’équipe Davar Académie Campus avec les rôles suivants : ${v.roles}.\n\nVotre invitation est valable 7 jours.`,
  },
  'grace-etudiant': {
    role: 'direction',
    objet: () => 'Accès gratuit à Davar Académie Campus — configurez votre compte (lien valable 3 jours)',
    corps: () =>
      `Madame, Monsieur,\n\nVous bénéficiez d’un accès offert à Davar Académie Campus. Configurez votre compte dans les 3 jours à l’aide du lien ci-joint.`,
  },
  'reset-mdp': {
    role: 'support',
    objet: () => 'Réinitialisation de votre mot de passe — Davar Académie Campus',
    corps: () =>
      `Bonjour,\n\nVous avez demandé la réinitialisation de votre mot de passe. Utilisez le lien reçu sur votre espace de connexion. Si vous n’êtes pas à l’origine de cette demande, répondez à ce message : nous sécuriserons votre compte ensemble.`,
  },
  suspension: {
    role: 'direction',
    objet: () => 'Votre compte Davar Académie Campus est suspendu',
    corps: (v) =>
      `${v.nom ? 'Bonjour ' + v.nom + ',\n\n' : ''}La Direction vous informe que votre compte est suspendu. Un e-mail détaillant les motifs vous est adressé ; le support reste joignable pour toute régularisation.`,
  },
  reactivation: {
    role: 'direction',
    objet: () => 'Votre compte Davar Académie Campus est réactivé',
    corps: () =>
      `Madame, Monsieur,\n\nLa Direction vous informe que votre compte est réactivé avec l’ensemble de vos droits. Nous vous souhaitons une excellente reprise.`,
  },
  'certificat-pret': {
    role: 'direction',
    objet: (v) => `Votre certificat ${v.code} est prêt — Davar Académie`,
    corps: (v) =>
      `Madame, Monsieur,\n\nLa Direction a le plaisir de vous informer que votre certificat ${v.code} a été émis et vous a été transmis. Nous vous prions d’agréer nos félicitations pour l’achèvement de votre parcours.`,
  },
  'demande-certificat': {
    role: 'support',
    objet: () => 'Votre demande de certificat — Davar Académie',
    corps: () =>
      `Bonjour,\n\nNous avons bien reçu votre demande de certificat. Elle est en cours de traitement ; le document officiel vous sera adressé par e-mail de la Direction dès émission.`,
  },
  'paiement-confirme': {
    role: 'support',
    objet: () => 'Votre achat est confirmé — Davar Académie Campus',
    corps: (v) =>
      `Bonjour,\n\nVotre paiement pour « ${v.titre} » est confirmé. La formation est ajoutée à votre compte existant (accès 12 mois, certificat inclus). Votre facture est téléchargeable depuis l’écran de succès puis depuis votre compte.`,
  },
};

/** Composer l'e-mail d'un scénario : objet, corps signé, adresse du rôle. */
export function composerCourriel(
  scenario: ScenarioCourriel,
  destinataire: string,
  variables: VariablesCourriel = {}
): OutgoingEmail {
  const modele = SCENARIOS[scenario];
  let corps = modele.corps(variables) + SIGNATURES[modele.role];
  if (modele.role === 'infos') corps += piedInfos(destinataire);
  return { to: destinataire, subject: modele.objet(variables), text: corps };
}

/**
 * Envoie le scénario. Un e-mail qui n'arrive pas ne doit jamais casser ce que
 * la personne était en train de faire : l'échec est avalé, et seul le compte
 * rendu le dira. `false` = non envoyé.
 */
export async function envoyerScenario(
  db: Db,
  scenario: ScenarioCourriel,
  destinataire: string,
  variables: VariablesCourriel = {}
): Promise<boolean> {
  const modele = SCENARIOS[scenario];
  const message = composerCourriel(scenario, destinataire, variables);
  const de = adresseDuRole(modele.role);
  try {
    await sendEmail(message, db);
  } catch {
    return false;
  }
  // Le canal hybride du prototype : la cloche prévient que le détail part par
  // e-mail. Rien de plus qu'un mot dans la cloche ; l'e-mail porte le reste.
  if (modele.dual && variables.userId) {
    try {
      await notifier(
        db,
        {
          userId: variables.userId,
          kind: 'info',
          titre: message.subject,
          corps: `Notification hybride : le détail vous est adressé par e-mail (${de}).`,
        },
        Date.now()
      );
    } catch {
      /* la cloche n'est pas le motif de l'envoi */
    }
  }
  return true;
}
