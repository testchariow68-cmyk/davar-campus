import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Icon } from '@/components/campus/Icon';
import { ThemeButton } from '@/components/campus/ThemeButton';
import { UserMenu } from '@/components/campus/UserMenu';
import { BandeauDefilant } from '@/components/campus/BandeauDefilant';
import { BellMenu } from '@/components/campus/BellMenu';
import { VueTestBar } from '@/components/campus/VueTestBar';
import { VueTestMenu } from '@/components/campus/VueTestMenu';
import { currentSession } from '@/lib/server/auth';
import { listerComptesTest, peutTesterUneVue } from '@/lib/server/vue-test';
import { compterNonLues, listerNotifications } from '@/lib/server/notifications';
import { lirePreferences } from '@/lib/server/profil';
import { EchelleAffichage } from '@/components/campus/EchelleAffichage';
import { lireReglages } from '@/lib/server/settings';
import { annonceDepuisReglages, annonceViseLUtilisateur, plateformesNonSuivies } from '@/lib/server/social';

export const dynamic = 'force-dynamic';

/**
 * COQUILLE DU CAMPUS — reconstruction fidèle de `studentShell()` du prototype.
 *
 * Même structure que le prototype, au même endroit :
 *   barre supérieure (marque + navigation + thème + compte), puis la page.
 *
 * Le bandeau du bas (annonces + réseaux) est celui du prototype : les
 * plateformes non suivies défilent, et elles disparaissent dès que l'étudiant
 * confirme son abonnement. Le propriétaire, lui, ne voit jamais le bandeau social.
 */
export default async function CampusLayout({ children }: { children: React.ReactNode }) {
  const session = await currentSession();
  if (!session) redirect('/connexion');
  const { user, reel, vueTest } = session;

  /**
   * Vue test : deux affichages, jamais confondus.
   *   - ouvert : le bandeau « Vue test : … » avec Quitter, et le bouton disparaît ;
   *   - fermé  : le bouton « Tester une vue », et pour le propriétaire SEULEMENT.
   * Aucun autre compte ne reçoit la liste des comptes de test : elle n'est même pas lue.
   */
  const [notifications, nonLues, reglages, preferences] = await Promise.all([
    listerNotifications(session.db, user.id, Date.now(), 20),
    compterNonLues(session.db, user.id, Date.now()),
    lireReglages(session.db),
    lirePreferences(session.db, user.id),
  ]);
  const annonceBrute = annonceDepuisReglages(reglages);
  const annonce = annonceViseLUtilisateur(annonceBrute, reel.role) ? annonceBrute : null;
  // Règle du prototype : le Super Admin ne voit jamais le bandeau social.
  const reseaux = reel.role === 'admin' ? [] : await plateformesNonSuivies(session.db, user.id);

  const vuesTest =
    !vueTest && peutTesterUneVue(reel)
      ? (await listerComptesTest(session.db)).map((compte) => ({ id: compte.id, libelle: compte.libelle }))
      : [];

  return (
    <>
      <EchelleAffichage echelle={preferences.echelle} />
      {vueTest && <VueTestBar nom={user.displayName} />}

      <header className="topbar">
        <div className="tb-inner">
          <Link className="brand" href="/campus">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="brand-img" src="/logo-structure.png" alt="Davar Académie" />
            <div className="brand-txt">
              DAVAR<span>Académie</span>
            </div>
          </Link>

          <nav className="tb-nav">
            <Link href="/campus">Tableau de bord</Link>
            <Link href="/campus/formations">Mes formations</Link>
            <Link href="/campus/questions">Mes questions</Link>
          </nav>

          <div className="tb-right">
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
            <ThemeButton />
            <VueTestMenu vues={vuesTest} />
            <UserMenu nom={user.displayName} email={user.email} estProprietaire={reel.role === 'admin'} />
          </div>
        </div>
      </header>

      <main className="container">{children}</main>

      <BandeauDefilant annonce={annonce} reseaux={reseaux} />

      <footer className="container" style={{ paddingBottom: 40 }}>
        <div className="row between small muted" style={{ gap: 10, flexWrap: 'wrap' }}>
          <span>
            <Icon nom="lock" taille={13} /> Espace privé — DAVAR ACADÉMIE
          </span>
          <Link href="/campus/aide" className="row" style={{ gap: 5 }}>
            <Icon nom="headset" taille={13} /> Besoin d&apos;aide ?
          </Link>
        </div>
      </footer>
    </>
  );
}
