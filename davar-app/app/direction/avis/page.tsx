import { redirect } from 'next/navigation';
import { Icon } from '@/components/campus/Icon';
import { sessionProprietaire } from '@/lib/server/direction-access';
import { avisEnRetard, avisRecus } from '@/lib/server/avis';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Avis — Direction' };

/** AVIS — les avis reçus (l’ÉCRIT uniquement) et ceux qui se font attendre. */
export default async function AvisPage() {
  const proprietaire = await sessionProprietaire();
  if (!proprietaire) redirect('/direction');
  const [recus, retard] = await Promise.all([avisRecus(proprietaire.db), avisEnRetard(proprietaire.db)]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 style={{ fontSize: 19 }}>Avis des étudiants</h1>
          <p>
            Deux avis sont demandés : environ deux semaines après l’achat, puis environ un mois. Vous ne recevez ici
            que l’<b>écrit</b> — un avis audio est transcrit, jamais transmis en fichier.
          </p>
        </div>
      </div>

      <div className="grid g2 mb16">
        <div className="card card-pad">
          <div className="eyebrow">Avis reçus</div>
          <div style={{ fontSize: 26, fontWeight: 800, marginTop: 6 }}>{recus.length}</div>
        </div>
        <div className="card card-pad">
          <div className="eyebrow">Avis en retard</div>
          <div style={{ fontSize: 26, fontWeight: 800, marginTop: 6 }}>{retard.length}</div>
          <div className="xs muted">À relancer, sans harceler.</div>
        </div>
      </div>

      {retard.length > 0 && (
        <div className="card card-pad mb16">
          <h3 className="mb8">À relancer</h3>
          {retard.slice(0, 20).map((ligne) => (
            <div key={`${ligne.courriel}-${ligne.step}`} className="row between" style={{ gap: 10, padding: '7px 0', borderBottom: '1px solid var(--line)' }}>
              <span className="small">
                <b>{ligne.etudiant}</b> <span className="xs faint">{ligne.courriel}</span>
              </span>
              <span className="xs muted">
                avis n°{ligne.step} · {ligne.retardJours} jour(s) de retard
              </span>
            </div>
          ))}
        </div>
      )}

      {recus.length === 0 ? (
        <div className="card card-pad">
          <div className="empty">
            <Icon nom="quote" taille={24} />
            <h3 className="mt16">Aucun avis pour l’instant</h3>
            <p className="muted small mt8">Les avis apparaîtront ici au fil des formations suivies.</p>
          </div>
        </div>
      ) : (
        <div className="col" style={{ gap: 10 }}>
          {recus.map((avis) => (
            <div className="card card-pad" key={avis.id}>
              <div className="row between" style={{ gap: 10, flexWrap: 'wrap' }}>
                <span className="small">
                  <b>{avis.etudiant}</b> <span className="xs faint">{avis.courriel}</span>
                </span>
                <span className="row" style={{ gap: 6 }}>
                  <span className="badge b-grey">avis n°{avis.step}</span>
                  <span className="badge b-grey">{avis.mots} mots</span>
                  {avis.kind === 'audio' && <span className="badge b-violet">audio transcrit</span>}
                  <span className="xs faint">{new Date(avis.atMs).toLocaleDateString('fr-FR')}</span>
                </span>
              </div>
              <div className="xs muted mt4">{avis.formation}</div>
              <p className="small mt8" style={{ whiteSpace: 'pre-wrap' }}>{avis.extrait}</p>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
