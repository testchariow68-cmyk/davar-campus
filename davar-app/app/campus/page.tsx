import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Icon, type NomIcone } from '@/components/campus/Icon';
import { currentSession } from '@/lib/server/auth';
import { getTrainingForUser, listTrainingsApercu, listUserTrainings, progressionFormation } from '@/lib/server/campus';
import { certificatsDeEtudiant } from '@/lib/server/certificats';
import { listerNotifications } from '@/lib/server/notifications';
import { ressourcesDeEtudiant } from '@/lib/server/ressources';
import { salutation } from '@/lib/server/campus-recents';
import { badgesDeEtudiant } from '@/lib/server/recompenses';

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
    ...progressionFormation(formation),
  }));
  /**
   * Reprise de formation : on privilégie le parcours commencé qui a reçu la
   * dernière activité, puis la dernière formation suivie. À défaut, le premier
   * accès non commencé est un bon point de départ ; si tout est terminé, le
   * dernier accès acquis reste consultable.
   */
  const commencéesNonTerminees = [...avecProgression]
    .filter(({ pct, terminee }) => pct > 0 && !terminee)
    .sort((a, b) => (b.formation.derniereActiviteMs ?? 0) - (a.formation.derniereActiviteMs ?? 0));
  const derniereSuivie = [...avecProgression]
    .filter(({ formation, terminee }) => formation.derniereActiviteMs !== null && !terminee)
    .sort((a, b) => (b.formation.derniereActiviteMs ?? 0) - (a.formation.derniereActiviteMs ?? 0))[0];
  const active =
    commencéesNonTerminees[0] ??
    derniereSuivie ??
    avecProgression.find(({ terminee }) => !terminee) ??
    [...avecProgression].sort((a, b) => b.formation.acquiseLeMs - a.formation.acquiseLeMs)[0] ??
    null;
  // Dès qu'un parcours est entamé, le héros et son CTA suffisent : la carte
  // « Formation active » ne doit pas répéter la même progression en permanence.
  const aucunParcoursCommence = avecProgression.every(({ pct }) => pct === 0);

  const [notifications, ressources, certificats, distinctions] = await Promise.all([
    session.vueTest ? Promise.resolve([]) : listerNotifications(db, user.id, maintenant, 3),
    session.vueTest ? Promise.resolve([]) : ressourcesDeEtudiant(db, user.id),
    session.vueTest ? Promise.resolve([]) : certificatsDeEtudiant(db, user.id),
    session.vueTest ? Promise.resolve([]) : badgesDeEtudiant(db, user.id),
  ]);
  // La distinction la plus récente est celle que la notification montre : en
  // cliquant, l'étudiant tombe sur le même endroit que depuis l'application.
  const distinction = (distinctions as unknown[]).length > 0 ? distinctions[0] : null;
  const estRecente = distinction ? maintenant - distinction.obtenuLeMs < 7 * 24 * 60 * 60 * 1000 : false;

  const detail = active && !session.vueTest ? await getTrainingForUser(db, user.id, active.formation.id) : null;
  const prochaine = detail?.modules.flatMap((module) => module.lessons).find((lecon) => !lecon.completed) ?? null;

  const livres = ressources.filter((ressource) => ressource.kind === 'book');
  const audios = ressources.filter((ressource) => ressource.kind === 'audio');
  const derniereRessource = [...ressources]
    .filter(
      (ressource) =>
        (ressource.kind === 'book' || ressource.kind === 'audio') && ressource.positionLectureAtMs !== null
    )
    .sort((a, b) => (b.positionLectureAtMs ?? 0) - (a.positionLectureAtMs ?? 0))[0] ?? null;
  const minuteAudio = (secondes: number) => {
    const total = Math.max(0, Math.floor(secondes));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
  };
  const dateLongue = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  const heure = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

  const phrase = active
    ? active.terminee
      ? 'Parcours terminé — demandez votre certificat !'
      : `Vous en êtes à ${active.pct} % de « ${active.formation.title} ». ${
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
            {salutation()}, {prenom}{' '}
            <span className="greeting-wave" role="img" aria-label="Salutation">
              <Icon nom="hand" taille={19} />
            </span>
          </h1>
          <p>{phrase}</p>
          {active ? (
            <Link className="btn btn-primary" href={`/campus/formation/${active.formation.id}`}>
              <Icon nom="play" taille={15} />{' '}
              {active.pct === 0
                ? 'Commencer'
                : active.terminee
                  ? 'Voir ma formation'
                  : 'Continuer ma formation'}
            </Link>
          ) : (
            <Link className="btn btn-primary" href="/campus/catalogue">
              <Icon nom="search" taille={15} /> Découvrir les formations
            </Link>
          )}
        </div>
        {active && aucunParcoursCommence && !active.terminee && (
          <div className="cp-active">
            <div className="eyebrow">Formation active</div>
            <div className="xs muted mt4">Choisissez le parcours à commencer depuis vos formations acquises.</div>
            <Link className="tasel-btn mt8" href="/campus/formations">
              <Icon nom="cap" taille={15} />
              <span className="wrap">{active.formation.title}</span>
              <Icon nom="chevR" taille={14} />
            </Link>
            <div className="xs faint mt8">0 % accompli · voir et choisir une autre formation →</div>
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
            <Link className="btn btn-primary btn-sm" href={`/campus/formation/${active.formation.id}`}>
              J’y vais <Icon nom="arrowR" taille={13} />
            </Link>
          </div>
        </div>
      )}

      {distinction && (
        <div className="cp-next">
          <div className="row">
            {/* L'icône du badge, SANS fond : telle qu'elle est dans la plateforme. */}
            <span
              style={{
                width: 42,
                height: 42,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--gold)',
                flex: 'none',
              }}
            >
              <Icon nom={distinction.icon as NomIcone} taille={34} />
            </span>
            <div className="wrap">
              <div className="eyebrow">Distinction{estRecente ? ' · nouvelle' : ''}</div>
              <b style={{ fontSize: 14.5 }}>{distinction.name}</b>
              <div className="xs muted">
                {distinction.shortText ?? distinction.description ?? 'Une étape de votre parcours.'}
              </div>
            </div>
            <Link className="btn" href="/campus/distinctions">
              Mes distinctions <Icon nom="arrowR" taille={14} />
            </Link>
          </div>
        </div>
      )}

      <div className="cp-grid2">
        <div>
          {derniereRessource && (
            <section className="cp-sec">
              <div className="cp-sec-h">
                <span className="eyebrow">
                  Reprendre ma lecture{' '}
                  <span className="cp-kind">{derniereRessource.kind === 'audio' ? 'Audio' : 'Livre'}</span>
                </span>
                <Link className="xs link" href="/campus/ressources">
                  Ouvrir le lecteur →
                </Link>
              </div>
              <div className="rd-strip">
                {derniereRessource.kind === 'audio' ? (
                  <span className="au-cover" aria-hidden="true">
                    <Icon nom="headset" taille={20} />
                  </span>
                ) : (
                  <span className="bk-thumb">
                    <span className="bk-gen">{derniereRessource.title}</span>
                  </span>
                )}
                <div className="wrap">
                  <b style={{ fontSize: 14.5 }}>{derniereRessource.title}</b>
                  <div className="xs muted">
                    {derniereRessource.kind === 'audio'
                      ? `Audio · vous vous êtes arrêté(e) à ${minuteAudio(derniereRessource.positionLecture ?? 0)}.`
                      : `Livre · vous vous êtes arrêté(e) à la page ${derniereRessource.positionLecture ?? 1}.`}
                  </div>
                </div>
                <Link
                  className="btn"
                  href={`/campus/ressources/${derniereRessource.kind === 'audio' ? 'audio' : 'livre'}/${derniereRessource.id}`}
                  aria-label={`${derniereRessource.kind === 'audio' ? 'Reprendre l’écoute' : 'Continuer la lecture'} de ${derniereRessource.title}`}
                >
                  <Icon nom={derniereRessource.kind === 'audio' ? 'headset' : 'book'} taille={15} />{' '}
                  {derniereRessource.kind === 'audio' ? 'Reprendre l’écoute' : 'Continuer la lecture'}
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
              <Link
                className="cp-stat-link"
                href="/campus/ressources"
                aria-label={`Ouvrir vos ${ressources.length} ressources`}
              >
                <b>{ressources.length}</b>
                <span title="Livres, audios et ressources multimédias attribués à votre compte">
                  Ressource{ressources.length > 1 ? 's' : ''}
                </span>
                <small>livres + audios + multimédia</small>
              </Link>
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
