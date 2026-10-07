import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ComptesTest } from '@/components/direction/ComptesTest';
import { sessionProprietaire } from '@/lib/server/direction-access';
import { listerEquipe, listerEtudiants, listerFormations, lireStructure } from '@/lib/server/direction';
import { ECRITURES_PAR_ROLE, LIBELLES_ROLES, ROLES, sectionsPour, type Ecriture, type RoleEquipe } from '@/lib/server/equipe';
import { COMPTES_TEST, listerComptesTest } from '@/lib/server/vue-test';

export const dynamic = 'force-dynamic';

/** Le libellé d'une section, tel qu'il apparaît dans la navigation de la Direction. */
const LIBELLES_SECTION: Record<string, string> = {
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
};

/**
 * VUE TEST — regarder le campus sans jamais toucher aux données d'une personne
 * réelle.
 *
 * Doctrine posée par le propriétaire le 6 octobre 2026 :
 *   • les comptes de démonstration sont supprimés (ils n'existent plus, ni en
 *     local, ni ailleurs) ;
 *   • ce qui reste pour regarder les écrans, ce sont des COMPTES DE TEST,
 *     marqués comme tels et exclus des chiffres réels ;
 *   • côté étudiant, la vue test se fait avec de VRAIES choses : les vraies
 *     formations, les vrais modules, les vraies leçons ;
 *   • côté équipe, chaque rôle a SA vue, remplie de ses seuls écrans — jamais les
 *     données d'un membre réel.
 *
 * Cette page tient les quatre : elle prépare les comptes, montre ce que chacun
 * ouvre, et rappelle qu'on revient par « Quitter » ou Échap, en gardant ses droits.
 */
