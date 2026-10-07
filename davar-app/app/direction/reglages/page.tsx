import { redirect } from 'next/navigation';
import { ApparenceAdmin } from '@/components/direction/ApparenceAdmin';
import { ReglagesAdmin } from '@/components/direction/ReglagesAdmin';
import { sessionProprietaire } from '@/lib/server/direction-access';
import { apparenceChoisie } from '@/lib/server/apparence';
import { lireReglages } from '@/lib/server/settings';
import { abonnements, totalParPlateforme } from '@/lib/server/social';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Réglages — Direction' };

/** RÉGLAGES — les contacts, les réseaux et le bandeau d'annonce du campus. */
export default async function ReglagesPage() {
  const proprietaire = await sessionProprietaire();
  if (!proprietaire) redirect('/direction');
  const [reglages, apparence, suivis, totaux] = await Promise.all([
    lireReglages(proprietaire.db),
    apparenceChoisie(proprietaire.db),
    abonnements(proprietaire.db, 100),
    totalParPlateforme(proprietaire.db),
  ]);

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
      <ApparenceAdmin paletteInitiale={apparence.palette} couleursInitiales={apparence.couleurs} />
      <div className="mt16" />
      <ReglagesAdmin initiaux={reglages} />

      <div className="card card-pad mt16">
        <h3 className="mb4">Contrôle des abonnements</h3>
        <p className="small muted mb16">
          Aucune plateforme ne permet de vérifier un abonnement : ce sont les confirmations de vos étudiants, horodatées
          à la seconde, qui font foi.
        </p>
        {totaux.length > 0 && (
          <div className="row" style={{ gap: 16, flexWrap: 'wrap', marginBottom: 10 }}>
            {totaux.map((total) => (
              <span key={total.plateforme} className="small">
                <b>{total.total}</b> <span className="muted">{total.plateforme}</span>
              </span>
            ))}
          </div>
        )}
        {suivis.length === 0 ? (
          <p className="small muted">Aucune confirmation d’abonnement pour l’instant.</p>
        ) : (
          suivis.map((ligne, index) => (
            <div key={`${ligne.courriel}-${ligne.plateforme}-${index}`} className="row between small" style={{ padding: '6px 0', borderBottom: '1px solid var(--line)', flexWrap: 'wrap' }}>
              <span>
                <b>{ligne.etudiant}</b> <span className="xs faint">{ligne.courriel}</span>
              </span>
              <span className="xs muted">
                {ligne.plateforme} · {new Date(ligne.atMs).toLocaleString('fr-FR')}
              </span>
            </div>
          ))
        )}
      </div>
    </>
  );
}
