import { redirect } from 'next/navigation';
import Link from 'next/link';
import { analysePilotage } from '@/lib/server/pilotage';
import { sessionSection } from '@/lib/server/direction-access';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Analytics — Direction' };

/**
 * ANALYTICS — les quatre compteurs et les deux graphiques du prototype, nourris
 * par les données réelles du campus.
 *
 * Rien n'est estimé : ce qui n'existe pas encore s'affiche « — » avec la raison,
 * plutôt qu'un chiffre inventé. L'exercice, par exemple, ne laisse aucune note —
 * c'est voulu, et l'écran le dit.
 */
export default async function AnalyticsPage() {
  const session = await sessionSection('analytics');
  if (!session) redirect('/connexion');

  const analyse = await analysePilotage(session.db);
  const maximum = Math.max(1, ...analyse.parJour.map((jour) => jour.actions));

  return (
    <>
      <div className="page-head">
        <div>
          <h1 style={{ fontSize: 19 }}>Analytics</h1>
          <p>
            Travail réel des étudiants, formation par formation. Les comptes de test sont exclus de tous ces chiffres.
          </p>
        </div>
      </div>

      <div className="grid g4 mb16">
        <div className="card card-pad">
          <div className="eyebrow">Leçons terminées</div>
          <div style={{ fontSize: 26, fontWeight: 800, marginTop: 6 }}>{analyse.leconsTerminees}</div>
          <div className="xs muted">{analyse.lectures} lecture(s) de livres et audios en plus.</div>
        </div>
        <div className="card card-pad">
          <div className="eyebrow">Progression moyenne</div>
          <div style={{ fontSize: 26, fontWeight: 800, marginTop: 6 }}>
            {analyse.progressionMoyennePct == null ? '—' : `${analyse.progressionMoyennePct} %`}
          </div>
          <div className="xs muted">Sur {analyse.etudiantsSuivis} étudiant(s) suivi(s).</div>
        </div>
        <div className="card card-pad">
          <div className="eyebrow">Réussite exercices</div>
          <div style={{ fontSize: 26, fontWeight: 800, marginTop: 6 }}>—</div>
          <div className="xs muted">
            L&apos;exercice ne laisse aucune note : il ne bloque jamais la progression. C&apos;est une décision, pas un
            manque.
          </div>
        </div>
        <div className="card card-pad">
          <div className="eyebrow">Réussite évaluations</div>
          <div style={{ fontSize: 26, fontWeight: 800, marginTop: 6 }}>
            {analyse.evaluation.taux == null ? '—' : `${analyse.evaluation.taux} %`}
          </div>
          <div className="xs muted">
            {analyse.evaluation.tentatives === 0
              ? 'Aucune évaluation passée pour l’instant.'
              : `${analyse.evaluation.reussies} réussite(s) sur ${analyse.evaluation.tentatives} tentative(s) · score moyen ${analyse.evaluation.scoreMoyenPct} %.`}
          </div>
        </div>
      </div>

      <div className="grid g2 mb16" style={{ alignItems: 'start' }}>
        <div className="card card-pad">
          <div className="eyebrow mb8">Activité — 14 derniers jours</div>
          <div className="chart-bars">
            {analyse.parJour.map((jour, index) => (
              <i
                key={jour.jour}
                className={index === analyse.parJour.length - 1 ? 'hi' : undefined}
                style={{ height: `${Math.round((jour.actions / maximum) * 100)}%` }}
                title={`${jour.jour} · ${jour.actions} action(s)`}
              />
            ))}
          </div>
          <div className="row between mt8 xs faint">
            <span>J-14</span>
            <span>Aujourd&apos;hui : {analyse.actionsAujourdHui} action(s)</span>
          </div>
          <p className="xs faint mt8">
            Une action = {analyse.sourcesActivite}. Aucun compteur décoratif : tout vient de la base.
          </p>
        </div>

        <div className="card card-pad">
          <h3 className="mb8">Progression moyenne par formation</h3>
          {analyse.parFormation.length === 0 ? (
            <p className="small muted">
              Aucune formation publiée pour l&apos;instant. Publiez une formation dans{' '}
              <Link href="/direction/formations">Formations</Link> pour la voir ici.
            </p>
          ) : (
            <div className="dv-list">
              {analyse.parFormation.map((formation) => (
                <div key={formation.id} className="dv-item">
                  <div className="row between">
                    <b className="small">{formation.titre}</b>
                    <span className="xs muted">
                      {formation.etudiants} étudiant(s)
                      {formation.lecons === 0 ? ' · aucune leçon' : ''}
                    </span>
                  </div>
                  <div className="row mt4" style={{ gap: 10, alignItems: 'center' }}>
                    <div className="pbar">
                      <i style={{ width: `${formation.moyennePct ?? 0}%` }} />
                    </div>
                    <span className="xs faint" style={{ width: 38, textAlign: 'right' }}>
                      {formation.moyennePct == null ? '—' : `${formation.moyennePct} %`}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="xs faint mt8">
            La progression se calcule sur les leçons de chaque formation, jamais sur un pourcentage global : c&apos;est
            le seul chiffre qui veuille dire quelque chose.
          </p>
        </div>
      </div>

      <p className="xs faint">
        Voir aussi <Link href="/direction/activite">Activité des étudiants</Link> pour le détail par personne et{' '}
        <Link href="/direction/ventes">Ventes</Link> pour les achats.
      </p>
    </>
  );
}
