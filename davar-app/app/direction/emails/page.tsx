import { redirect } from 'next/navigation';
import { EmailsAdmin, type LigneEnvoi } from '@/components/direction/EmailsAdmin';
import { AutorisationGmail } from '@/components/direction/AutorisationGmail';
import { Icon } from '@/components/campus/Icon';
import { sessionProprietaire } from '@/lib/server/direction-access';
import { emailBudget } from '@/lib/server/mailer';
import { lireJournal } from '@/lib/server/journal';
import { MODELES_COURRIEL } from '@/lib/server/modeles-courriel';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'E-mails — Direction' };

/** E-MAILS — l'état du service, chaque modèle essayable, et ce qui est déjà parti. */
export default async function EmailsPage() {
  const proprietaire = await sessionProprietaire();
  if (!proprietaire) redirect('/direction');
  const budget = emailBudget();
  const journal = await lireJournal(proprietaire.db, { limite: 200 });

  // Seuls les envois nous intéressent ici. Le journal ne porte ni le nom ni
  // l'adresse du destinataire : on y lit qui a envoyé quoi, jamais à qui.
  const envois: LigneEnvoi[] = journal
    .filter((ligne) => ligne.action === 'courriel-modele' || ligne.action === 'courriel-libre')
    .slice(0, 12)
    .map((ligne) => ({
      id: ligne.id,
      type: ligne.action === 'courriel-modele' ? 'essai' : 'production',
      libelle:
        ligne.action === 'courriel-modele'
          ? MODELES_COURRIEL.find((modele) => modele.id === ligne.detail)?.objet ?? 'Modèle d’e-mail'
          : 'E-mail libre',
      atMs: ligne.atMs,
    }));

  return (
    <>
      <div className="page-head">
        <div>
          <h1 style={{ fontSize: 19 }}>E-mails</h1>
          <p>
            Tous les e-mails envoyés par la plateforme : bienvenue, invitations, révocations, certificats… Testez
            chaque modèle avant la mise en production.
          </p>
        </div>
        <span className={`badge ${budget.configured ? 'b-green' : 'b-gold'}`}>
          {budget.configured ? (
            <>
              <Icon nom="checkCircle" taille={12} /> Envoi réel configuré (Apps Script)
            </>
          ) : (
            <>
              <Icon nom="clock" taille={12} /> Mode simulation — renseignez l’URL dans Configuration
            </>
          )}
        </span>
      </div>

      {!budget.configured && (
        <div className="banner info mb16" style={{ textAlign: 'left' }}>
          <Icon nom="mail" taille={14} />
          <span className="small">
            <b>Pourquoi les e-mails de test n’arrivent pas encore :</b> tant que l’URL de votre Apps Script n’est pas
            renseignée, la plateforme <b>journalise</b> les e-mails sans les expédier. Collez l’URL de votre Web App
            Apps Script et chaque test partira réellement depuis vos adresses @davarcampus.co.
          </span>
        </div>
      )}

      <AutorisationGmail actif={budget.kind === 'gmail'} />

      <EmailsAdmin
        modeles={MODELES_COURRIEL.map((modele) => ({
          id: modele.id,
          objet: modele.objet,
          description: modele.description,
        }))}
        envois={envois}
        emailProprietaire={proprietaire.reel.email}
      />
    </>
  );
}
