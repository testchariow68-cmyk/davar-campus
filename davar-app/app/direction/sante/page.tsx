import { redirect } from 'next/navigation';
import { sessionSection } from '@/lib/server/direction-access';
import { santeTechnique } from '@/lib/server/sante';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Santé technique — Direction' };

function quand(atMs: number | null): string {
  if (!atMs) return 'jamais';
  return new Date(atMs).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

const TEINTE: Record<string, string> = {
  relie: 'var(--green)',
  en_attente: 'var(--amber)',
  volontairement_ferme: 'var(--muted)',
};

/**
 * SANTÉ TECHNIQUE — ce qui est réellement branché, et ce que les offres gratuites
 * consomment. Aucun secret n'y apparaît : seulement « configuré » ou « en attente ».
 *
 * C'est l'écran qui répond à « est-ce que tout est branché ? » — et qui le dit
 * franchement quand une pièce manque encore, plutôt que de le laisser croire.
 */
export default async function SantePage() {
  const session = await sessionSection('sante');
  if (!session) redirect('/connexion');

  const etat = await santeTechnique(session.db);
  const enAttente = etat.services.filter((service) => service.etat === 'en_attente');

  return (
    <>
      <div className="page-head">
        <div>
          <h1 style={{ fontSize: 19 }}>Santé technique</h1>
          <p>
            L&apos;état réel des services, lu à l&apos;instant, et la consommation des offres gratuites. Aucune clé, aucun
            jeton, aucun montant ne s&apos;affiche ici.
          </p>
        </div>
      </div>

      {enAttente.length > 0 ? (
        <div className="banner warn mb16" role="status">
          <span>
            {enAttente.length} service{enAttente.length > 1 ? 's' : ''} reste{enAttente.length > 1 ? 'nt' : ''} à relier :{' '}
            {enAttente.map((service) => service.nom).join(' · ')}.
          </span>
        </div>
      ) : (
        <div className="banner ok mb16" role="status">
          <span>Tout ce qui doit être branché l&apos;est : base, stockage, e-mails, mots de passe et assistants.</span>
        </div>
      )}

      <div className="card card-pad mb16">
        <h3 className="mb8">Services</h3>
        <div className="dv-list">
          {etat.services.map((service) => (
            <div key={service.cle} className="dv-item">
              <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
                <span
                  className="dv-tag"
                  style={{ color: TEINTE[service.etat], borderColor: TEINTE[service.etat], background: 'transparent' }}
                >
                  {service.etat === 'relie' ? 'relié' : service.etat === 'en_attente' ? 'à relier' : 'fermé (voulu)'}
                </span>
                <b>{service.nom}</b>
              </div>
              <div className="small muted mt4">{service.detail}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid g2 mb16" style={{ alignItems: 'start' }}>
        <div className="card card-pad">
          <h3 className="mb8">Quotas du jour</h3>
          <p className="small muted mb8">
            Règle du projet : « les quotas se protègent, ils ne se dépensent pas ». Ces compteurs sont ceux des offres
            gratuites.
          </p>
          <table className="dv-tbl">
            <thead>
              <tr>
                <th>Enveloppe</th>
                <th>Consommé</th>
                <th>État</th>
              </tr>
            </thead>
            <tbody>
              {etat.quotas.map((quota) => (
                <tr key={quota.bucket}>
                  <td className="small">
                    {quota.bucket}
                    <div className="xs faint">{quota.period === 'day' ? 'par jour' : 'par mois'}</div>
                  </td>
                  <td className="small">
                    {quota.used.toLocaleString('fr-FR')} / {quota.limit.toLocaleString('fr-FR')}
                  </td>
                  <td className="small muted">
                    {quota.verdict === 'ok' ? 'large' : quota.verdict === 'warning' ? 'à surveiller' : quota.verdict === 'critical' ? 'presque plein' : 'plein'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card card-pad">
          <h3 className="mb8">Traces réelles</h3>
          <p className="small muted mb8">Ce qui a réellement été enregistré, jamais une estimation.</p>
          <div className="dv-list">
            {etat.traces.map((trace) => (
              <div key={trace.nom} className="dv-item row between">
                <span className="small">{trace.nom}</span>
                <span className="small muted">
                  {trace.total.toLocaleString('fr-FR')} · dernier : {quand(trace.dernierMs)}
                </span>
              </div>
            ))}
          </div>
          <div className="divider" />
          <h3 className="mb8">Assistants</h3>
          <div className="dv-list">
            {etat.fournisseurs.map((fournisseur) => (
              <div key={fournisseur.provider} className="dv-item">
                <div className="row between" style={{ gap: 10 }}>
                  <b className="small">
                    {fournisseur.position}. {fournisseur.nom}
                    {fournisseur.actif ? ' — répond en ce moment' : ''}
                  </b>
                  <span className="xs faint">{fournisseur.cle ? 'clé posée' : 'clé absente'}</span>
                </div>
                <div className="xs faint">
                  {fournisseur.requetesAujourdhui} question(s) aujourd&apos;hui · {fournisseur.requetesTrenteJours} sur 30 jours
                  {fournisseur.joursEpuises > 0 ? ` · quota atteint ${fournisseur.joursEpuises} jour(s)` : ''}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card card-pad">
        <h3 className="mb8">La base</h3>
        <p className="small muted">
          {etat.base.tables} tables · {etat.base.migrations} migration(s) appliquée(s)
          {etat.base.derniereMigration ? ` · dernière : ${etat.base.derniereMigration}` : ''}
        </p>
      </div>
    </>
  );
}
