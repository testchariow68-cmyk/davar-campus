import { redirect } from 'next/navigation';
import { ExportsAdmin } from '@/components/direction/ExportsAdmin';
import { sessionProprietaire } from '@/lib/server/direction-access';
import { derniersExports } from '@/lib/server/exports';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Exports et factures — Direction' };

/**
 * EXPORTS ET FACTURES — accessibles derrière le mot de passe du propriétaire.
 * Les données personnelles de ses étudiants ne sortent jamais d'elles-mêmes.
 */
export default async function ExportsPage() {
  const proprietaire = await sessionProprietaire();
  if (!proprietaire) redirect('/direction');
  const journal = await derniersExports(proprietaire.db, 30).catch(() => []);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 style={{ fontSize: 19 }}>Exports et factures</h1>
          <p>
            Vos données restent les vôtres : chaque sortie demande votre mot de passe et laisse une trace dans le
            journal. Les fichiers partent directement sur votre appareil, jamais sur un serveur intermédiaire.
          </p>
        </div>
      </div>
      <ExportsAdmin journalInitial={journal} />
    </>
  );
}
