import { redirect } from 'next/navigation';
import { IntegrationsAdmin } from '@/components/direction/IntegrationsAdmin';
import { sessionProprietaire } from '@/lib/server/direction-access';
import { urlSheetsEnregistree } from '@/lib/server/sheets';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Intégrations — Direction' };

/** INTÉGRATIONS — clés d'accès et raccordement Google Sheets. */
export default async function IntegrationsPage() {
  const proprietaire = await sessionProprietaire();
  if (!proprietaire) redirect('/direction');
  const urlSheets = await urlSheetsEnregistree(proprietaire.db).catch(() => '');

  return (
    <>
      <div className="page-head">
        <div>
          <h1 style={{ fontSize: 19 }}>Intégrations</h1>
          <p>
            De quoi brancher vos tableaux et vos outils, sans ouvrir la plateforme : une clé d’accès révocable en un
            geste, et votre script Google pour les tableaux.
          </p>
        </div>
      </div>
      <IntegrationsAdmin urlSheetsInitiale={urlSheets} />
    </>
  );
}
