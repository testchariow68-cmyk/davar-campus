import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { Icon } from '@/components/campus/Icon';
import { sessionSection } from '@/lib/server/direction-access';
import { vuePilotage, type Tache } from '@/lib/server/direction';
import { listerFormations } from '@/lib/server/direction';
import { libellesDesRoles, lireRoles } from '@/lib/server/equipe';

export const dynamic = 'force-dynamic';

type NomIcone =
  | 'users'
  | 'book'
  | 'wallet'
  | 'alert'
  | 'message'
  | 'upload'
  | 'award'
  | 'sparkles'
  | 'chart'
  | 'layers'
  | 'clipboard'
  | 'checkCircle'
  | 'target'
  | 'star'
  | 'rw_seal';

const GENRES: Record<Tache['genre'], { icone: NomIcone; badge: string; classe: string; fond: string }> = {
  corriger: { icone: 'upload', badge: 'En attente', classe: 'b-amber', fond: 's-gold' },
  certificat: { icone: 'award', badge: 'Certificat', classe: 'b-gold', fond: 's-gold' },
  coach: { icone: 'message', badge: '48 h', classe: 'b-amber', fond: 's-gold' },
  ia: { icone: 'sparkles', badge: 'IA', classe: 'b-violet', fond: 's-cur' },
  brouillon: { icone: 'book', badge: 'Brouillon', classe: 'b-grey', fond: 's-cur' },
};

type Indicateur = { titre: string; valeur: string; icone: NomIcone; sous?: ReactNode };

function argent(valeur: number): string {
  return `${valeur.toLocaleString('fr-FR')} FCFA`;
}

function ilYa(atMs: number): string {
  const minutes = Math.max(0, Math.round((Date.now() - atMs) / 60000));
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const heures = Math.round(minutes / 60);
  if (heures < 24) return `il y a ${heures} h`;
  const jours = Math.round(heures / 24);
  return jours === 1 ? 'hier' : `il y a ${jours} jours`;
}

function salutation(): string {
  const heure = new Date().getHours();
  if (heure < 5) return 'Bonne nuit';
  if (heure < 12) return 'Bonjour';
  if (heure < 18) return 'Bon après-midi';
  return 'Bonsoir';
}

/**
 * VUE D'ENSEMBLE — `aOverviewPilotage()` pour le propriétaire et le manager,
 * `aOverviewStaff()` pour tous les autres. Chaque rôle apporte SES chiffres et
 * SES tâches, dans l'ordre du prototype ; aucun indicateur n'est inventé.
 */
