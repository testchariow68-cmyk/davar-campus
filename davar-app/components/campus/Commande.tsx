'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/campus/Icon';
import { teinte } from '@/components/campus/CarteFormation';

/** Agrégateur Money Fusion (Fusion Pay) : mobile money Wave / OM / MoMo / Moov. */
const OPERATEURS = [
  { id: 'wave', libelle: 'Wave', couleur: '#1BB7E8', sous: 'Mobile money' },
  { id: 'om', libelle: 'Orange Money', couleur: '#FF7900', sous: 'Mobile money' },
  { id: 'momo', libelle: 'MTN MoMo', couleur: '#FFCC00', sous: 'Mobile money' },
  { id: 'moov', libelle: 'Moov Money', couleur: '#0057B8', sous: 'Mobile money' },
] as const;

/** Frais de traitement : 3,5 %, supportés par l'étudiant et ajoutés au prix. */
const TAUX_FRAIS = 0.035;

const MESSAGES: Record<string, string> = {
  paiement_non_configure:
    'Le paiement en ligne n’est pas encore branché : réessayez dans un instant, ou écrivez-nous pour payer par un autre moyen.',
  deja_acquise: 'Vous possédez déjà cette formation.',
  invalide: 'Vérifiez le numéro de téléphone indiqué.',
  unavailable: 'Service momentanément indisponible. Réessayez plus tard.',
};

function argent(valeur: number): string {
  return `${valeur.toLocaleString('fr-FR')} FCFA`;
}

function initiales(libelle: string): string {
  return libelle
    .split(' ')
    .map((mot) => mot[0])
    .join('')
    .slice(0, 2);
}

export type FormationCommande = {
  id: string;
  title: string;
  prixCfa: number;
};

/**
 * COMMANDE — `vCheckout()` du prototype : 1 · Compte, 2 · Paiement,
 * 3 · Confirmation. La formation est toujours ajoutée au compte connecté :
 * jamais de doublon de compte lors d'un nouvel achat.
 */
