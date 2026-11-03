import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Icon } from '@/components/campus/Icon';
import { currentSession } from '@/lib/server/auth';
import { getTrainingForUser, listTrainingsApercu, listUserTrainings } from '@/lib/server/campus';
import { certificatsDeEtudiant } from '@/lib/server/certificats';
import { listerNotifications } from '@/lib/server/notifications';
import { ressourcesDeEtudiant } from '@/lib/server/ressources';
import { salutation } from '@/lib/server/campus-recents';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Tableau de bord — Davar Académie Campus' };

/** Barre de progression — mêmes classes et même libellé que le prototype. */
function Progression({ pourcent }: { pourcent: number }) {
  return (
    <div className="pbar">
      <i style={{ width: `${pourcent}%` }} />
    </div>
  );
}

/**
 * TABLEAU DE BORD ÉTUDIANT — `vHome()` du prototype.
 *
 * Le héros annonce où l'étudiant en est, la carte suivante lui donne la
 * prochaine action, puis viennent sa lecture, ce qu'il faut retenir et son
 * parcours. Aucune carte inventée : chaque bloc est celui du prototype.
 */
export default async function CampusDashboard() {
  const session = await currentSession();
  if (!session) redirect('/connexion');
  const { db, user } = session;
  const maintenant = Date.now();

  const formations = session.vueTest ? await listTrainingsApercu(db) : await listUserTrainings(db, user.id);
  const prenom = user.displayName.split(' ')[0] || user.displayName;

  const avecProgression = formations.map((formation) => ({
    formation,
    pourcent:
      formation.lessonCount === 0 ? 0 : Math.round((formation.completedCount / formation.lessonCount) * 100),
  }));
  // Formation active : la première commencée mais pas terminée, sinon la première.
  const active = avecProgression.find(({ pourcent }) => pourcent > 0 && pourcent < 100) ?? avecProgression[0] ?? null;

  const [notifications, ressources, certificats] = await Promise.all([
    session.vueTest ? Promise.resolve([]) : listerNotifications(db, user.id, maintenant, 3),
    session.vueTest ? Promise.resolve([]) : ressourcesDeEtudiant(db, user.id),
    session.vueTest ? Promise.resolve([]) : certificatsDeEtudiant(db, user.id),
  ]);

  const detail = active && !session.vueTest ? await getTrainingForUser(db, user.id, active.formation.id) : null;
  const prochaine = detail?.modules.flatMap((module) => module.lessons).find((lecon) => !lecon.completed) ?? null;

  const livres = ressources.filter((ressource) => ressource.kind === 'book');
  const audios = ressources.filter((ressource) => ressource.kind === 'audio');
  const dateLongue = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  const heure = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

  const phrase = active
    ? active.pourcent >= 100
      ? 'Parcours terminé — demandez votre certificat !'
      : `Vous en êtes à ${active.pourcent} % de « ${active.formation.title} ». ${
          prochaine ? 'Votre prochaine étape est prête.' : 'Parcours terminé — demandez votre certificat !'
        }`
    : 'Bienvenue sur votre campus. Choisissez une formation pour commencer.';

  return (
    <>
      <div className="cp-hero">
        <div className="cp-hello">
          <div className="eyebrow">
            {dateLongue} · {heure}
          </div>
          <h1>
            {salutation()}, {prenom} 👋
          </h1>
          <p>{phrase}</p>
          {active ? (
            <Link className="btn btn-primary" href={`/campus/formation/${active.formation.id}`}>
              <Icon nom="play" taille={15} />{' '}
              {active.pourcent >= 100 ? 'Voir ma formation' : 'Continuer ma formation'}
            </Link>
          ) : (
            <Link className="btn btn-primary" href="/campus/catalogue">
              <Icon nom="search" taille={15} /> Découvrir les formations
            </Link>
          )}
        </div>
        {active && (
          <div className="cp-active">
            <div className="eyebrow">Formation active</div>
            <b style={{ fontSize: 14.5 }}>{active.formation.title}</b>
            <div className="mt8">
              <Progression pourcent={active.pourcent} />
            </div>
            <div className="row between mt8">
              <span className="xs muted">{active.pourcent} % accompli</span>
              <Link href="/campus/formations" className="xs link">
                Toutes mes formations →
              </Link>
            </div>
          </div>
        )}
      </div>

      {prochaine && active && (
        <div className="cp-next">
          <div className="row">
            <span
              className="s-ico"
              style={{
                width: 42,
                height: 42,
                borderRadius: 12,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--violet)',
                color: '#fff',
              }}
            >
              <Icon nom={prochaine.kind === 'exercise' ? 'edit' : 'play'} taille={19} />
            </span>
            <div className="wrap">
              <div className="eyebrow">Prochaine action</div>
              <b style={{ fontSize: 14.5 }}>{prochaine.title}</b>
              <div className="xs muted">
                {prochaine.kind === 'exercise'
                  ? 'Envoyez votre travail, votre coach le corrigera.'
                  : 'Reprenez là où vous vous êtes arrêté(e).'}
              </div>
            </div>
            <Link className="btn btn-primary" href={`/campus/formation/${active.formation.id}`}>
              Commencer <Icon nom="arrowR" taille={14} />
            </Link>
          </div>
        </div>
      )}

      <div className="cp-grid2">
        <div>
          {livres.length > 0 && (
            <section className="cp-sec">
              <div className="cp-sec-h">
                <span className="eyebrow">Reprendre ma lecture</span>
                <Link className="xs link" href={`/campus/ressources/livre/${livres[0].id}`}>
                  Ouvrir le lecteur →
                </Link>
              </div>
              <div className="rd-strip">
                <span className="bk-thumb">
                  <span className="bk-gen">{livres[0].title}</span>
                </span>
                <div className="wrap">
                  <b style={{ fontSize: 14.5 }}>{livres[0].title}</b>
                  <div className="xs muted">Votre lecteur reprend là où vous vous êtes arrêté(e).</div>
                </div>
                <Link className="btn" href={`/campus/ressources/livre/${livres[0].id}`}>
                  <Icon nom="book" taille={15} /> Continuer
                </Link>
              </div>
            </section>
          )}

          {notifications.length > 0 && (
            <section className="cp-sec">
              <div className="cp-sec-h">
                <span className="eyebrow">À retenir</span>
                <Link className="xs link" href="/campus/notifications">
                  Tout voir →
                </Link>
              </div>
              {notifications.map((notification) => (
                <div key={notification.id} className="nt-line">
                  <b>{notification.titre}</b>
                  <span className="xs muted">{notification.corps}</span>
                </div>
              ))}
            </section>
          )}

          {detail && detail.modules.length > 0 && (
            <section className="cp-sec">
              <div className="eyebrow mb8">Votre parcours</div>
              <div className="journey">
                {detail.modules.map((module, index) => {
                  const terminees = module.lessons.filter((lecon) => lecon.completed).length;
                  const fait = module.lessons.length > 0 && terminees === module.lessons.length;
                  const precedentFait =
                    index === 0 ||
                    (detail.modules[index - 1]?.lessons ?? []).every((lecon) => lecon.completed);
                  const enCours = !fait && precedentFait;
                  return (
                    <div key={module.id} className={`j-step ${fait ? 'done' : enCours ? 'cur' : 'lock'}`}>
                      <span className="j-dot">
                        {fait ? <Icon nom="check" taille={12} /> : enCours ? index + 1 : <Icon nom="lock" taille={11} />}
                      </span>
                      <span className="j-lb">{module.title}</span>
                    </div>
                  );
                })}
              </div>
              <div className="xs faint mt8">
                Les étapes verrouillées se débloquent automatiquement en validant les précédentes.
              </div>
            </section>
          )}
        </div>

        <div>
          <section className="cp-sec">
            <div className="cp-sec-h">
              <span className="eyebrow">En un coup d’œil</span>
            </div>
            <div className="cp-stats">
              <div>
                <b>{formations.length}</b>
                <span>Formation{formations.length > 1 ? 's' : ''}</span>
              </div>
              <div>
                <b>{certificats.filter((certificat) => certificat.status === 'active').length}</b>
                <span>Certificat{certificats.length > 1 ? 's' : ''}</span>
              </div>
              <div>
                <b>{livres.length + audios.length}</b>
                <span>Ressource{livres.length + audios.length > 1 ? 's' : ''}</span>
              </div>
            </div>
            <Link className="btn" style={{ width: '100%', marginTop: 14 }} href="/campus/certificats">
              <Icon nom="award" taille={15} /> Mes certificats
            </Link>
          </section>
        </div>
      </div>
    </>
  );
}
