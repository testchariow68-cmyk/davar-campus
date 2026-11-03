import { redirect } from 'next/navigation';
import { ExportsAdmin } from '@/components/direction/ExportsAdmin';
import { sessionProprietaire } from '@/lib/server/direction-access';
import { derniersExports } from '@/lib/server/exports';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Exports — Direction' };

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
          <h1 style={{ fontSize: 19 }}>Exports</h1>
          <p>Exportez vos données au format CSV (compatible Excel / Google Sheets). Chaque export est <b>protégé par votre mot de passe Super Admin</b> et journalisé.</p>
        </div>
      </div>
      <ExportsAdmin journalInitial={journal} />
    </>
  );
}
