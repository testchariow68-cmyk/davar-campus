import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Icon } from '@/components/campus/Icon';
import { ThemeButton } from '@/components/campus/ThemeButton';
import { UserMenu } from '@/components/campus/UserMenu';
import { BellMenu } from '@/components/campus/BellMenu';
import { VueTestBar } from '@/components/campus/VueTestBar';
import { VueTestMenu } from '@/components/campus/VueTestMenu';
import { currentSession } from '@/lib/server/auth';
import { listerComptesTest, peutTesterUneVue } from '@/lib/server/vue-test';
import { compterNonLues, listerNotifications } from '@/lib/server/notifications';

export const dynamic = 'force-dynamic';

/**
 * COQUILLE DU CAMPUS — reconstruction fidèle de `studentShell()` du prototype.
 *
 * Même structure que le prototype, au même endroit :
 *   barre supérieure (marque + navigation + thème + compte), puis la page.
 *
 * Ce qui n'est pas encore repris est VOLONTAIREMENT absent plutôt que simulé :
 * la cloche de notifications, le bandeau d'annonces, le ticker social, les
 * fenêtres de discussion et la bulle flottante du prototype dépendent de parties
 * du campus qui n'existent pas encore côté serveur. Ils seront ajoutés avec
 * elles, à l'identique — un bouton qui n'ouvre rien serait un mensonge.
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
  const [notifications, nonLues] = await Promise.all([
    listerNotifications(session.db, user.id, Date.now(), 20),
    compterNonLues(session.db, user.id, Date.now()),
  ]);

  const vuesTest =
    !vueTest && peutTesterUneVue(reel)
      ? (await listerComptesTest(session.db)).map((compte) => ({ id: compte.id, libelle: compte.libelle }))
      : [];

  return (
    <>
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
