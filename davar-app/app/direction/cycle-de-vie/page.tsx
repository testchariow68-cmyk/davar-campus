import { redirect } from 'next/navigation';
import { CycleDeVieAdmin } from '@/components/direction/CycleDeVieAdmin';
import { sessionProprietaire } from '@/lib/server/direction-access';
import { CONFIG_CYCLE_DE_VIE, POLITIQUES, etatCycleDeVie, journalDePurge } from '@/lib/server/cycle-de-vie';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Cycle de vie — Direction' };

/**
 * CYCLE DE VIE — « une donnée n'est conservée que tant qu'une finalité légitime
 * le justifie ». Cette page montre ce qui attend, et exécute sur votre ordre,
 * jamais toute seule. La matrice des politiques est publiée telle quelle.
 */
export default async function CycleDeViePage() {
  const proprietaire = await sessionProprietaire();
  if (!proprietaire) redirect('/direction');

  const [rapport, journal] = await Promise.all([
    etatCycleDeVie(proprietaire.db),
    journalDePurge(proprietaire.db),
  ]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 style={{ fontSize: 19 }}>Cycle de vie des données</h1>
          <p>
            Ce que la plateforme conserve, combien de temps, et ce qu’elle efface. Aucune purge automatique n’est
            active : chaque passage se demande ici, avec vos deux verrous.
          </p>
        </div>
      </div>

      <CycleDeVieAdmin rapportInitial={rapport} journalInitial={journal} />

      <div className="card card-pad mt16">
        <h3 className="mb4">Politique de conservation</h3>
        <p className="small muted mb16">
          Les durées ci-dessous sont celles de votre prototype. Elles ne changent que sur votre décision.
        </p>
        {POLITIQUES.map(([classe, regle]) => (
          <div key={classe} className="row" style={{ gap: 10, padding: '6px 0', borderBottom: '1px solid var(--line)', flexWrap: 'wrap' }}>
            <b className="small" style={{ minWidth: 280, flex: 1 }}>{classe}</b>
            <span className="small muted" style={{ flex: 1, minWidth: 240 }}>{regle}</span>
          </div>
        ))}
        <p className="xs faint mt16">
          Durées appliquées : upload abandonné {CONFIG_CYCLE_DE_VIE.abandonedHours} h · conversations IA{' '}
          {CONFIG_CYCLE_DE_VIE.aiConvDays} jours · coach {CONFIG_CYCLE_DE_VIE.coachConvMonths} mois · notifications lues{' '}
          {CONFIG_CYCLE_DE_VIE.notifReadHours} h (au plus {CONFIG_CYCLE_DE_VIE.notifMaxDays} jours) · journaux techniques{' '}
          {CONFIG_CYCLE_DE_VIE.techLogDays} jours · journaux de sécurité {CONFIG_CYCLE_DE_VIE.secLogMonths} mois · compte
          terminé {CONFIG_CYCLE_DE_VIE.accountGraceMonths} mois puis quarantaine {CONFIG_CYCLE_DE_VIE.quarantineDays} jours
          · certificats {CONFIG_CYCLE_DE_VIE.certRetentionYears} ans.
        </p>
      </div>
    </>
  );
}
