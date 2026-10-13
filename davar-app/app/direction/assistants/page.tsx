import Link from 'next/link';
import { redirect } from 'next/navigation';
import { analyseAssistants } from '@/lib/server/assistants';
import { sessionSection } from '@/lib/server/direction-access';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Analyse des assistants — Direction' };

/**
 * ANALYSE DES ASSISTANTS — ce que les assistants ont réellement fait, et ce qui
 * attend une réponse humaine.
 *
 * C'est aussi l'écran qui montre si l'assistant a de quoi répondre : une
 * formation non associée, ou des leçons sans texte, se voient d'un coup d'œil.
 */
export default async function AssistantsPage() {
  const session = await sessionSection('assistants');
  if (!session) redirect('/connexion');

  const analyse = await analyseAssistants(session.db);
  const maximum = Math.max(1, ...analyse.parJour.map((jour) => jour.questions));
  const sansTexte = analyse.baseDeConnaissances.filter((formation) => formation.associee && formation.leconsAvecTexte === 0);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 style={{ fontSize: 19 }}>Analyse des assistants</h1>
          <p>
            Qui répond, qui prend le relais, et où les questions tombent. Les compteurs sont ceux du fournisseur réel — aucun
            chiffre n&apos;est estimé.
          </p>
        </div>
      </div>

      <div className="banner info mb16">
        <span>{analyse.basculeDuJour}</span>
      </div>

      <div className="grid g3 mb16">
        <div className="card card-pad">
          <div className="eyebrow">Questions aujourd&apos;hui</div>
          <div style={{ fontSize: 26, fontWeight: 800, marginTop: 6 }}>{analyse.questionsAujourdhui}</div>
          <div className="xs muted">
            {analyse.etudiantsServisAujourdhui} étudiant(s) · {analyse.questionsTrenteJours} sur 30 jours
          </div>
        </div>
        <div className="card card-pad">
          <div className="eyebrow">Plafond par étudiant et par jour</div>
          <div style={{ fontSize: 26, fontWeight: 800, marginTop: 6 }}>{analyse.plafondParEtudiant}</div>
          <div className="xs muted">C&apos;est ce plafond qui fait tenir l&apos;offre gratuite à 3 000 étudiants.</div>
        </div>
        <div className="card card-pad">
          <div className="eyebrow">En attente d&apos;une réponse humaine</div>
          <div style={{ fontSize: 26, fontWeight: 800, marginTop: 6 }}>{analyse.enAttente.coach}</div>
          <div className="xs muted">
            {analyse.enAttente.iaNonValidee} réponse(s) de l&apos;assistant à valider ·{' '}
            <Link href="/direction/conversations">superviser</Link>
          </div>
        </div>
      </div>

      <div className="card card-pad mb16" style={{ overflowX: 'auto' }}>
        <h3 className="mb8">Les fournisseurs, dans l&apos;ordre</h3>
        <table className="dv-tbl">
          <thead>
            <tr>
              <th>Assistant</th>
              <th>Aujourd&apos;hui</th>
              <th>30 jours</th>
              <th>Quota atteint</th>
              <th>Dernière fois</th>
            </tr>
          </thead>
          <tbody>
            {analyse.fournisseurs.map((fournisseur) => (
              <tr key={fournisseur.provider}>
                <td>
                  <b className="small">
                    {fournisseur.position}. {fournisseur.nom}
                  </b>
                  {fournisseur.actif && <span className="dv-tag open" style={{ marginLeft: 8 }}>répond</span>}
                  {!fournisseur.cle && <span className="dv-tag closed" style={{ marginLeft: 8 }}>clé absente</span>}
                </td>
                <td className="small">{fournisseur.requetesAujourdhui}</td>
                <td className="small">{fournisseur.requetesTrenteJours}</td>
                <td className="small muted">{fournisseur.joursEpuises} jour(s)</td>
                <td className="small muted">{fournisseur.dernierEpuisement ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {analyse.actif === null && (
          <div className="banner warn mt8" role="status">
            <span>
              Aucun assistant ne peut répondre en ce moment. Le campus le dit à l&apos;étudiant et transmet la question au
              coach — il ne fait jamais semblant.
            </span>
          </div>
        )}
      </div>

      <div className="grid g2 mb16" style={{ alignItems: 'start' }}>
        <div className="card card-pad">
          <h3 className="mb8">Questions, jour par jour (30 jours)</h3>
          {analyse.parJour.length === 0 ? (
            <p className="small muted">Aucune question posée pour l&apos;instant.</p>
          ) : (
            <div className="dv-list">
              {analyse.parJour.map((jour) => (
                <div key={jour.jour} className="row" style={{ gap: 10, alignItems: 'center' }}>
                  <span className="xs faint" style={{ width: 78 }}>{jour.jour}</span>
                  <span style={{ flex: 1, background: 'var(--violet-soft)', height: 8, borderRadius: 99 }}>
                    <span
                      style={{
                        display: 'block',
                        width: `${Math.round((jour.questions / maximum) * 100)}%`,
                        background: 'var(--violet)',
                        height: 8,
                        borderRadius: 99,
                      }}
                    />
                  </span>
                  <span className="xs">{jour.questions}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card card-pad">
          <h3 className="mb8">Où les questions tombent</h3>
          {analyse.parFormation.length === 0 ? (
            <p className="small muted">Aucune conversation enregistrée pour l&apos;instant.</p>
          ) : (
            <div className="dv-list">
              {analyse.parFormation.map((ligne) => (
                <div key={ligne.formation} className="dv-item row between">
                  <span className="small">{ligne.formation}</span>
                  <span className="small muted">{ligne.questions}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card card-pad">
        <h3 className="mb8">Ce que l&apos;assistant a le droit de lire</h3>
        <p className="small muted mb8">
          Deux conditions, cumulatives : la formation doit être <b>associée</b> à l&apos;assistant, et l&apos;étudiant doit
          y être <b>inscrit</b>. Aucune autre formation ne peut donc fuiter dans une réponse. L&apos;association se règle
          dans <Link href="/direction/assistant">Assistant virtuel</Link>.
        </p>
        {analyse.baseDeConnaissances.length === 0 ? (
          <p className="small muted">Aucune formation créée pour l&apos;instant.</p>
        ) : (
          <table className="dv-tbl">
            <thead>
              <tr>
                <th>Formation</th>
                <th>Associée</th>
                <th>Leçons</th>
                <th>Leçons avec du texte</th>
              </tr>
            </thead>
            <tbody>
              {analyse.baseDeConnaissances.map((formation) => (
                <tr key={formation.titre}>
                  <td className="small">{formation.titre}</td>
                  <td className="small muted">{formation.associee ? 'oui' : 'non'}</td>
                  <td className="small">{formation.lecons}</td>
                  <td className="small">
                    {formation.leconsAvecTexte}
                    {formation.leconsAvecTexte === 0 && formation.lecons > 0 && (
                      <span className="xs faint"> — sans texte, l’assistant lit surtout les titres</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {sansTexte.length > 0 && (
          <div className="banner warn mt8" role="status">
            <span>
              {sansTexte.length} formation(s) associée(s) n&apos;ont aucune leçon rédigée : l&apos;assistant répondra surtout
              d&apos;après les titres. C&apos;est votre texte de leçon qui lui donne sa matière.
            </span>
          </div>
        )}
      </div>
    </>
  );
}
