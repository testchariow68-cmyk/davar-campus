import { redirect } from 'next/navigation';
import Link from 'next/link';
import { analyseVentes } from '@/lib/server/ventes';
import { sessionSection } from '@/lib/server/direction-access';
import { depuis } from '@/lib/server/campus-recents';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Ventes — Direction' };

const quand = (atMs: number) =>
  new Date(atMs).toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

/**
 * VENTES — ce qui a réellement été encaissé, et où chaque achat en est.
 *
 * L'argent n'est jamais deviné : chaque ligne vient d'un reçu vérifié par le
 * webhook signé du système de vente. Les totaux sont donnés devise par devise —
 * des francs et des dollars ne s'additionnent pas.
 */
export default async function VentesPage() {
  const session = await sessionSection('ventes');
  if (!session) redirect('/connexion');

  const analyse = await analyseVentes(session.db);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 style={{ fontSize: 19 }}>Ventes</h1>
          <p>
            Paiements collectés via <b>Chariow</b> (1<sup>er</sup> achat, hors app). Les achats dans l&apos;application
            sont reportés. Les frais de transaction sont <b>supportés par l&apos;étudiant</b> et ajoutés au prix affiché.
            Chaîne : <b>paiement confirmé → webhook → compte identifié → formation attribuée</b>.
          </p>
        </div>
      </div>

      {analyse.sansCompte.length > 0 && (
        <div className="card card-pad mb16">
          <h3 className="mb8">
            Acheteurs sans compte <span className="badge b-amber">{analyse.sansCompte.length}</span>
          </h3>
          <p className="small muted mb8">
            Ces personnes ont payé : le lien du campus leur a été envoyé par e-mail. Dès qu&apos;elles ouvrent leur compte
            avec <b>l&apos;adresse d&apos;achat</b>, la formation s&apos;ajoute toute seule — sans intervention.
          </p>
          <table className="dv-tbl">
            <thead>
              <tr>
                <th>Adresse d&apos;achat</th>
                <th>Formation</th>
                <th>Montant</th>
                <th>Vérifié</th>
              </tr>
            </thead>
            <tbody>
              {analyse.sansCompte.map((ligne) => (
                <tr key={ligne.saleId}>
                  <td className="small">{ligne.acheteur}</td>
                  <td className="small muted">{ligne.formation}</td>
                  <td className="small">{ligne.montantAffiche}</td>
                  <td className="small muted">{depuis(ligne.verifieMs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="grid g3 mb16">
        <div className="card card-pad">
          <div className="eyebrow">Ventes confirmées</div>
          <div style={{ fontSize: 26, fontWeight: 800, marginTop: 6 }}>{analyse.total}</div>
          <div className="xs muted">
            {analyse.trenteJours} sur 30 jours · {analyse.attribuees} formation(s) attribuée(s)
          </div>
        </div>
        <div className="card card-pad">
          <div className="eyebrow">Chiffre d&apos;affaires</div>
          {analyse.parDevise.length === 0 ? (
            <div style={{ fontSize: 26, fontWeight: 800, marginTop: 6 }}>—</div>
          ) : (
            analyse.parDevise.map((totaux) => (
              <div key={totaux.devise} style={{ fontSize: 22, fontWeight: 800, marginTop: 6 }}>
                {totaux.montantAffiche}
              </div>
            ))
          )}
          <div className="xs muted">Chaque devise est comptée séparément, jamais mélangée.</div>
        </div>
        <div className="card card-pad">
          <div className="eyebrow">Panier moyen</div>
          {analyse.parDevise.length === 0 ? (
            <div style={{ fontSize: 26, fontWeight: 800, marginTop: 6 }}>—</div>
          ) : (
            analyse.parDevise.map((totaux) => (
              <div key={totaux.devise} style={{ fontSize: 22, fontWeight: 800, marginTop: 6 }}>
                {totaux.panierMoyenAffiche}
                <span className="xs muted" style={{ fontWeight: 400 }}>
                  {' '}
                  · {totaux.ventes} vente(s)
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="card card-pad" style={{ overflowX: 'auto' }}>
        {analyse.lignes.length === 0 ? (
          <div className="empty small">
            Aucune vente enregistrée pour l&apos;instant. Chaque achat confirmé apparaîtra ici dès que le système de vente
            l&apos;aura transmis.
          </div>
        ) : (
          <table className="dv-tbl">
            <thead>
              <tr>
                <th>Référence</th>
                <th>Acheteur</th>
                <th>Formation</th>
                <th>Montant</th>
                <th>Chaîne</th>
              </tr>
            </thead>
            <tbody>
              {analyse.lignes.map((ligne) => (
                <tr key={ligne.saleId}>
                  <td>
                    <span className="kbd">{ligne.saleId}</span>
                    <div className="xs faint mt4">{quand(ligne.verifieMs)}</div>
                  </td>
                  <td>
                    <b className="small">{ligne.etudiant ?? '—'}</b>
                    <div className="xs muted">{ligne.acheteur}</div>
                  </td>
                  <td className="small muted">{ligne.formation}</td>
                  <td>
                    <b className="small">{ligne.montantAffiche}</b>
                  </td>
                  <td className="small">
                    <span className={`dv-tag${ligne.webhookMs != null ? ' open' : ' closed'}`}>
                      {ligne.webhookMs != null ? 'webhook reçu' : 'webhook non reçu'}
                    </span>{' '}
                    <span className={`dv-tag${ligne.compteIdentifie ? ' open' : ' closed'}`}>
                      {ligne.compteIdentifie ? (ligne.compteNonConfirme ? 'compte à confirmer' : 'compte identifié') : 'compte absent'}
                    </span>{' '}
                    <span className={`dv-tag${ligne.attribueeMs != null ? ' open' : ''}`}>
                      {ligne.attribueeMs != null ? 'formation attribuée' : 'formation en attente'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="xs faint mt8">
          Un achat déjà rattaché ne crée jamais de second compte : la formation s&apos;ajoute à celui qui existe (un
          nouvel achat ajoute une formation, il ne remplace rien). Les acheteurs se retrouvent dans{' '}
          <Link href="/direction/etudiants">Étudiants</Link>, et la trace des événements dans{' '}
          <Link href="/direction/sante">Santé technique</Link>.
        </p>
      </div>
    </>
  );
}
