import { redirect } from 'next/navigation';
import { ParametresEcran } from '@/components/campus/ParametresEcran';
import { currentSession } from '@/lib/server/auth';
import { lireProfil } from '@/lib/server/profil';
import { lireReglages } from '@/lib/server/settings';
import { etatEmpreinte } from '@/lib/server/passkeys';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Paramètres — Davar Académie Campus' };

/** PARAMÈTRES — `vSettings()` du prototype. */
export default async function ParametresPage() {
  const session = await currentSession();
  if (!session) redirect('/connexion');
  const [profil, reglages, empreinte] = await Promise.all([
    lireProfil(session.db, session.user.id),
    lireReglages(session.db),
    etatEmpreinte(session.db, session.reel.id),
  ]);
  if (!profil) redirect('/connexion');

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Paramètres</h1>
        </div>
      </div>

      <ParametresEcran
        contacts={{
          whatsapp: reglages['support.whatsapp'],
          telephone: reglages['support.phone'],
          courriel: reglages['support.email'],
        }}
        echelleInitiale={profil.preferences.echelle}
        notificationsInitiales={profil.preferences.notifications}
        telephoneInitial={profil.telephone}
        paysInitial={profil.pays}
        empreinteActive={empreinte.active}
        utilisateurId={session.reel.id}
      />
    </>
  );
}
