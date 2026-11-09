/* ===== SYSTÈME E-MAIL PROFESSIONNEL — 4 adresses, 4 rôles (Cloudflare Email Routing) =====
   support@   : aide étudiants, technique, réclamations, remboursements, mot de passe (24-48 h, chaleureux)
   contact@   : partenariats, entreprises, presse, instructeurs, investisseurs (24-48 h, pro)
   infos@     : informations pédagogiques + canal hybride web push + e-mail (≤ 2/mois, désinscription obligatoire)
   direction@ : certificats, fins de formation, décisions, avertissements, légal (48-72 h, solennel, rare) */

function mailAddr(role) { return (S.settings.emails && S.settings.emails[role]) || (role + '@davarcampus.co'); }
const MAIL_ADDR_LINE = 'Yopougon, Abidjan — Côte d’Ivoire';
const MAIL_SITE = 'https://davarcampus.co';
const MAIL_SIGNS = {
  support: () => `\n\nCordialement,\nL’équipe Support Davar Académie\n\n${MAIL_ADDR_LINE}\n${mailAddr('support')}\n${MAIL_SITE}`,
  contact: () => `\n\nCordialement,\nL’équipe Commerciale Davar Académie\n\n${MAIL_ADDR_LINE}\n${mailAddr('contact')}\n${MAIL_SITE}`,
  infos: () => `\n\nCordialement,\nL’équipe Davar Académie\n\n${MAIL_ADDR_LINE}\n${mailAddr('infos')}\n${MAIL_SITE}`,
  direction: () => `\n\nCordialement,\nLa Direction Davar Académie\n\n${MAIL_ADDR_LINE}\n${mailAddr('direction')}\n${MAIL_SITE}`
};

