import { redirect } from 'next/navigation';
import { RailCampus } from '@/components/campus/RailCampus';
import { FilAriane } from '@/components/campus/FilAriane';
import { BoutonAccueil } from '@/components/campus/BoutonAccueil';
import { ThemeButton } from '@/components/campus/ThemeButton';
import { UserMenu } from '@/components/campus/UserMenu';
import { MenuCampus } from '@/components/campus/MenuCampus';
import { BandeauDefilant } from '@/components/campus/BandeauDefilant';
import { BellMenu } from '@/components/campus/BellMenu';
import { VueTestBar } from '@/components/campus/VueTestBar';
import { currentSession } from '@/lib/server/auth';
import { listTrainingsApercu, listUserTrainings } from '@/lib/server/campus';
import { passageEtudiant } from '@/lib/server/assiduite';
import { compterNonLues, listerNotifications } from '@/lib/server/notifications';
import { lirePreferences } from '@/lib/server/profil';
import { EchelleAffichage } from '@/components/campus/EchelleAffichage';
import { SupportFab } from '@/components/campus/SupportFab';
import { lireReglages } from '@/lib/server/settings';
import { annonceDepuisReglages, annonceViseLUtilisateur, plateformesNonSuivies } from '@/lib/server/social';

export const dynamic = 'force-dynamic';

/**
 * COQUILLE DU CAMPUS — reconstruction fidèle de `studentShell()` du prototype.
 *
 * La structure est celle du prototype, au même endroit : le rail de gauche
 * (`aside.rail`), puis la colonne principale avec son bandeau supérieur, le
 * fil d'Ariane, la page, et le bandeau défilant en bas.
 *
 * Deux blocs volontairement ABSENTS, parce que le prototype ne les met pas
 * dans la coquille de l'étudiant : le bouton « Tester une vue » (il est dans
 * l'Espace Direction, où `viewAsBtnHTML()` l'affiche) et un pied de page
 * (la coquille du prototype n'en a aucun).
 */
export default async function CampusLayout({ children }: { children: React.ReactNode }) {
  const session = await currentSession();
  if (!session) redirect('/connexion');
  const { user, reel, vueTest } = session;

  /**
   * Vue test : pendant la visite, le bandeau « Vue test : … » avec Quitter.
   * Le bouton pour ENTRER dans une vue, lui, est dans l'Espace Direction —
   * la coquille de l'étudiant du prototype ne le porte pas.
   */
  // Le passage d'assiduité : ce que le prototype faisait à chaque connexion.
  // Il ne concerne QUE les étudiants réels — jamais le staff, jamais une vue test,
  // jamais un compte de test. Il regarde une personne, pas tout le monde.
  if (reel.role === 'student' && !vueTest) await passageEtudiant(session.db, user.id).catch(() => null);

  const [notifications, nonLues, reglages, preferences] = await Promise.all([
    listerNotifications(session.db, user.id, Date.now(), 20),
    compterNonLues(session.db, user.id, Date.now()),
    lireReglages(session.db),
    lirePreferences(session.db, user.id),
  ]);
  // Le menu du campus annonce la formation en cours, comme le prototype.
  const formations = session.vueTest
    ? await listTrainingsApercu(session.db)
    : await listUserTrainings(session.db, user.id);
  const active = formations[0] ?? null;
  const pourcentActive =
    active && active.lessonCount > 0
      ? Math.round((active.completedCount / active.lessonCount) * 100)
      : 0;

  const annonceBrute = annonceDepuisReglages(reglages);
  const annonce = annonceViseLUtilisateur(annonceBrute, reel.role) ? annonceBrute : null;
  // Règle du prototype : le Super Admin ne voit jamais le bandeau social.
  const reseaux = reel.role === 'admin' ? [] : await plateformesNonSuivies(session.db, user.id);

  const initiale = (user.displayName.trim()[0] ?? '?').toUpperCase();

  return (
    <>
      <EchelleAffichage echelle={preferences.echelle} />

      <div className="cp-app">
        <RailCampus
          nom={user.displayName}
          email={user.email}
          formation={active?.title ?? null}
          pourcent={pourcentActive}
          initiale={initiale}
        />

        <div className="cp-main">
          {vueTest && <VueTestBar nom={user.displayName} />}

          <header className="cp-top">
            <div className="row" style={{ gap: 8, minWidth: 0 }}>
              <FilAriane formations={formations.map((formation) => ({ id: formation.id, title: formation.title }))} />
            </div>
            <div className="row" style={{ gap: 6 }}>
              <MenuCampus
                nom={user.displayName}
                email={user.email}
                formation={active?.title ?? null}
                pourcent={pourcentActive}
                initiale={initiale}
                variante="mobile"
              />
              <div style={{ position: 'relative' }}>
                <BellMenu
                  initiales={notifications.map((notification) => ({
                    id: notification.id,
                    kind: notification.kind,
                    titre: notification.titre,
                    corps: notification.corps,
                    route: notification.route,
                    atMs: notification.atMs,
                    lue: notification.lue,
                  }))}
                  nonLuesInitiales={nonLues}
                />
              </div>
              <ThemeButton variante="mobile" />
              <UserMenu nom={user.displayName} email={user.email} variante="avatar" />
            </div>
          </header>

          <main className="cp-content" id="cpPage">
            {children}
          </main>

          <BandeauDefilant annonce={annonce} reseaux={reseaux} />
        </div>

        {/* Le bouton d'accueil flottant : un tap revient en arrière, deux taps
            ramènent à l'accueil, et on le glisse où l'on veut. */}
        <BoutonAccueil />

        {/* Le bouton d'aide flottant, comme le panneau d'aide du prototype : il
            est present sur TOUS les ecrans du campus, pas sur une page a part. */}
        <SupportFab
          whatsapp={reglages['support.whatsapp']}
          telephone={reglages['support.phone']}
          courriel={reglages['support.email']}
        />
      </div>
    </>
  );
}
