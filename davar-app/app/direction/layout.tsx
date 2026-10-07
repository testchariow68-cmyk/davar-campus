import Link from 'next/link';
import { redirect } from 'next/navigation';
import { LogoutButton } from '@/components/LogoutButton';
import { NavDirection, type LienDirection } from '@/components/direction/NavDirection';
import { VueTestBar } from '@/components/campus/VueTestBar';
import { VueTestMenu } from '@/components/campus/VueTestMenu';
import { currentSession } from '@/lib/server/auth';
import { lireRoles, libellesDesRoles, rolesEnLigne, sectionsPour } from '@/lib/server/equipe';
import { listerComptesTest, peutTesterUneVue } from '@/lib/server/vue-test';

export const dynamic = 'force-dynamic';

/** Les libellés de la navigation, écrits une seule fois. */
const LIBELLES: Record<string, string> = {
  accueil: 'Vue d’ensemble',
  sante: 'Santé technique',
  assistants: 'Analyse des assistants',
  badges: 'Badges & distinctions',
  activite: 'Activité des étudiants',
  formations: 'Formations',
  ressources: 'Ressources',
  devoirs: 'Devoirs',
  etudiants: 'Étudiants',
  conversations: 'Conversations',
  avis: 'Avis',
  certificats: 'Certificats',
  ventes: 'Ventes',
  cycle: 'Cycle de vie',
  equipe: 'Équipe',
  assistant: 'Assistant virtuel',
  exports: 'Exports',
  emails: 'E-mails',
  integrations: 'Intégrations',
  reglages: 'Réglages',
  test: 'Vue test',
};
const CHEMINS: Record<string, string> = {
  accueil: '/direction',
  sante: '/direction/sante',
  assistants: '/direction/assistants',
  badges: '/direction/badges',
  activite: '/direction/activite',
  formations: '/direction/formations',
  ressources: '/direction/ressources',
  devoirs: '/direction/devoirs',
  etudiants: '/direction/etudiants',
  conversations: '/direction/conversations',
  avis: '/direction/avis',
  certificats: '/direction/certificats',
  ventes: '/direction/ventes',
  cycle: '/direction/cycle-de-vie',
  equipe: '/direction/equipe',
  assistant: '/direction/assistant',
  exports: '/direction/exports',
  emails: '/direction/emails',
  integrations: '/direction/integrations',
  reglages: '/direction/reglages',
  test: '/direction/test',
};
/** Ordre d'affichage, celui du prototype : pilotage, pédagogie, communauté, système. */
const ORDRE = [
  'accueil',
  'sante',
  'assistants',
  'badges',
  'activite',
  'formations',
  'ressources',
  'devoirs',
  'etudiants',
  'conversations',
  'avis',
  'certificats',
  'ventes',
  'cycle',
  'equipe',
  'assistant',
  'exports',
  'emails',
  'integrations',
  'reglages',
  'test',
];
const TOUT = [...ORDRE];

/**
 * L'Espace Direction est réservé au propriétaire et à son équipe.
 *
 * Le périmètre est calculé ICI, côté serveur, sur le compte AFFICHÉ : le
 * propriétaire voit tout, chaque membre du staff ne voit que ce que ses rôles
 * ouvrent — règle du prototype, « Chaque membre du staff voit uniquement ce dont
 * il a besoin. »
 *
 * Pendant une vue test, le compte affiché est le compte de test : la navigation
 * montre donc exactement les écrans de la personne dont on teste la vue. Les
 * PAGES, elles, continuent de vérifier les droits de la personne réelle — le
 * propriétaire « garde ses droits » pendant la visite, comme le prototype le
 * promet, et il revient par « Quitter » ou la touche Échap.
 */
export default async function DirectionLayout({ children }: { children: React.ReactNode }) {
  const session = await currentSession();
  if (!session) redirect('/connexion');
  const affiche = session.user;
  const estProprietaire = affiche.role === 'admin';
  const estMembre = affiche.role === 'staff';
  if (!estProprietaire && !estMembre && !session.vueTest) {
    return (
      <div className="container" style={{ paddingTop: 40, paddingBottom: 56, maxWidth: 720 }}>
        <div className="card card-pad">
          <h2 className="mb8">Espace réservé à l’équipe</h2>
          <p className="small muted mb16">
            Votre compte est bien connecté, mais la direction de la plateforme est réservée au propriétaire unique de
            DAVAR ACADÉMIE et aux membres qu’il a nommés. Si c’est votre cas et que ce message vous surprend, demandez
            la vérification de votre rôle.
          </p>
          <Link href="/campus" className="btn btn-primary">
            Revenir à mon campus
          </Link>
        </div>
      </div>
    );
  }

  const roles = estProprietaire ? [] : await lireRoles(session.db, affiche.id);
  const sections = estProprietaire ? TOUT : sectionsPour(roles);
  // Le propriétaire peut ouvrir une vue de test d'ici comme du campus ; la liste
  // des comptes de test ne lui est lue qu'à lui, et jamais pendant une visite.
  const vuesTest =
    !session.vueTest && peutTesterUneVue(session.reel)
      ? (await listerComptesTest(session.db)).map((compte) => ({ id: compte.id, libelle: compte.libelle }))
      : [];
  const liens: LienDirection[] = sections.map((section) => ({
    section,
    href: CHEMINS[section],
    libelle: LIBELLES[section],
  }));

  return (
    <>
      {session.vueTest && <VueTestBar nom={session.user.displayName} />}
      <div className="container" style={{ paddingTop: 24, paddingBottom: 56 }}>
        <header className="row between" style={{ flexWrap: 'wrap', gap: 12 }}>
          <div className="row" style={{ gap: 12 }}>
            <Link href="/direction" style={{ textDecoration: 'none' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo-structure.png" alt="Davar Académie" className="brand-img" />
            </Link>
            <span className="badge" style={{ background: 'var(--violet-soft)', color: 'var(--violet-deep)' }}>
              {estProprietaire ? 'Direction' : 'Équipe'}
            </span>
            {!estProprietaire && (
              <span className="small muted" title={rolesEnLigne(roles)}>
                {libellesDesRoles(roles).join(' · ') || 'aucun rôle attribué'}
              </span>
            )}
          </div>
          <nav className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            {vuesTest.length > 0 && <VueTestMenu vues={vuesTest} />}
            <span className="small muted">{session.reel.displayName}</span>
            <Link href="/campus" className="btn btn-ghost">
              Mon campus
            </Link>
            <LogoutButton />
          </nav>
        </header>

        <div className="mt16 mb16">
          <NavDirection liens={liens} />
        </div>

        <main>{children}</main>
      </div>
    </>
  );
}