/* Tableau de routage : chaque flux de la plateforme → adresse + ton + template */
const MAIL_FLOWS = {
  welcome:            { role: 'infos', dual: true,  subject: () => 'Bienvenue sur Davar Académie Campus', body: v => `Bonjour${v.name ? ' ' + v.name : ''},\n\nVotre compte est prêt : vos formations vous attendent, votre progression et vos certificats seront disponibles depuis votre campus personnel.\n\nBonne formation !` },
  pwd_reset:          { role: 'support',            subject: () => 'Réinitialisation de votre mot de passe — Davar Académie Campus', body: () => `Bonjour,\n\nVous avez demandé la réinitialisation de votre mot de passe. Utilisez le lien reçu sur votre espace de connexion. Si vous n’êtes pas à l’origine de cette demande, répondez à ce message : nous sécuriserons votre compte ensemble.` },
  purchase_ok:        { role: 'support',            subject: () => 'Votre achat est confirmé — Davar Académie Campus', body: v => `Bonjour,\n\nVotre paiement pour « ${v.title} » est confirmé. La formation est ajoutée à votre compte existant (accès 12 mois, certificat inclus). Votre facture est téléchargeable depuis l’écran de succès puis depuis votre compte.` },
  access_open:        { role: 'support',            subject: () => 'Votre accès est ouvert — Davar Académie Campus', body: v => `Bonjour,\n\nVotre accès à « ${v.title} » est actif. En cas de difficulté de lecture ou de connexion, répondez à ce message : nous sommes là.` },
  cert_ready:         { role: 'direction',          subject: v => `Votre certificat ${v.code} est prêt — Davar Académie`, body: v => `Madame, Monsieur,\n\nLa Direction a le plaisir de vous informer que votre certificat ${v.code} a été émis et vous a été transmis. Nous vous prions d’agréer nos félicitations pour l’achèvement de votre parcours.` },
  cert_request_ack:   { role: 'support',            subject: () => 'Votre demande de certificat — Davar Académie', body: () => `Bonjour,\n\nNous avons bien reçu votre demande de certificat. Elle est en cours de traitement ; le document officiel vous sera adressé par e-mail de la Direction dès émission.` },
  cert_request_staff: { role: 'direction',          subject: v => `Demande de certificat — ${v.name} (${v.code})`, body: v => `Une demande de certificat requiert votre validation : ${v.name} — formation ${v.code}.` },
  invite_staff:       { role: 'direction',          subject: v => `Invitation à rejoindre Davar Académie Campus (valable 7 jours) — rôles : ${v.roles}`, body: v => `Madame, Monsieur,\n\nLa Direction vous invite à rejoindre l’équipe Davar Académie Campus avec les rôles suivants : ${v.roles}. Votre invitation est valable 7 jours.` },
  gift_access:        { role: 'direction',          subject: () => 'Accès gratuit à Davar Académie Campus — configurez votre compte (lien valable 3 jours)', body: () => `Madame, Monsieur,\n\nVous bénéficiez d’un accès offert à Davar Académie Campus. Configurez votre compte dans les 3 jours à l’aide du lien ci-joint.` },
  suspend:            { role: 'direction',          subject: () => 'Votre compte Davar Académie Campus est suspendu', body: v => `${v.name ? 'Bonjour ' + v.name + ',\n\n' : ''}La Direction vous informe que votre compte est suspendu. Un e-mail détaillant les motifs vous est adressé ; le support reste joignable pour toute régularisation.` },
  reactivate:         { role: 'direction',          subject: () => 'Votre compte Davar Académie Campus est réactivé', body: () => `Madame, Monsieur,\n\nLa Direction vous informe que votre compte est réactivé avec l’ensemble de vos droits. Nous vous souhaitons une excellente reprise.` },
  ownership:          { role: 'direction',          subject: () => 'Confirmation requise : transfert de propriété de Davar Académie Campus', body: () => `Madame, Monsieur,\n\nUne procédure de transfert de propriété de la plateforme requiert votre confirmation expresse. Sans réponse sous 72 heures, la procédure sera réputée annulée.` },
  reward:             { role: 'infos',              subject: v => `${v.title} — Davar Académie`, body: v => `Bonjour,\n\nFélicitations : vous venez d’obtenir « ${v.title} ». Continuez sur votre lancée, la régularité fait les grands orateurs.` },
  new_course:         { role: 'infos', dual: true,  subject: v => `Nouvelle formation disponible : ${v.title}`, body: v => `Bonjour,\n\nUne nouvelle formation rejoint le campus : « ${v.title} ». Découvrez-la depuis votre catalogue.` },
  event:              { role: 'infos', dual: true,  subject: v => `Événement Davar Académie : ${v.title}`, body: v => `Bonjour,\n\nNous vous convions à « ${v.title} ». Les détails et le lien d’accès figurent sur votre campus.` },
  newsletter:         { role: 'infos',              subject: () => 'Le mensuel de l’éloquence — Davar Académie', body: () => `Bonjour,\n\nVoici le récapitulatif du mois : nouveautés, conseils d’art oratoire et ressources pédagogiques.` },
  survey:             { role: 'support',            subject: () => 'Votre avis compte — Davar Académie', body: () => `Bonjour,\n\nAidez-nous à améliorer votre campus : deux minutes suffisent pour nous dire ce qui vous aide et ce qui vous manque.` },
  partnership:        { role: 'contact',            subject: v => `Partenariat Davar Académie — ${v.name}`, body: v => `Bonjour,\n\nNous avons bien reçu votre proposition${v.name ? ' (' + v.name + ')' : ''}. Notre équipe commerciale revient vers vous sous 48 heures ouvrées.` }
};

/* Envoi routé : template + signature du rôle + désinscription (infos@) + double canal push */
function sendFlow(flow, to, vars) {
  const f = MAIL_FLOWS[flow];
  if (!f) return sendMailSim(to, 'Davar Académie');
  const v = vars || {};
  const from = mailAddr(f.role);
  const subject = f.subject(v);
  let body = f.body(v) + MAIL_SIGNS[f.role]();
  if (f.role === 'infos') body += `\n\n———\nVous recevez cet e-mail car vous êtes inscrit(e) sur Davar Académie Campus.\nVos données vous appartiennent : vous avez des droits dessus (y accéder, les faire corriger ou supprimer) — écrivez-nous à ${mailAddr('support')}.\nPour vous désinscrire : ${MAIL_SITE}/#/desinscription?e=${encodeURIComponent(to)}`;
  if (f.dual && S.settings.pushEnabled && v.userId && typeof notify === 'function') notify(v.userId, 'info', subject, 'Notification hybride : le détail vous est adressé par e-mail (' + from + ').');
  sendMailSim(to, subject, { from, body, flow });
  return { from, subject };
}
