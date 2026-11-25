import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Emoji } from '@/components/campus/Emoji';
import { Icon, type NomIcone } from '@/components/campus/Icon';
import { currentSession } from '@/lib/server/auth';
import { formationActivePour, getTrainingForUser, listTrainingsApercu, listUserTrainings, progressionFormation } from '@/lib/server/campus';
import { certificatsDeEtudiant } from '@/lib/server/certificats';
import { listerNotifications } from '@/lib/server/notifications';
import { ressourcesDeEtudiant } from '@/lib/server/ressources';
import { salutation } from '@/lib/server/campus-recents';
import { badgesDeEtudiant } from '@/lib/server/recompenses';
import { lirePreferences } from '@/lib/server/profil';
import { urlLecture } from '@/lib/server/stockage';

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

function formatTempsAudio(secondes: number): string {
  const total = Math.max(0, Math.floor(secondes));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * TABLEAU DE BORD ÉTUDIANT — `vHome()` du prototype.
 *
 * Deux décisions restent séparées :
 *  - la salutation et sa progression suivent la formation active choisie ;
 *  - « Prochaine action » pointe toujours vers le prochain cours ouvrable de
 *    cette même formation. La reprise d'un livre/audio reste une carte séparée.
 */
export default async function CampusDashboard() {
  const session = await currentSession();
  if (!session) redirect('/connexion');
  const { db, user } = session;
  const maintenant = Date.now();

  const formations = session.vueTest ? await listTrainingsApercu(db) : await listUserTrainings(db, user.id);
  const prenom = user.displayName.split(' ')[0] || user.displayName;
  const preferences = session.vueTest ? null : await lirePreferences(db, user.id);

  const avecProgression = formations.map((formation) => ({
    formation,
    ...progressionFormation(formation),
  }));
  /** Repli historique pour les comptes qui n'ont pas encore choisi de formation. */
  const activeFormation = formationActivePour(formations, preferences?.formationActiveId);
  const active = activeFormation
    ? avecProgression.find(({ formation }) => formation.id === activeFormation.id) ?? null
    : null;

  const [notifications, ressources, certificats, distinctions] = await Promise.all([
    session.vueTest ? Promise.resolve([]) : listerNotifications(db, user.id, maintenant, 3),
    session.vueTest ? Promise.resolve([]) : ressourcesDeEtudiant(db, user.id),
    session.vueTest ? Promise.resolve([]) : certificatsDeEtudiant(db, user.id),
    session.vueTest ? Promise.resolve([]) : badgesDeEtudiant(db, user.id),
  ]);
  const distinction = (distinctions as unknown[]).length > 0 ? distinctions[0] : null;
  const estRecente = distinction ? maintenant - distinction.obtenuLeMs < 7 * 24 * 60 * 60 * 1000 : false;

  const detailActif = active && !session.vueTest ? await getTrainingForUser(db, user.id, active.formation.id) : null;
  /**
   * La prochaine action est toujours pédagogique : elle ne devient jamais un
   * livre ou un audio. Elle suit la formation active affichée au-dessus, afin
   * que « Continuer » et « J’y vais » ouvrent exactement le même cours et la
   * même page. Sans progression, le premier module réellement ouvrable fournit
   * naturellement le premier cours proposé à l'arrivée.
   */
  const formationDeLaProchaineAction = active;
  const detailProchaineAction = detailActif;
  const prochaineLeconModule =
    detailProchaineAction?.modules.find((module) => module.ouvrable && module.lessons.some((lecon) => !lecon.completed)) ?? null;
  const prochaineLecon = prochaineLeconModule?.lessons.find((lecon) => !lecon.completed) ?? null;
  const chapitreDeLaProchaineAction =
    detailProchaineAction?.chapitres.find((chapitre) => chapitre.modules.some((module) => module.id === prochaineLeconModule?.id)) ?? null;
  const prochaineActionHref =
    prochaineLecon && prochaineLeconModule && chapitreDeLaProchaineAction && formationDeLaProchaineAction
      ? `/campus/formation/${formationDeLaProchaineAction.formation.id}?chapitre=${encodeURIComponent(chapitreDeLaProchaineAction.id)}&module=${encodeURIComponent(prochaineLeconModule.id)}&cours=${encodeURIComponent(prochaineLecon.id)}`
      : null;

  /**
   * La reprise est une proposition séparée, réservée aux livres et audios
   * réellement commencés. Une ressource simplement publiée — ou seulement
   * ouverte sans geste de lecture — ne doit rien afficher sur le tableau de bord.
   */
  const derniereLectureAvecActivite = [...ressources]
    .map((ressource) => ({
      ressource,
      atMs:
        (ressource.kind === 'book' || ressource.kind === 'audio') &&
        ressource.positionLecture !== null &&
        ressource.positionLecture > 0
          ? ressource.positionLectureAtMs
          : null,
    }))
    .filter(({ atMs }) => atMs !== null)
    .sort((a, b) => (b.atMs ?? 0) - (a.atMs ?? 0))[0] ?? null;
  const derniereLecture = derniereLectureAvecActivite?.ressource ?? null;
  const couvertureReprise = derniereLecture?.coverKey ? await urlLecture(derniereLecture.coverKey, 600) : null;
  const descriptionProchaineAction = prochaineLecon?.kind === 'exercise'
    ? 'Envoyez votre travail, votre coach le corrigera.'
    : prochaineLecon?.kind === 'live'
      ? 'Accédez à cette séance depuis votre formation.'
      : prochaineLeconModule?.summary?.trim() || 'Ouvrez le prochain cours de votre parcours.';

  const dateLongue = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  const heure = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

  const phrase = active
    ? active.terminee
      ? 'Parcours terminé — demandez votre certificat !'
      : `Vous en êtes à ${active.pct} % de « ${active.formation.title} ». Votre prochaine étape est prête.`
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
            <Emoji value="👋" label="Salutation" className="greeting-wave emoji-unicode" />
          </h1>
          <p>{phrase}</p>
          {active ? (
            <Link
              className="btn btn-primary"
              href={active.terminee ? `/campus/formation/${active.formation.id}` : prochaineActionHref ?? `/campus/formation/${active.formation.id}`}
            >
              <Icon nom="play" taille={15} />{' '}
              {active.pct === 0 ? 'Commencer' : active.terminee ? 'Voir ma formation' : 'Continuer'}
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
            <div className="xs muted mt4">La progression affichée ici est celle de la formation sélectionnée.</div>
            <Link className="tasel-btn mt8" href="/campus/formations" aria-label="Choisir une autre formation active">
              <Icon nom="cap" taille={15} />
              <span className="wrap">{active.formation.title}</span>
              <Icon nom="chevR" taille={14} />
            </Link>
            <div className="mt8">
              <Progression pourcent={active.pct} />
            </div>
            <div className="row between mt8">
              <span className="xs muted">{active.pct} % accompli</span>
              <Link className="xs link" href="/campus/formations">Mes formations →</Link>
            </div>
          </div>
        )}
      </div>

      {prochaineLecon && formationDeLaProchaineAction && (
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
                flex: 'none',
              }}
            >
              <Icon nom={prochaineLecon.kind === 'exercise' ? 'edit' : 'play'} taille={19} />
            </span>
            <div className="wrap">
              <div className="eyebrow">Prochaine action · cours</div>
              <b style={{ fontSize: 14.5 }}>{prochaineLecon.title}</b>
              <div className="xs muted">{descriptionProchaineAction}</div>
            </div>
            <Link
              className="btn btn-primary btn-sm"
              href={prochaineActionHref ?? `/campus/formation/${formationDeLaProchaineAction.formation.id}`}
            >
              J’y vais <Icon nom="arrowR" taille={13} />
            </Link>
          </div>
        </div>
      )}

      {derniereLecture && (
        <section className="cp-resume">
          <div className="cp-sec-h">
            <div>
              <span className="eyebrow">Reprendre ma lecture</span>
              <p className="small muted mt4">Un raccourci vers votre dernière lecture commencée.</p>
            </div>
              <Link className="xs link" href="/campus/ressources">Bibliothèque →</Link>
          </div>
          <div className="cp-resume-line">
            {derniereLecture.kind === 'book' ? (
              <span className="cp-resume-cover bk-thumb" aria-hidden="true">
                {couvertureReprise ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={couvertureReprise} alt="" />
                ) : (
                  <span className="bk-gen">{derniereLecture.title}</span>
                )}
              </span>
            ) : (
              <span className="cp-resume-cover au-cover" aria-hidden="true">
                {couvertureReprise ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={couvertureReprise} alt="" />
                ) : null}
                <span className="au-next-icon"><Icon nom="headset" taille={18} /></span>
              </span>
            )}
            <div className="wrap">
              <b className="resume-title">{derniereLecture.title}</b>
              {derniereLecture.description ? <div className="xs muted resume-description">{derniereLecture.description}</div> : null}
              <div className="xs muted resume-position">
                {derniereLecture.kind === 'book'
                  ? `Livre · arrêté(e) à la page ${derniereLecture.positionLecture}.`
                  : `Audio · reprise à ${formatTempsAudio(derniereLecture.positionLecture ?? 0)}${derniereLecture.durationMin ? ` / ${derniereLecture.durationMin} min` : ''}.`}
              </div>
            </div>
            <Link
              className="btn btn-sm"
              href={
                derniereLecture.kind === 'audio'
                  ? `/campus/ressources/audio/${derniereLecture.id}`
                  : `/campus/ressources/livre/${derniereLecture.id}`
              }
            >
              {derniereLecture.kind === 'audio' ? 'Reprendre l’écoute' : 'Continuer la lecture'}
              <Icon nom="arrowR" taille={13} />
            </Link>
          </div>
        </section>
      )}

      {distinction && (
        <section className="cp-sec cp-distinction">
          <div className="cp-sec-h">
            <span className="eyebrow">Distinction{estRecente ? ' · nouvelle' : ''}</span>
            <Link className="xs link" href="/campus/distinctions">
              Mes distinctions →
            </Link>
          </div>
          <div className="row cp-distinction-line">
            <span className="cp-distinction-icon" aria-hidden="true">
              <Icon nom={distinction.icon as NomIcone} taille={28} />
            </span>
            <div className="wrap">
              <b style={{ fontSize: 14.5 }}>{distinction.name}</b>
              <div className="xs muted">
                {distinction.shortText ?? distinction.description ?? 'Une étape de votre parcours.'}
              </div>
            </div>
          </div>
        </section>
      )}

      <div className="cp-grid2">
        <div>
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

          {detailActif && detailActif.modules.length > 0 && (
            <section className="cp-sec">
              <div className="eyebrow mb8">Votre parcours</div>
              <div className="journey">
                {detailActif.modules.map((module, index) => {
                  const terminees = module.lessons.filter((lecon) => lecon.completed).length;
                  const fait = module.lessons.length > 0 && terminees === module.lessons.length;
                  const precedentFait =
                    index === 0 ||
                    (detailActif.modules[index - 1]?.lessons ?? []).every((lecon) => lecon.completed);
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
                aria-label={`Ouvrir votre bibliothèque (${ressources.length} élément${ressources.length > 1 ? 's' : ''})`}
              >
                <b>{ressources.length}</b>
                <span title="Livres, audios et fichiers multimédias attribués à votre compte">
                  Bibliothèque
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
