import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Icon } from '@/components/campus/Icon';
import { currentSession } from '@/lib/server/auth';
import { listTrainingsApercu, listUserTrainings } from '@/lib/server/campus';
import { depuis, modulesConsultes, salutation } from '@/lib/server/campus-recents';
import { lireMotivations } from '@/lib/server/motivations';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Tableau de bord — Davar Académie Campus' };

/** Barre de progression — mêmes classes et même libellé que le prototype. */
function Progression({ pourcent }: { pourcent: number }) {
  return (
    <div>
      <div className="pbar">
        <i style={{ width: `${pourcent}%` }} />
      </div>
      <div className="xs faint mt4">{pourcent} % terminé</div>
    </div>
  );
}

/**
 * TABLEAU DE BORD ÉTUDIANT — reconstruction fidèle de `vDashboard()` du prototype.
 *
 * Même salutation selon l'heure, même en-tête de page, même carte « Reprendre ma
 * formation », mêmes « Consultés récemment », puis « Mes formations ».
 *
 * Écart assumé et visible : les cartes du prototype qui reposent sur des parties
 * pas encore construites ne sont pas affichées — jamais simulées.
 */
export default async function CampusDashboard() {
  const session = await currentSession();
  if (!session) redirect('/connexion');
  const { db, user } = session;

  const [formations, recents, motivations] = await Promise.all([
    session.vueTest ? listTrainingsApercu(db) : listUserTrainings(db, user.id),
    session.vueTest ? Promise.resolve([]) : modulesConsultes(db, user.id),
    lireMotivations(db),
  ]);

  const avecProgression = formations.map((formation) => ({
    formation,
    pourcent:
      formation.lessonCount === 0 ? 0 : Math.round((formation.completedCount / formation.lessonCount) * 100),
  }));
  // « Reprendre » : la première formation commencée mais pas terminée, comme le prototype.
  const aReprendre = avecProgression.find(({ pourcent }) => pourcent > 0 && pourcent < 100) ?? null;
  const prenom = user.displayName.split(' ')[0] || user.displayName;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>
            {salutation()}, {prenom} 👋
          </h1>
          <p>Voici l&apos;état de votre campus aujourd&apos;hui.</p>
        </div>
      </div>

      {formations.length === 0 ? (
        <div className="card card-pad">
          <div className="empty">
            <Icon nom="cap" taille={26} />
            <h3 className="mt16">Votre campus est prêt</h3>
            <p className="muted small mt8">
              Aucune formation n&apos;est encore rattachée à votre compte. Si vous venez d&apos;acheter,
              vérifiez que l&apos;adresse de votre compte est bien <strong>confirmée</strong> et
              qu&apos;elle est identique à celle de votre achat. Dans le moindre doute, écrivez-nous :
              la direction ouvre l&apos;accès à la main.
            </p>
            <Link href="/campus/aide" className="btn btn-primary mt16">
              <Icon nom="headset" taille={15} /> Écrire à la direction
            </Link>
          </div>
        </div>
      ) : (
        <>
          {aReprendre && (
            <div className="card" style={{ overflow: 'hidden', marginBottom: 22 }}>
              <div className="row" style={{ padding: 20, flexWrap: 'wrap', gap: 16 }}>
                <div className="wrap" style={{ minWidth: 220 }}>
                  <div className="eyebrow">Reprendre ma formation</div>
                  <h3 style={{ fontSize: 16, margin: '3px 0 8px' }}>{aReprendre.formation.title}</h3>
                  <Progression pourcent={aReprendre.pourcent} />
                </div>
                <Link
                  href={`/campus/formation/${aReprendre.formation.id}`}
                  className="btn btn-primary"
                  style={{ marginLeft: 'auto' }}
                >
                  <Icon nom="play" taille={15} /> Continuer
                </Link>
              </div>
            </div>
          )}

          <div className="card mb24">
            <div className="card-head">
              <h3>Mes formations</h3>
              <Link href="/campus/formations" className="small">
                Tout voir
              </Link>
            </div>
            {avecProgression.map(({ formation, pourcent }) => (
              <Link
                key={formation.id}
                href={`/campus/formation/${formation.id}`}
                className="res-item"
              >
                <span className={`step-ico ${pourcent >= 100 ? 's-done' : pourcent > 0 ? 's-cur' : ''}`}>
                  <Icon nom={pourcent >= 100 ? 'checkCircle' : 'play'} taille={14} />
                </span>
                <div className="wrap">
                  <b style={{ fontSize: 13.5 }}>{formation.title}</b>
                  <div className="xs faint">
                    {formation.completedCount} sur {formation.lessonCount} leçon
                    {formation.lessonCount > 1 ? 's' : ''} terminée
                    {formation.completedCount > 1 ? 's' : ''}
                  </div>
                </div>
                <Icon nom="chevR" taille={15} className="faint" />
              </Link>
            ))}
          </div>

          <div className="card card-pad mb24" style={{ background: 'linear-gradient(140deg, var(--violet-soft) 0%, var(--card) 70%)' }}>
            <div className="eyebrow">
              <Icon nom="quote" taille={13} /> Votre motivation de la semaine
            </div>
            <p style={{ fontSize: 15, fontWeight: 600, fontStyle: 'italic', marginTop: 10 }}>
              « {motivations.courante} »
            </p>
            <div className="xs faint mt8">
              Chaque dimanche, une nouvelle motivation vous arrive dans la cloche de votre campus.
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <h3>Consultés récemment</h3>
            </div>
            {recents.length === 0 ? (
              <div className="empty small">Commencez un module pour le retrouver ici.</div>
            ) : (
              recents.map((recent) => (
                <Link
                  key={recent.moduleId}
                  href={`/campus/formation/${recent.formationId}`}
                  className="res-item"
                >
                  <span className="step-ico s-cur">
                    <Icon nom="play" taille={14} />
                  </span>
                  <div className="wrap">
                    <b style={{ fontSize: 13 }}>{recent.moduleTitre}</b>
                    <div className="xs faint">{recent.formationTitre}</div>
                  </div>
                  <span className="xs faint">{depuis(recent.quandMs)}</span>
                </Link>
              ))
            )}
          </div>
        </>
      )}
    </>
  );
}
