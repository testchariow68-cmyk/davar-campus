/**
 * LES MODÈLES D'E-MAIL DE LA PLATEFORME — ceux du prototype, un par un.
 *
 * Ils servent à deux choses, et à rien d'autre :
 *   - être envoyés pour de vrai quand la plateforme a quelque chose à dire ;
 *   - pouvoir être essayés un par un depuis l'écran « E-mails », pour que le
 *     propriétaire voie exactement ce que reçoit un étudiant.
 *
 * Les textes sont ceux du prototype (`js/emails.js`). Aucun modèle
 * supplémentaire n'est ajouté : ce qui n'est pas là n'existe pas.
 */
export type ModeleCourriel = { id: string; objet: string; description: string; corps: (nom: string) => string };

const signature = (role: string) =>
  role === 'direction'
    ? '\n\nLa Direction\nDavar Académie — Abidjan, Côte d’Ivoire'
    : '\n\nL’équipe Davar Académie\nsupport@davarcampus.co';

export const MODELES_COURRIEL: ModeleCourriel[] = [
  {
    id: 'bienvenue',
    objet: 'Bienvenue à Davar Académie 🎓',
    description: 'Votre compte est prêt : découvrez votre campus et votre première formation.',
    corps: (nom) =>
      `Bonjour ${nom},\n\nVotre compte est prêt : vos formations vous attendent, votre progression et vos certificats seront disponibles depuis votre campus personnel.\n\nBonne formation !${signature('infos')}`,
  },
  {
    id: 'invitation-staff',
    objet: 'Invitation à rejoindre l’équipe (valable 7 jours)',
    description: 'Un lien de configuration unique, valable 7 jours.',
    corps: (nom) =>
      `Madame, Monsieur,\n\nLa Direction vous invite à rejoindre l’équipe Davar Académie Campus. Votre invitation est valable 7 jours.${signature('direction')}`,
  },
  {
    id: 'grace-etudiant',
    objet: 'Accès gracieux offert (lien valable 3 jours)',
    description: 'Un étudiant bénéficie d’un accès gratuit offert par l’académie.',
    corps: (nom) =>
      `Madame, Monsieur,\n\nVous bénéficiez d’un accès offert à Davar Académie Campus. Configurez votre compte dans les 3 jours à l’aide du lien ci-joint.${signature('direction')}`,
  },
  {
    id: 'reset-mdp',
    objet: 'Réinitialisation de votre mot de passe',
    description: 'Lien à usage unique, valable 30 minutes.',
    corps: (nom) =>
      `Bonjour ${nom},\n\nVous avez demandé la réinitialisation de votre mot de passe. Utilisez le lien reçu sur votre espace de connexion. Si vous n’êtes pas à l’origine de cette demande, répondez à ce message : nous sécuriserons votre compte ensemble.${signature('support')}`,
  },
  {
    id: 'suspension',
    objet: 'Votre compte est suspendu',
    description: 'Notification de suspension avec contact du support.',
    corps: (nom) =>
      `Bonjour ${nom},\n\nLa Direction vous informe que votre compte est suspendu. Un e-mail détaillant les motifs vous est adressé ; le support reste joignable pour toute régularisation.${signature('direction')}`,
  },
  {
    id: 'reactivation',
    objet: 'Votre compte est réactivé ✓',
    description: 'L’accès au campus est de nouveau actif.',
    corps: (nom) =>
      `Bonjour ${nom},\n\nLa Direction vous informe que votre compte est réactivé avec l’ensemble de vos droits. Nous vous souhaitons une excellente reprise.${signature('direction')}`,
  },
  {
    id: 'certificat-pret',
    objet: 'Votre certificat est prêt 🏅',
    description: 'Émis après validation humaine, avec lien de vérification.',
    corps: (nom) =>
      `Madame, Monsieur,\n\nLa Direction a le plaisir de vous informer que votre certificat a été émis et vous a été transmis. Nous vous prions d’agréer nos félicitations pour l’achèvement de votre parcours.${signature('direction')}`,
  },
  {
    id: 'demande-certificat',
    objet: 'Votre demande de certificat est reçue',
    description: 'Accusé de réception avant vérification manuelle.',
    corps: (nom) =>
      `Bonjour ${nom},\n\nNous avons bien reçu votre demande de certificat. Elle est en cours de traitement ; le document officiel vous sera adressé par e-mail de la Direction dès émission.${signature('support')}`,
  },
  {
    id: 'paiement-confirme',
    objet: 'Paiement confirmé : formation activée',
    description: 'La formation est débloquée sur le compte existant.',
    corps: (nom) =>
      `Bonjour ${nom},\n\nVotre paiement est confirmé. La formation est ajoutée à votre compte existant (accès 12 mois, certificat inclus).${signature('support')}`,
  },
  {
    id: 'motivation',
    objet: 'Votre dose de motivation du dimanche ✨',
    description: 'Message de motivation hebdomadaire (push + e-mail).',
    corps: (nom) =>
      `Bonjour ${nom},\n\nUn orateur ne naît pas, il se construit — module après module. Bonne semaine d’entraînement.${signature('infos')}`,
  },
];

const INDEX = new Map(MODELES_COURRIEL.map((modele) => [modele.id, modele]));

/** Un modèle par son identifiant ; null si l'identifiant n'existe pas. */
export function modeleParId(id: string): ModeleCourriel | null {
  return INDEX.get(id) ?? null;
}
