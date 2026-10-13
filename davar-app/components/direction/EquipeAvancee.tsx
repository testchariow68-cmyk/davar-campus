'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { messageDe, poster, type Reponse } from './api';

/** Les sept rôles du prototype — mêmes libellés que dans ÉquipeOutils. */
const ROLES_EQUIPE: Array<{ id: string; libelle: string; ouvre: string }> = [
  { id: 'coach', libelle: 'Coach', ouvre: 'Étudiants, Conversations (répondre), Devoirs' },
  { id: 'correcteur', libelle: 'Correcteur', ouvre: 'Devoirs (corriger), Conversations' },
  { id: 'assistant', libelle: 'Assistant pédagogique', ouvre: 'Étudiants, Devoirs (corriger)' },
  { id: 'contenu', libelle: 'Responsable de contenu', ouvre: 'Formations, Ressources, Devoirs' },
  { id: 'support', libelle: 'Support', ouvre: 'Conversations' },
  { id: 'analyste', libelle: 'Analyste', ouvre: 'Les écrans d’analyse (Analytics, Santé, Assistants, Badges, Activité), et rien d’autre' },
  {
    id: 'manager',
    libelle: 'Manager',
    ouvre: 'Tout, sauf les réglages du propriétaire et les quatre écrans de l’analyste',
  },
];

type InvitationVue = {
  id: string;
  email: string;
  kind: string;
  roles: string;
  formationTitre: string | null;
  expiresAtMs: number;
  createdAtMs: number;
};

type TransfertVue = { id: string; de: string; versEmail: string; createdAtMs: number; expiresAtMs: number } | null;

/**
 * INVITATIONS ET TRANSFERT — les deux gestes qui touchent aux personnes.
 *
 * Inviter d'abord (7 jours pour l'équipe, 3 jours pour un accès gracieux),
 * transférer ensuite — avec le mot de passe, puis la confirmation du nouveau
 * propriétaire. Rien de tout cela n'est automatique.
 */
