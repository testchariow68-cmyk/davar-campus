import Link from 'next/link';
import { redirect } from 'next/navigation';
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

/**
 * TABLEAU DE BORD ÉTUDIANT — `vHome()` du prototype.
 *
 * Deux décisions restent séparées :
 *  - la salutation et sa progression suivent la formation active choisie ;
 *  - « Prochaine action » suit le dernier geste réel, formation ou ressource.
 * La reprise d'un livre/audio n'est donc jamais rendue dans une seconde carte.
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
  const derniereFormation = [...avecProgression]
    .filter(({ formation }) => formation.derniereActiviteMs !== null)
    .sort((a, b) => (b.formation.derniereActiviteMs ?? 0) - (a.formation.derniereActiviteMs ?? 0))[0] ?? null;
  const derniereRessourceAvecActivite = [...ressources]
    .map((ressource) => ({
      ressource,
      atMs:
        ressource.kind === 'book' || ressource.kind === 'audio'
          ? ressource.positionLectureAtMs
          : ressource.fileKey
            ? ressource.activiteAtMs
            : null,
    }))
    .filter(({ atMs }) => atMs !== null)
    .sort((a, b) => (b.atMs ?? 0) - (a.atMs ?? 0))[0] ?? null;
  const derniereRessource = derniereRessourceAvecActivite?.ressource ?? null;
  const derniereRessourceAtMs = derniereRessourceAvecActivite?.atMs ?? null;

  // La comparaison des horodatages est la règle de priorité : une ouverture de
  // média postérieure à la leçon devient la prochaine action, même si la
  // formation active affichée dans la salutation est différente.
  const ressourceEstDerniere = Boolean(
    derniereRessource &&
      derniereRessourceAtMs !== null &&
      (!derniereFormation || derniereRessourceAtMs >= (derniereFormation.formation.derniereActiviteMs ?? 0))
  );
  const formationDeLaProchaineAction = ressourceEstDerniere ? null : derniereFormation ?? active;
  const detailProchaineAction =
    formationDeLaProchaineAction && !session.vueTest && formationDeLaProchaineAction.formation.id !== active?.formation.id
      ? await getTrainingForUser(db, user.id, formationDeLaProchaineAction.formation.id)
      : detailActif;
  const prochaineLeconModule =
    detailProchaineAction?.modules.find((module) => module.lessons.some((lecon) => !lecon.completed)) ?? null;
  const prochaineLecon = prochaineLeconModule?.lessons.find((lecon) => !lecon.completed) ?? null;
  const couvertureProchaine =
    ressourceEstDerniere && derniereRessource?.coverKey ? await urlLecture(derniereRessource.coverKey, 600) : null;
  const descriptionProchaineAction = ressourceEstDerniere && derniereRessource
    ? derniereRessource.description?.trim() ||
      (derniereRessource.kind === 'file'
        ? 'Ouvrez la ressource multimédia.'
        : derniereRessource.positionLecture && derniereRessource.positionLecture > 0
          ? 'Reprenez là où vous vous êtes arrêté(e).'
          : 'Commencez votre lecture.')
    : prochaineLecon?.kind === 'exercise'
      ? 'Envoyez votre travail, votre coach le corrigera.'
      : prochaineLecon?.kind === 'live'
        ? 'Accédez à cette séance depuis votre formation.'
        : prochaineLeconModule?.summary?.trim() || 'Reprenez là où vous vous êtes arrêté(e).';

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
            <span className="greeting-wave" role="img" aria-label="Salutation">
              <Icon nom="hand" taille={19} />
            </span>
          </h1>
          <p>{phrase}</p>
          {active ? (
            <Link className="btn btn-primary" href={`/campus/formation/${active.formation.id}`}>
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

      {((ressourceEstDerniere && derniereRessource) || (!ressourceEstDerniere && prochaineLecon && formationDeLaProchaineAction)) && (
        <div className="cp-next">
          <div className="row">
            {ressourceEstDerniere && derniereRessource ? (
              derniereRessource.kind === 'book' ? (
                <span className="next-action-cover bk-thumb" aria-hidden="true">
                  {couvertureProchaine ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={couvertureProchaine} alt="" />
                  ) : (
                    <span className="bk-gen">{derniereRessource.title}</span>
                  )}
                </span>
              ) : derniereRessource.kind === 'audio' ? (
                <span className="next-action-cover au-cover" aria-hidden="true">
                  {couvertureProchaine ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={couvertureProchaine} alt="" />
                  ) : null}
                  <span className="au-next-icon"><Icon nom="headset" taille={19} /></span>
                </span>
              ) : couvertureProchaine ? (
                <span className="next-action-cover resource-file-next" aria-hidden="true">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={couvertureProchaine} alt="" />
                </span>
              ) : (
                <span className="s-ico next-action-file" aria-hidden="true">
                  <Icon nom="doc" taille={19} />
                </span>
              )
            ) : (
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
                <Icon nom={prochaineLecon?.kind === 'exercise' ? 'edit' : 'play'} taille={19} />
              </span>
            )}
            <div className="wrap">
              <div className="eyebrow">Prochaine action</div>
              <b style={{ fontSize: 14.5 }}>
                {ressourceEstDerniere && derniereRessource ? derniereRessource.title : prochaineLecon?.title}
              </b>
              <div className="xs muted">{descriptionProchaineAction}</div>
            </div>
            {ressourceEstDerniere && derniereRessource ? (
              <Link
                className="btn btn-primary btn-sm"
                href={
                  derniereRessource.kind === 'audio'
                    ? `/campus/ressources/audio/${derniereRessource.id}`
                    : derniereRessource.kind === 'book'
                      ? `/campus/ressources/livre/${derniereRessource.id}`
                      : `/api/campus/ressource/${derniereRessource.id}`
                }
              >
                J’y vais <Icon nom="arrowR" taille={13} />
              </Link>
            ) : (
              <Link
                className="btn btn-primary btn-sm"
                href={`/campus/formation/${formationDeLaProchaineAction?.formation.id}`}
              >
                J’y vais <Icon nom="arrowR" taille={13} />
              </Link>
            )}
          </div>
        </div>
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
