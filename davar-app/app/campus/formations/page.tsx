import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Icon } from '@/components/campus/Icon';
import { currentSession } from '@/lib/server/auth';
import { listTrainingsApercu, listUserTrainings } from '@/lib/server/campus';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Mes formations — Davar Académie Campus' };

/** MES FORMATIONS — reconstruction fidèle de `vMyTrainings()` du prototype. */
export default async function MesFormationsPage() {
  const session = await currentSession();
  if (!session) redirect('/connexion');
  // Vue test : le contenu réel du propriétaire, sans progression et sans écriture.
  const formations = session.vueTest
    ? await listTrainingsApercu(session.db)
    : await listUserTrainings(session.db, session.user.id);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Mes formations</h1>
          <p>
            Vos formations, l&apos;avancement de chacune, et la date de votre accès. L&apos;accès est
            ouvert pour <strong>12 mois</strong> à partir de l&apos;achat.
          </p>
        </div>
      </div>

      {formations.length === 0 ? (
        <div className="card card-pad">
          <div className="empty">
            <Icon nom="cap" taille={26} />
            <h3 className="mt16">Aucune formation sur votre compte</h3>
            <p className="muted small mt8">
              Si vous venez d&apos;acheter, écrivez-nous : l&apos;accès se rattache à l&apos;adresse de
              votre achat, et la direction peut l&apos;ouvrir à la main.
            </p>
            <Link href="/campus/aide" className="btn btn-primary mt16">
              <Icon nom="headset" taille={15} /> Écrire à la direction
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid g2">
          {formations.map((formation) => {
            const pourcent =
              formation.lessonCount === 0
                ? 0
                : Math.round((formation.completedCount / formation.lessonCount) * 100);
            return (
              <Link key={formation.id} href={`/campus/formation/${formation.id}`} className="card card-pad">
                <div className="row between" style={{ gap: 8 }}>
                  <h3 style={{ fontSize: 16 }}>{formation.title}</h3>
                  {pourcent >= 100 ? (
                    <span className="badge b-green">terminée</span>
                  ) : pourcent > 0 ? (
                    <span className="badge b-violet">en cours</span>
                  ) : (
                    <span className="badge b-grey">à commencer</span>
                  )}
                </div>
                {formation.description && <p className="muted small mt8">{formation.description}</p>}
                <div className="pbar mt16">
                  <i style={{ width: `${pourcent}%` }} />
                </div>
                <div className="xs faint mt4">
                  {formation.completedCount} sur {formation.lessonCount} leçon
                  {formation.lessonCount > 1 ? 's' : ''} · {pourcent} %
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
