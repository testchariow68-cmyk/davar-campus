import { redirect } from 'next/navigation';
import { EmailsAdmin } from '@/components/direction/EmailsAdmin';
import { sessionProprietaire } from '@/lib/server/direction-access';
import { emailBudget } from '@/lib/server/mailer';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'E-mails — Direction' };

/** E-MAILS — l'état réel du service d'envoi, et un essai pour en avoir le cœur net. */
export default async function EmailsPage() {
  const proprietaire = await sessionProprietaire();
  if (!proprietaire) redirect('/direction');
  const budget = emailBudget();

  return (
    <>
      <div className="page-head">
        <div>
          <h1 style={{ fontSize: 19 }}>E-mails</h1>
          <p>
            Ce qui part, quand, et par quel service. Aucune dépense n’est engagée : le plafond quotidien protège votre
            quota, et un envoi au-delà attend simplement le lendemain.
          </p>
        </div>
      </div>
      <EmailsAdmin
        kind={budget.kind}
        configure={budget.configured}
        plafond={budget.dailyLimit}
        emailProprietaire={proprietaire.reel.email}
      />
    </>
  );
}