export function EquipeAvancee({
  invitationsInitiales,
  transfertInitial,
  formations,
  emailProprietaire,
}: {
  invitationsInitiales: InvitationVue[];
  transfertInitial: TransfertVue;
  formations: Array<{ id: string; titre: string }>;
  emailProprietaire: string;
}) {
  const router = useRouter();
  const [invitations, setInvitations] = useState(invitationsInitiales);
  const [transfert, setTransfert] = useState(transfertInitial);
  const [bilan, setBilan] = useState<{ ok: boolean; texte: string } | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);
  const [lien, setLien] = useState<string | null>(null);

  const [invitation, setInvitation] = useState({ email: '', kind: 'staff', formationId: '', roles: '', message: '' });
  const rolesVoulus = invitation.roles ? invitation.roles.split(',').filter(Boolean) : [];
  const [transfertForm, setTransfertForm] = useState({ email: '', motDePasse: '' });

  async function agir(corps: Record<string, unknown>, cle: string) {
    setEnCours(cle);
    setBilan(null);
    const reponse = (await poster('/api/direction/people', corps)) as Reponse & Record<string, unknown>;
    setEnCours(null);
    setBilan({ ok: Boolean(reponse.ok), texte: messageDe(reponse) });
    if (Array.isArray(reponse.invitations)) setInvitations(reponse.invitations as InvitationVue[]);
    if (typeof reponse.lien === 'string') setLien(reponse.lien);
    if (reponse.transfert) setTransfert(reponse.transfert as TransfertVue);
    if (corps.action === 'transfert-annuler' && reponse.ok) setTransfert(null);
    if (reponse.ok) router.refresh();
  }

  return (
    <div className="col" style={{ gap: 16 }}>
      {bilan && (
        <div className={`banner ${bilan.ok ? 'ok' : 'err'}`} role="status">
          <span>{bilan.texte}</span>
        </div>
      )}

      <div className="card card-pad">
        <h3 className="mb4">Inviter quelqu’un</h3>
        <p className="small muted mb16">
          Une invitation se fait par e-mail, et la personne crée elle-même son accès. Membre de l’équipe : lien valable
          7 jours. Accès gracieux (une formation offerte) : 3 jours. Passé ce délai, rien ne subsiste en base.
        </p>
        <div className="col" style={{ gap: 10 }}>
          <input
            className="input"
            type="email"
            placeholder="adresse@exemple.com"
            value={invitation.email}
            onChange={(evenement) => setInvitation({ ...invitation, email: evenement.target.value })}
          />
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <label className="row small" style={{ gap: 6 }}>
              <input
                type="radio"
                name="invitation-kind"
                checked={invitation.kind === 'staff'}
                onChange={() => setInvitation({ ...invitation, kind: 'staff' })}
              />
              Membre de l’équipe
            </label>
            <label className="row small" style={{ gap: 6 }}>
              <input
                type="radio"
                name="invitation-kind"
                checked={invitation.kind === 'student_grace'}
                onChange={() => setInvitation({ ...invitation, kind: 'student_grace' })}
              />
              Accès gracieux étudiant
            </label>
          </div>
          {invitation.kind === 'staff' && (
            <div>
              <div className="xs faint mb4">Ses rôles — ils s’ouvriront dès qu’elle confirmera son adresse.</div>
              <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                {ROLES_EQUIPE.map((role) => {
                  const actif = rolesVoulus.includes(role.id);
                  return (
                    <button
                      key={role.id}
                      type="button"
                      className="dv-mini"
                      style={
                        actif
                          ? { borderColor: 'var(--violet)', color: 'var(--violet)', background: 'var(--violet-soft)' }
                          : undefined
                      }
                      title={role.ouvre}
                      aria-pressed={actif}
                      onClick={() =>
                        setInvitation({
                          ...invitation,
                          roles: (actif
                            ? rolesVoulus.filter((id) => id !== role.id)
                            : [...rolesVoulus, role.id]
                          ).join(','),
                        })
                      }
                    >
                      {role.libelle}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {invitation.kind === 'student_grace' && (
            <select
              className="inp"
              value={invitation.formationId}
              onChange={(evenement) => setInvitation({ ...invitation, formationId: evenement.target.value })}
            >
              <option value="">Formation à offrir (facultatif)</option>
              {formations.map((formation) => (
                <option key={formation.id} value={formation.id}>
                  {formation.titre}
                </option>
              ))}
            </select>
          )}
          <input
            className="input"
            placeholder="Petit mot à joindre (facultatif)"
            value={invitation.message}
            onChange={(evenement) => setInvitation({ ...invitation, message: evenement.target.value })}
          />
          <div className="row" style={{ gap: 8 }}>
            <button
              className="btn btn-primary"
              type="button"
              disabled={enCours === 'inviter' || !invitation.email.includes('@')}
              onClick={() => agir({ action: 'inviter', ...invitation }, 'inviter')}
            >
              {enCours === 'inviter' ? 'Création…' : 'Créer l’invitation'}
            </button>
          </div>
          {lien && (
            <div className="card card-pad" style={{ background: 'var(--violet-soft)' }}>
              <div className="eyebrow mb8">Le lien, si vous préférez le transmettre vous-même</div>
              <code className="xs" style={{ wordBreak: 'break-all' }}>{lien}</code>
            </div>
          )}
        </div>

        <div className="mt16">
          <div className="eyebrow mb8">Invitations en attente</div>
          {invitations.length === 0 ? (
            <p className="small muted">Aucune invitation en attente.</p>
          ) : (
            invitations.map((entree) => (
              <div key={entree.id} className="row between" style={{ gap: 10, padding: '7px 0', borderBottom: '1px solid var(--line)', flexWrap: 'wrap' }}>
                <span className="small">
                  <b>{entree.email}</b>
                  <span className="xs faint" style={{ display: 'block' }}>
                    {entree.kind === 'staff' ? 'Membre de l’équipe' : 'Accès gracieux'}
                    {entree.formationTitre ? ` · ${entree.formationTitre}` : ''} · expire le{' '}
                    {new Date(entree.expiresAtMs).toLocaleDateString('fr-FR')}
                  </span>
                </span>
                <button
                  className="btn btn-ghost"
                  type="button"
                  disabled={enCours === entree.id}
                  onClick={() => agir({ action: 'revoquer-invitation', id: entree.id }, entree.id)}
                >
                  Révoquer
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="card card-pad" style={{ borderColor: 'var(--gold-line)' }}>
        <h3 className="mb4">Transfert de propriété du campus</h3>
        <div className="banner gold mb16" style={{ padding: '10px 12px' }}>
          <span className="small">
            Le propriétaire est <b>unique</b>. Le transfert exige votre mot de passe, puis une <b>confirmation par
            e-mail</b> du nouveau propriétaire. Toutes les données, intégrations et réglages sont transmis ; vous restez
            membre de l’équipe.
          </span>
        </div>

        {transfert ? (
          <div className="banner warn" role="status">
            <span className="small">
              Transfert en attente vers <b>{transfert.versEmail}</b> — e-mail de confirmation envoyé le{' '}
              {new Date(transfert.createdAtMs).toLocaleString('fr-FR')}, valable jusqu’au{' '}
              {new Date(transfert.expiresAtMs).toLocaleString('fr-FR')}.
            </span>
            <button
              className="btn btn-ghost"
              style={{ marginLeft: 'auto' }}
              type="button"
              disabled={enCours === 'transfert-annuler'}
              onClick={() => agir({ action: 'transfert-annuler' }, 'transfert-annuler')}
            >
              Annuler le transfert
            </button>
          </div>
        ) : (
          <>
            <p className="small muted mb16">
              Vous êtes actuellement propriétaire avec <b>{emailProprietaire}</b>. Choisissez qui prendra la suite.
            </p>
            <div className="col" style={{ gap: 10 }}>
              <input
                className="input"
                type="email"
                placeholder="E-mail du nouveau propriétaire"
                value={transfertForm.email}
                onChange={(evenement) => setTransfertForm({ ...transfertForm, email: evenement.target.value })}
              />
              <input
                className="input"
                type="password"
                autoComplete="current-password"
                placeholder="Votre mot de passe de propriétaire"
                value={transfertForm.motDePasse}
                onChange={(evenement) => setTransfertForm({ ...transfertForm, motDePasse: evenement.target.value })}
              />
              <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                <button
                  className="btn btn-gold"
                  type="button"
                  disabled={enCours === 'transfert-initier' || !transfertForm.email.includes('@')}
                  onClick={() => {
                    setTransfertForm({ ...transfertForm, motDePasse: '' });
                    agir({ action: 'transfert-initier', ...transfertForm }, 'transfert-initier');
                  }}
                >
                  {enCours === 'transfert-initier' ? 'Envoi…' : 'Initier le transfert'}
                </button>
                <span className="xs faint">Le nouveau propriétaire doit déjà avoir un compte sur la plateforme.</span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
