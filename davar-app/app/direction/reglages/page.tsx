import { redirect } from 'next/navigation';
import { ReglagesAdmin } from '@/components/direction/ReglagesAdmin';
import { sessionProprietaire } from '@/lib/server/direction-access';
import { lireReglages } from '@/lib/server/settings';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Réglages — Direction' };

/** RÉGLAGES — les contacts, les réseaux et le bandeau d'annonce du campus. */
export default async function ReglagesPage() {
  const proprietaire = await sessionProprietaire();
  if (!proprietaire) redirect('/direction');
  const reglages = await lireReglages(proprietaire.db);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 style={{ fontSize: 19 }}>Réglages du campus</h1>
          <p>
            Les valeurs par défaut viennent de votre prototype. Modifiez-les ici : tout s’applique immédiatement côté
            étudiant, sans redéploiement.
          </p>
        </div>
      </div>
      <ReglagesAdmin initiaux={reglages} />
    </>
  );
}