export default async function DirectionPage() {
  const session = await sessionSection('accueil');
  if (!session) redirect('/connexion');
  const { db } = session;

  // Le compte AFFICHÉ commande la vue ; les droits, eux, restent ceux de la
  // personne réelle (une visite test ne retire jamais ses droits au propriétaire).
  const affiche = session.user;
  const estProprietaire = affiche.role === 'admin';

  const vue = await vuePilotage(db);
  const roles = estProprietaire ? [] : await lireRoles(db, affiche.id);
  const prenom = affiche.displayName.split(' ')[0] || affiche.displayName;
  const pilote = estProprietaire || roles.includes('manager');

  const aCorriger = vue.aTraiter.filter((tache) => tache.genre === 'corriger');
  const aSuperviser = vue.aTraiter.filter((tache) => tache.genre === 'ia');
  const enAttenteDeReponse = vue.aTraiter.filter((tache) => tache.genre === 'coach');

  // Les chiffres de chacun, dans l'ordre du prototype : coach, correcteur,
  // assistant, contenu, support, analyste.
  const indicateurs: Indicateur[] = [];
  const taches: Tache[] = [];

  if (pilote) {
    indicateurs.push(
      {
        titre: 'Étudiants',
        valeur: String(vue.etudiants),
        icone: 'users',
        sous: <span className="xs muted">+{vue.etudiantsCeMois} ce mois-ci</span>,
      },
      {
        titre: 'Formations publiées',
        valeur: `${vue.formationsPubliees} / ${vue.formations}`,
        icone: 'book',
      },
      { titre: 'Ventes (30 j)', valeur: argent(vue.ventesTrenteJours), icone: 'wallet' },
      {
        titre: 'Tâches en attente',
        valeur: String(vue.aTraiter.length),
        icone: 'alert',
        sous:
          vue.aTraiter.length > 0 ? (
            <span className="badge b-red">À traiter</span>
          ) : (
            <span className="badge b-green">À jour</span>
          ),
      }
    );
    // Le prototype regroupe par nature : les copies, puis les certificats,
    // puis les questions, puis la supervision de l'assistant.
    const ordre: Tache['genre'][] = ['corriger', 'certificat', 'coach', 'ia'];
    for (const genre of ordre)
      taches.push(...vue.aTraiter.filter((tache) => tache.genre === genre));
  } else {
    if (roles.includes('coach')) {
      indicateurs.push(
        { titre: 'Étudiants suivis', valeur: String(vue.etudiants), icone: 'users' },
        {
          titre: 'Questions pour moi',
          valeur: String(vue.questionsCoach),
          icone: 'message',
          sous:
            vue.questionsCoach > 0 ? (
              <span className="badge b-red">À répondre</span>
            ) : (
              <span className="badge b-green">À jour</span>
            ),
        }
      );
      taches.push(...enAttenteDeReponse);
    }
    if (roles.includes('correcteur')) {
      indicateurs.push(
        {
          titre: 'Copies à corriger',
          valeur: String(vue.copiesEnAttente),
          icone: 'clipboard',
          sous:
            vue.copiesEnAttente > 0 ? (
              <span className="badge b-red">À traiter</span>
            ) : (
              <span className="badge b-green">À jour</span>
            ),
        },
        { titre: 'Copies corrigées', valeur: String(vue.copiesCorrigees), icone: 'checkCircle' }
      );
      taches.push(...aCorriger);
    }
    if (roles.includes('assistant')) {
      indicateurs.push(
        {
          titre: 'Étudiants',
          valeur: String(vue.etudiants),
          icone: 'users',
          sous: <span className="xs muted">+{vue.etudiantsCeMois} ce mois-ci</span>,
        },
        { titre: 'Travaux en attente', valeur: String(vue.copiesEnAttente), icone: 'alert' }
      );
      if (!roles.includes('correcteur')) taches.push(...aCorriger);
    }
    if (roles.includes('contenu')) {
      const formations = await listerFormations(db);
      const chapitres = formations.reduce((total, formation) => total + formation.modules, 0);
      indicateurs.push(
        {
          titre: 'Formations publiées',
          valeur: `${vue.formationsPubliees} / ${vue.formations}`,
          icone: 'book',
        },
        { titre: 'Chapitres', valeur: String(chapitres), icone: 'layers' }
      );
      taches.push(...vue.brouillons);
    }
    if (roles.includes('support')) {
      indicateurs.push(
        {
          titre: 'Conversations ouvertes',
          valeur: String(vue.conversationsOuvertes),
          icone: 'message',
          sous:
            vue.sansReponse > 0 ? (
              <span className="badge b-red">{vue.sansReponse} sans réponse</span>
            ) : (
              <span className="badge b-green">À jour</span>
            ),
        },
        { titre: 'Résolues', valeur: String(vue.conversationsResolues), icone: 'checkCircle' }
      );
      taches.push(...vue.aTraiter.filter((tache) => tache.genre === 'coach' || tache.genre === 'ia').slice(0, 6));
    }
    if (roles.includes('analyste')) {
      indicateurs.push(
        {
          titre: 'Étudiants',
          valeur: String(vue.etudiants),
          icone: 'users',
          sous: <span className="xs muted">+{vue.etudiantsCeMois} ce mois-ci</span>,
        },
        { titre: 'Taux de complétion', valeur: `${vue.tauxCompletion} %`, icone: 'target' },
        { titre: 'Badges émis', valeur: String(vue.badgesEmis), icone: 'rw_seal' },
        { titre: 'Passerelles suivies', valeur: `${vue.passerelles} / 3`, icone: 'wallet' },
        { titre: 'Note moyenne', valeur: `⭐ ${vue.noteMoyenne}`, icone: 'star' }
      );
    }
  }

  const sousTitre = pilote
    ? `${estProprietaire ? 'Super Administrateur' : 'Manager'} — pilotage complet de la plateforme.`
    : `${libellesDesRoles(roles).join(' · ') || 'Équipe'} — votre espace de travail complet.`;

  // Le staff ne voit jamais les ventes ni les paiements, même dans l'activité.
  const activite = pilote ? vue.activite : vue.activite.filter((ligne) => ligne.genre !== 'vente');

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 style={{ fontSize: 19 }}>
            {salutation()} {prenom} 👋
          </h1>
          <p>{sousTitre}</p>
        </div>
      </div>

      {indicateurs.length === 0 ? (
        <div className="card card-pad empty small">Aucun indicateur pour ce rôle.</div>
      ) : (
        <>
          <div className="grid g4">
            {indicateurs.slice(0, 4).map((indicateur) => (
              <div key={indicateur.titre} className="card stat">
                <div className="s-top">
                  <span className="s-lbl">{indicateur.titre}</span>
                  <span className="s-ico">
                    <Icon nom={indicateur.icone} taille={17} />
                  </span>
                </div>
                <div className="s-val">{indicateur.valeur}</div>
                {indicateur.sous}
              </div>
            ))}
          </div>
          {indicateurs.length > 4 && (
            <div className="grid g4 mt16">
              {indicateurs.slice(4).map((indicateur) => (
                <div key={indicateur.titre} className="card stat">
                  <div className="s-top">
                    <span className="s-lbl">{indicateur.titre}</span>
                    <span className="s-ico">
                      <Icon nom={indicateur.icone} taille={17} />
                    </span>
                  </div>
                  <div className="s-val">{indicateur.valeur}</div>
                  {indicateur.sous}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {pilote && vue.aTraiter.length > 0 && (
        <div className="banner warn mt16">
          <Icon nom="alert" taille={15} />
          <span>
            <b>
              {vue.aTraiter.length} action{vue.aTraiter.length > 1 ? 's' : ''} attendent votre équipe :
            </b>{' '}
            {aCorriger.length} soumission(s) à corriger, {vue.certificatsEnAttente} demande(s) de certificat,{' '}
            {enAttenteDeReponse.length} question(s) au coach, {aSuperviser.length} réponse(s) de l’IA à superviser.
          </span>
        </div>
      )}

      <div className="grid mt16" style={{ gridTemplateColumns: '1.5fr 1fr', alignItems: 'start' }}>
        <div className="card">
          <div className="card-head">
            <h3>{pilote ? 'À traiter maintenant' : 'Ma file de travail'}</h3>
          </div>
          {taches.map((tache) => {
            const genre = GENRES[tache.genre];
            return (
              <Link key={`${tache.genre}-${tache.lien}-${tache.titre}`} href={tache.lien} className="res-item">
                <span className={`step-ico ${genre.fond}`}>
                  <Icon nom={genre.icone} taille={14} />
                </span>
                <div className="wrap">
                  <b style={{ fontSize: 13 }}>{tache.titre}</b>
                  <div className="xs faint">{tache.sousTitre}</div>
                </div>
                <span className={`badge ${genre.classe}`}>{genre.badge}</span>
              </Link>
            );
          })}
          {!pilote && roles.includes('analyste') && (
            <Link href="/direction/analytics" className="res-item">
              <span className="step-ico s-cur">
                <Icon nom="chart" taille={14} />
              </span>
              <div className="wrap">
                <b style={{ fontSize: 13 }}>Ouvrir les analytics complets</b>
                <div className="xs faint">Tendances, cohortes et progression détaillée</div>
              </div>
              <span className="badge b-grey">Analytics</span>
            </Link>
          )}
          {taches.length === 0 && !(roles.includes('analyste') && !pilote) && (
            <div className="empty small">{pilote ? 'Tout est traité ✨' : 'Aucune tâche en attente ✨'}</div>
          )}
        </div>

        <div className="card">
          <div className="card-head">
            <h3>Activité récente</h3>
          </div>
          {activite.length === 0 ? (
            <div className="empty small">Aucune activité.</div>
          ) : (
            activite.map((ligne, index) => (
              <div key={`${ligne.genre}-${ligne.atMs}-${index}`} className="res-item">
                <span className="step-ico s-cur">
                  <Icon
                    nom={
                      ligne.genre === 'vente'
                        ? 'wallet'
                        : ligne.genre === 'soumission'
                          ? 'upload'
                          : ligne.genre === 'certificat'
                            ? 'award'
                            : 'message'
                    }
                    taille={13}
                  />
                </span>
                <div className="wrap">
                  <span className="small">{ligne.texte}</span>
                  <div className="xs faint mt4">{ilYa(ligne.atMs)}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