export default async function VueTestPage() {
  const session = await sessionProprietaire();
  if (!session) redirect('/connexion');
  const { db } = session;

  const [comptes, etudiants, equipe, formations] = await Promise.all([
    listerComptesTest(db),
    listerEtudiants(db, '', 200, true),
    listerEquipe(db),
    listerFormations(db),
  ]);

  const membresReels = equipe.filter((membre) => membre.role !== 'admin').length;
  const comptesTestEquipe = comptes.filter((compte) => compte.role === 'staff').length;
  const structures = await Promise.all(
    formations.map(async (formation) => ({ formation, modules: await lireStructure(db, formation.id) }))
  );

  return (
    <div>
      <h1 className="mb8">Vue test</h1>
      <p className="small muted mb16">
        Regarder le campus sans jamais emprunter le compte d&apos;une personne réelle. Un compte de test est un compte
        ordinaire, marqué comme test : il ne compte dans aucun chiffre de la plateforme, et il ne peut pas se connecter.
      </p>

      <div className="banner info mb16">
        <span>
          <strong>Aucun compte de démonstration n&apos;existe</strong> : ils ont été supprimés du code comme de la base.
          Ce qui reste, ce sont les comptes de test ci-dessous — et eux seuls s&apos;ouvrent par « Tester une vue ».
          {membresReels > 0 && (
            <>
              {' '}
              Votre équipe compte {membresReels} membre{membresReels > 1 ? 's' : ''} réel
              {membresReels > 1 ? 's' : ''} : la vue test ne les ouvre <b>jamais</b>.
            </>
          )}
        </span>
      </div>

      <ComptesTest
        comptesInitiaux={comptes.map((compte) => ({
          id: compte.id,
          nom: compte.nom,
          courriel: compte.courriel,
          libelle: compte.libelle,
          role: compte.role,
          roles: compte.roles,
        }))}
        modeles={COMPTES_TEST.map((modele) => ({
          id: modele.id,
          nom: modele.nom,
          courriel: modele.courriel,
          role: modele.role,
          roles: modele.roles,
        }))}
      />

      <div className="card card-pad mt16">
        <h3 className="mb8">Ce que chaque vue d&apos;équipe ouvre</h3>
        <p className="small muted mb16">
          Règle du projet : « Chaque membre du staff voit uniquement ce dont il a besoin. » Ouvrir une vue d&apos;équipe
          vous montre exactement ces écrans-là — vous gardez vos droits pendant la visite, et vous revenez par « Quitter »
          ou la touche Échap.{' '}
          {comptesTestEquipe === 0 && 'Préparez les comptes de test pour les essayer.'}
        </p>
        <table className="dv-tbl">
          <thead>
            <tr>
              <th>Rôle</th>
              <th>Écrans ouverts</th>
            </tr>
          </thead>
          <tbody>
            {ROLES.map((role) => (
              <tr key={role}>
                <td>
                  <b>{LIBELLES_ROLES[role as RoleEquipe]}</b>
                </td>
                <td className="small muted">
                  {sectionsPour([role as RoleEquipe])
                    .filter((section) => section !== 'accueil')
                    .map((section) => LIBELLES_SECTION[section] ?? section)
                    .join(' · ') || '—'}
                  <div className="xs faint">
                    Écrit : {ecrituresDe(role as RoleEquipe)}
                  </div>
                </td>
              </tr>
            ))}
            <tr>
              <td>
                <b>Sans rôle</b>
              </td>
              <td className="small muted">Vue d&apos;ensemble seulement</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="card card-pad mt16">
        <h3 className="mb8">Côté étudiant — avec votre vrai contenu</h3>
        <p className="small muted mb16">
          Voici exactement ce qu&apos;un étudiant ayant accès découvrira, lu dans la base à l&apos;instant. Un aperçu en
          lecture seule : rien n&apos;est modifié, aucune progression n&apos;est écrite.
        </p>
        {structures.length === 0 && (
          <p className="small muted">
            Aucune formation pour l&apos;instant : c&apos;est normal, la plateforme attend votre contenu. Créez votre
            formation depuis l&apos;onglet <Link href="/direction/formations">Formations</Link>.
          </p>
        )}
        {structures.map(({ formation, modules }) => {
          const lecons = modules.reduce((total, module) => total + module.lecons.length, 0);
          return (
            <div key={formation.id} className="dv-item mb16">
              <div className="row between" style={{ gap: 10, flexWrap: 'wrap' }}>
                <strong>{formation.title}</strong>
                <span className={`dv-tag ${formation.published ? 'open' : 'closed'}`}>
                  {formation.published ? 'ouverte aux étudiants' : 'fermée — contenu en chantier'}
                </span>
              </div>
              <div className="small muted mt4">
                {modules.length} module{modules.length > 1 ? 's' : ''} · {lecons} leçon
                {lecons > 1 ? 's' : ''}
              </div>

              {lecons === 0 ? (
                <div className="banner warn mt8" role="status">
                  <span>
                    Aucune leçon : un étudiant verrait une page vide, c&apos;est pourquoi la formation ne peut pas être
                    ouverte.
                  </span>
                </div>
              ) : (
                <div className="mt8">
                  {modules.map((module) => (
                    <div key={module.id} style={{ marginBottom: 8 }}>
                      <div style={{ fontWeight: 600 }}>
                        Module {module.position} — {module.title}
                      </div>
                      {module.lecons.map((lecon) => (
                        <div key={lecon.id} className="small muted" style={{ paddingLeft: 14 }}>
                          {lecon.position}. {lecon.title}
                          {lecon.durationMin ? ` · ${lecon.durationMin} min` : ''}
                          {lecon.resourceUrl ? '' : ' · Ressource pas encore publiée'}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Ce qu'un rôle peut écrire, en clair — lu dans la même table que le serveur. */
const LIBELLES_ECRITURE: Record<Ecriture, string> = {
  'repondre-conversation': 'répondre aux questions',
  'valider-conversation': 'valider les réponses de l’assistant',
  'decider-devoir': 'corriger les devoirs',
};

function ecrituresDe(role: RoleEquipe): string {
  const ecritures = ECRITURES_PAR_ROLE[role].map((ecriture) => LIBELLES_ECRITURE[ecriture]);
  return ecritures.length ? ecritures.join(' · ') : 'lecture seule';
}
