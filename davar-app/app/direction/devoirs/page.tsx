import { redirect } from 'next/navigation';
import { DecisionsListe } from '@/components/direction/DecisionsListe';
import { sessionProprietaire } from '@/lib/server/direction-access';
import { devoirsEnAttente } from '@/lib/server/pedagogie';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Devoirs — Direction' };

function quand(atMs: number): string {
  return new Date(atMs).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** DEVOIRS — les évaluations ouvertes rendues par les étudiants, à corriger à la main. */
export default async function DevoirsPage() {
  const proprietaire = await sessionProprietaire();
  if (!proprietaire) redirect('/direction');
  const devoirs = await devoirsEnAttente(proprietaire.db);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 style={{ fontSize: 19 }}>Devoirs à corriger</h1>
          <p>
            Un devoir n’est accepté qu’après le score minimum de l’évaluation. Votre décision prévient l’étudiant
            immédiatement, et un refus doit porter une explication.
          </p>
        </div>
      </div>

      <DecisionsListe
        elements={devoirs.map((devoir) => ({
          id: devoir.id,
          titre: `${devoir.etudiant} — ${devoir.evaluation}`,
          sousTitre: `${devoir.formation} · ${devoir.courriel}`,
          detail: devoir.note,
          meta: devoir.statut === 'pending' ? `rendu le ${quand(devoir.atMs)}` : 'repris à rendre',
          statut: devoir.statut,
          genre: 'devoir' as const,
        }))}
      />
    </>
  );
}
