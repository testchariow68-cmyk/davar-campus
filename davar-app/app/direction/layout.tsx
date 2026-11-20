import Link from 'next/link';
import { redirect } from 'next/navigation';
import { BellMenu } from '@/components/campus/BellMenu';
import { BandeauDefilant } from '@/components/campus/BandeauDefilant';
import { ThemeButton } from '@/components/campus/ThemeButton';
import { UserMenu } from '@/components/campus/UserMenu';
import { VueTestBar } from '@/components/campus/VueTestBar';
import { VueTestMenu } from '@/components/campus/VueTestMenu';
import { Icon, type NomIcone } from '@/components/campus/Icon';
import { SidebarDirection, type SidebarGroup, type SidebarItem } from '@/components/direction/SidebarDirection';
import { currentSession } from '@/lib/server/auth';
import { lireRoles, libellesDesRoles, sectionsPour } from '@/lib/server/equipe';
import { listerComptesTest, peutTesterUneVue } from '@/lib/server/vue-test';
import { compterNonLues, listerNotifications } from '@/lib/server/notifications';
import { vuePilotage } from '@/lib/server/direction';
import { plateformesNonSuivies } from '@/lib/server/social';

export const dynamic = 'force-dynamic';

type ItemDefinition = [string, string, string, NomIcone];
type GroupDefinition = [string, ItemDefinition[]];

/** L'ordre et les libellés du rail sont ceux de `adminShell()` du prototype. */
const GROUPES: GroupDefinition[] = [
  [
    'PILOTAGE',
    [
      ['accueil', 'Vue d’ensemble', '/direction', 'grid'],
      ['analytics', 'Analytics', '/direction/analytics', 'chart'],
      ['sante', 'Santé technique', '/direction/sante', 'wallet'],
      ['assistants', 'Analyse assistants virtuels', '/direction/assistants', 'sparkles'],
      ['badges', 'Badges & distinctions', '/direction/badges', 'rw_seal'],
      ['activite', 'Activité étudiants', '/direction/activite', 'users'],
    ],
  ],
  [
    'PÉDAGOGIE',
    [
      ['formations', 'Formations', '/direction/formations', 'book'],
      ['ressources', 'Ressources', '/direction/ressources', 'doc'],
      ['exercices', 'Exercices', '/direction/exercices', 'clipboard'],
      ['devoirs', 'Évaluations', '/direction/devoirs', 'target'],
    ],
  ],
  [
    'COMMUNAUTÉ',
    [
      ['etudiants', 'Étudiants', '/direction/etudiants', 'users'],
      ['conversations', 'Conversations', '/direction/conversations', 'message'],
      ['avis', 'Avis', '/direction/avis', 'star'],
    ],
  ],
  [
    'SYSTÈME',
    [
      ['certificats', 'Certifications', '/direction/certificats', 'award'],
      ['recompenses', 'Récompenses', '/direction/recompenses', 'rw_seal'],
      ['ventes', 'Ventes', '/direction/ventes', 'wallet'],
      ['exports', 'Exports', '/direction/exports', 'download'],
      ['cycle', 'Cycle de vie', '/direction/cycle-de-vie', 'clock'],
      ['assistant', 'Assistant virtuel', '/direction/assistant', 'sparkles'],
      ['emails', 'E-mails', '/direction/emails', 'mail'],
      ['activites', 'Activités', '/direction/activites', 'chart'],
      ['equipe', 'Équipe', '/direction/equipe', 'shield'],
      ['reglages', 'Configuration', '/direction/reglages', 'settings'],
    ],
  ],
];

function initiales(nom: string): string {
  return (
    nom
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((morceau) => morceau[0])
      .join('')
      .toUpperCase() || '?'
  );
}

function groupesPour(sections: string[], copies: number, questions: number): SidebarGroup[] {
  return GROUPES.map(([label, items]) => ({
    label,
    items: items
      .filter(([section]) => sections.includes(section))
      .map(([section, libelle, href, icone]): SidebarItem => ({
        section,
        libelle,
        href,
        icone,
        compteur: section === 'devoirs' ? copies : section === 'conversations' ? questions : undefined,
      })),
  })).filter((groupe) => groupe.items.length > 0);
}

/**
 * Coquille d'administration : le prototype est un rail fixe de 236 px, une
 * barre haute de 58 px et une zone de contenu élastique. La page enfant garde
 * ses données et ses droits côté serveur ; cette coquille ne fait que les
 * présenter au même endroit que le prototype.
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
  const sections = estProprietaire
    ? GROUPES.flatMap(([, items]) => items.map(([section]) => section))
    : sectionsPour(roles);
  const vue = await vuePilotage(session.db);
  const groupes = groupesPour(sections, vue.copiesEnAttente, vue.questionsCoach);

  const vuesTest =
    !session.vueTest && peutTesterUneVue(session.reel)
      ? (await listerComptesTest(session.db)).map((compte) => ({ id: compte.id, libelle: compte.libelle }))
      : [];
  const notifications = await listerNotifications(session.db, affiche.id, Date.now(), 20);
  const nonLues = await compterNonLues(session.db, affiche.id, Date.now());
  // Le prototype fait défiler les réseaux pour chaque membre de l'équipe,
  // mais jamais pour le Super Admin.
  const reseaux = estProprietaire ? [] : await plateformesNonSuivies(session.db, affiche.id);
  const roleLabel = estProprietaire ? 'Super Administrateur' : libellesDesRoles(roles).join(' · ') || 'Équipe';
  const couleur = estProprietaire ? 'var(--ava-sa)' : 'var(--violet2)';

  return (
    <>
      {session.vueTest && <VueTestBar nom={session.user.displayName} />}
      <div className={`admin-shell${!estProprietaire ? ' has-ticker' : ''}`}>
        <SidebarDirection
          groupes={groupes}
          nom={affiche.displayName}
          roleLabel={roleLabel}
          initiales={initiales(affiche.displayName)}
          couleur={couleur}
        />

        <div className="admin-main">
          <header className="admin-top">
            <h2>
              Vue d’ensemble
              <span
                className={`badge ${estProprietaire ? 'b-gold' : 'b-violet'}`}
                style={{ marginLeft: 8 }}
              >
                {estProprietaire ? 'Super Admin' : 'Équipe'}
              </span>
            </h2>
            <div className="tb-right">
              {vuesTest.length > 0 && <VueTestMenu vues={vuesTest} />}
              <ThemeButton />
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
              <UserMenu nom={affiche.displayName} email={affiche.email} variante="avatar" couleur={couleur} />
            </div>
          </header>

          <main className="admin-content">{children}</main>
          {!estProprietaire && <BandeauDefilant annonce={null} reseaux={reseaux} />}
        </div>

        <a
          className="fab-home"
          href="/direction"
          title="Accueil"
          aria-label="Accueil"
        >
          <Icon nom="home" taille={17} />
        </a>
      </div>
    </>
  );
}
