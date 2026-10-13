import { redirect } from 'next/navigation';
import { Icon } from '@/components/campus/Icon';
import { currentSession } from '@/lib/server/auth';
import type { NomIcone } from '@/components/campus/Icon';
import { badgesDeEtudiant, catalogueBadges, installerCatalogue } from '@/lib/server/recompenses';
import { listUserTrainings } from '@/lib/server/campus';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Mes distinctions — Davar Académie Campus' };

function quand(atMs: number): string {
  return new Date(atMs).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
}

/** MES DISTINCTIONS — les badges obtenus, et ceux qui restent à conquérir. */
export default async function DistinctionsPage() {
  const session = await currentSession();
  if (!session) redirect('/connexion');

  let [obtenus, catalogue] = await Promise.all([
    badgesDeEtudiant(session.db, session.user.id),
    catalogueBadges(session.db),
  ]);
  // Première visite : le catalogue s'installe une fois, et ne se réécrit plus.
  if (catalogue.length === 0) {
    const formations = await listUserTrainings(session.db, session.user.id);
    await installerCatalogue(
      session.db,
      formations.map((formation) => ({ id: formation.id, title: formation.title }))
    );
    catalogue = await catalogueBadges(session.db);
  }
  const obtenusIds = new Set(obtenus.map((badge) => badge.id));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Mes distinctions</h1>
          <p>
            Chaque distinction reconnaît un progrès réel. Elles s’obtiennent par le travail — certaines après
            quelques étapes, d’autres au bout du chemin.
          </p>
        </div>
      </div>

      {obtenus.length > 0 && (
        <>
          <h2 className="mb8" style={{ fontSize: 16 }}>
            Obtenues ({obtenus.length})
          </h2>
          <div className="grid g2 mb16">
            {obtenus.map((badge) => (
              <div key={badge.id} className="card card-pad">
                <div className="row between" style={{ gap: 8 }}>
                  <span className="row" style={{ gap: 8 }}>
                    <Icon nom={badge.icon as NomIcone} taille={18} />
                    <b>{badge.name}</b>
                  </span>
                  <span className="badge b-gold">{quand(badge.obtenuLeMs)}</span>
                </div>
                {badge.shortText && <p className="small mt8" style={{ color: 'var(--gold2)' }}>{badge.shortText}</p>}
                {badge.emotionText && <p className="xs muted mt8">{badge.emotionText}</p>}
              </div>
            ))}
          </div>
        </>
      )}

      {obtenus.length === 0 && (
        <div className="banner info mb16">
          <Icon nom="award" taille={14} />
          <span className="small">
            Votre première distinction arrive dès que vous entrez dans un module. La suite se gagne en avançant.
          </span>
        </div>
      )}

      <h2 className="mb8" style={{ fontSize: 16 }}>
        À conquérir
      </h2>
      <div className="card card-pad">
        {catalogue
          .filter((badge) => !obtenusIds.has(badge.id))
          .map((badge) => (
            <div key={badge.id} className="row" style={{ gap: 10, padding: '9px 0', borderBottom: '1px solid var(--line)' }}>
              <span style={{ opacity: 0.5 }}>
                <Icon nom={badge.icon as NomIcone} taille={17} />
              </span>
              <span className="small">
                <b>{badge.name}</b>
                <div className="xs muted">{badge.description}</div>
              </span>
            </div>
          ))}
      </div>
      <p className="xs faint mt16">
        <Icon nom="lock" taille={12} /> Aucune distinction ne s’achète : elles se gagnent uniquement par le travail.
      </p>
    </>
  );
}