export function Commande({
  formation,
  nom,
  email,
  dejaAcquise,
}: {
  formation: FormationCommande;
  nom: string;
  email: string;
  dejaAcquise: boolean;
}) {
  const [etape, setEtape] = useState<1 | 2 | 3>(1);
  const [operateur, setOperateur] = useState<string>('wave');
  const [telephone, setTelephone] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const frais = Math.round(formation.prixCfa * TAUX_FRAIS);
  const total = formation.prixCfa + frais;
  const choix = OPERATEURS.find((item) => item.id === operateur) ?? OPERATEURS[0];
  const teinteFormation = teinte(formation.id);

  async function payer() {
    if (telephone.trim().length < 8) {
      setErreur(MESSAGES.invalide);
      return;
    }
    setEnvoi(true);
    setErreur(null);
    try {
      const response = await fetch('/api/payments/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ trainingId: formation.id, method: operateur, phone: telephone.trim() }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setErreur(MESSAGES[payload.error ?? 'unavailable'] ?? MESSAGES.unavailable);
        return;
      }
      setEtape(3);
    } catch {
      setErreur(MESSAGES.unavailable);
    } finally {
      setEnvoi(false);
    }
  }

  if (dejaAcquise) {
    return (
      <div className="card lock-hero" style={{ maxWidth: 560, margin: '40px auto' }}>
        <div className="lk" style={{ background: 'var(--green-soft)', color: 'var(--green)' }}>
          <Icon nom="checkCircle" taille={26} />
        </div>
        <h2>Vous possédez déjà cette formation</h2>
        <p className="muted mt8 small">
          Aucun double achat, aucun double compte : elle est déjà dans votre espace.
        </p>
        <Link className="btn btn-primary mt16" href={`/campus/formation/${formation.id}`}>
          Ouvrir la formation
        </Link>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 920, margin: '0 auto' }}>
      <div className="breadcrumb">
        <Link href="/campus/catalogue">Catalogue</Link>
        <Icon nom="chevR" taille={12} />
        <span>Commande</span>
      </div>

      <div className="steps-mini mb16">
        <b className={etape >= 1 ? 'on' : ''}>1 · Compte</b>
        <Icon nom="chevR" taille={12} />
        <b className={etape >= 2 ? 'on' : ''}>2 · Paiement</b>
        <Icon nom="chevR" taille={12} />
        <b className={etape >= 3 ? 'on' : ''}>3 · Confirmation</b>
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1.5fr 1fr', alignItems: 'start' }}>
        <div className="card card-pad">
          {etape === 1 && (
            <>
              <h3 style={{ fontSize: 15 }}>Compte existant détecté</h3>
              <div className="banner info mt8 mb16">
                <Icon nom="shieldCheck" taille={15} />
                <span>
                  Vous êtes connecté(e) en tant que <b>{nom}</b> ({email}). La formation sera ajoutée à{' '}
                  <b>ce compte</b> — jamais de doublon de compte lors d’un nouvel achat.
                </span>
              </div>
              <div className="field">
                <label htmlFor="payPhone">Téléphone pour le paiement</label>
                <input
                  id="payPhone"
                  className="inp"
                  value={telephone}
                  onChange={(event) => setTelephone(event.target.value)}
                  placeholder="+225 …"
                />
              </div>
              <button
                type="button"
                className="btn btn-primary btn-lg btn-block"
                onClick={() => setEtape(2)}
              >
                Continuer vers le paiement <Icon nom="arrowR" taille={14} />
              </button>
            </>
          )}

          {etape === 2 && (
            <>
              <div className="row between" style={{ flexWrap: 'wrap', gap: 8 }}>
                <h3 style={{ fontSize: 15 }}>Paiement Mobile Money</h3>
                <span className="badge b-green">Paiement sécurisé · confirmation instantanée</span>
              </div>
              <p className="xs muted mt4">
                Wave, Orange Money, MTN MoMo et Moov Money en un seul paiement (Fusion Pay). Les frais
                de traitement (3,5 %) sont <b>supportés par l’étudiant</b> et ajoutés au prix.
              </p>

              <div className="eyebrow mt16 mb8">Choisissez votre opérateur · 3,5 %</div>
              {OPERATEURS.map((item) => (
                <div
                  key={item.id}
                  className={`pay-opt ${operateur === item.id ? 'sel' : ''}`}
                  onClick={() => setOperateur(item.id)}
                >
                  <span
                    className="pay-logo"
                    style={{ background: item.couleur, ...(item.id === 'momo' ? { color: '#191622' } : null) }}
                  >
                    {initiales(item.libelle)}
                  </span>
                  <span className="wrap">
                    <b style={{ fontSize: 13.5 }}>{item.libelle}</b>
                    <div className="xs muted">
                      {item.sous} · Côte d’Ivoire, Sénégal, Mali, Bénin, Togo, Burkina
                    </div>
                  </span>
                  {operateur === item.id && <Icon nom="checkCircle" taille={18} />}
                </div>
              ))}

              <div className="card mt16" style={{ background: '#FBFAFE', borderColor: 'var(--violet-line)' }}>
                <div style={{ padding: '14px 16px' }}>
                  <div className="row between small">
                    <span className="muted">Formation</span>
                    <b>{argent(formation.prixCfa)}</b>
                  </div>
                  <div className="row between small mt8">
                    <span className="muted">Frais de traitement (3,5 % — à votre charge)</span>
                    <b>{argent(frais)}</b>
                  </div>
                  <div className="divider" style={{ margin: '10px 0' }} />
                  <div className="row between">
                    <b>Total à payer</b>
                    <b className="price">{argent(total)}</b>
                  </div>
                </div>
              </div>

              {erreur && (
                <div className="banner err mt16" role="alert">
                  <span>{erreur}</span>
                </div>
              )}

              <button
                type="button"
                className="btn btn-primary btn-lg btn-block mt16"
                onClick={payer}
                disabled={envoi}
              >
                <Icon nom="key" taille={15} />{' '}
                {envoi ? 'Paiement en cours…' : `Payer ${argent(total)} par ${choix.libelle}`}
              </button>

              <div className="xs faint mt8" style={{ textAlign: 'center' }}>
                Une demande de confirmation {choix.libelle} sera envoyée au téléphone indiqué.
                <br />
                Confirmation instantanée : la formation est ajoutée à votre compte.
              </div>
            </>
          )}

          {etape === 3 && (
            <div style={{ textAlign: 'center', padding: '10px 0' }}>
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: '50%',
                  background: 'var(--green-soft)',
                  color: 'var(--green)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto',
                }}
              >
                <Icon nom="checkCircle" taille={30} />
              </div>
              <h2 style={{ fontSize: 19, marginTop: 14 }}>Achat confirmé 🎉</h2>
              <p className="muted small mt8">
                Paiement de <b>{argent(total)}</b> confirmé par <b>{choix.libelle}</b> (dont{' '}
                {argent(frais)} de frais de traitement à votre charge). La formation «{' '}
                <b>{formation.title}</b> » a été <b>ajoutée à votre compte existant</b> ({email}).
              </p>
              <div className="banner ok mt16" style={{ textAlign: 'left' }}>
                <Icon nom="zap" taille={15} />
                <span className="small">
                  <b>Paiement confirmé : votre formation est activée.</b>
                  <br />
                  Aucun nouveau compte n’a été créé.
                </span>
              </div>
              <div className="row mt24" style={{ justifyContent: 'center', gap: 10, flexWrap: 'wrap' }}>
                <Link className="btn btn-primary" href={`/campus/formation/${formation.id}`}>
                  Commencer la formation <Icon nom="arrowR" taille={14} />
                </Link>
                <Link className="btn" href="/campus">
                  Retour au tableau de bord
                </Link>
              </div>
            </div>
          )}
        </div>

        <div className="card" style={{ overflow: 'hidden' }}>
          <div
            className="t-cover"
            style={{
              height: 110,
              background: `linear-gradient(140deg,hsl(${teinteFormation} 45% 12%) 0%,hsl(${teinteFormation} 55% 22%) 55%,hsl(${teinteFormation} 48% 32%) 100%)`,
            }}
          >
            <span className="mono">{formation.title.slice(0, 2).toUpperCase()}</span>
          </div>
          <div className="card-pad">
            <div className="eyebrow">Récapitulatif</div>
            <h3 style={{ fontSize: 14.5, marginTop: 4 }}>{formation.title}</h3>
            <div className="divider" />
            <div className="row between small">
              <span className="muted">Formation</span>
              <b>{argent(formation.prixCfa)}</b>
            </div>
            <div className="row between small mt8">
              <span className="muted">Accès</span>
              <b>12 mois à partir de l’achat</b>
            </div>
            <div className="row between small mt8">
              <span className="muted">Certificat</span>
              <b>Inclus</b>
            </div>
            <div className="divider" />
            <div className="row between">
              <b>Total</b>
              <b className="price">{argent(formation.prixCfa)}</b>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
