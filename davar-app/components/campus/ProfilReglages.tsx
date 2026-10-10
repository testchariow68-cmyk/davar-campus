'use client';

import { useState } from 'react';
import { deriveClientKey, fetchDerivationParameters } from '@/lib/client/derive';
import { Icon } from './Icon';

/**
 * PROFIL & PARAMÈTRES — la page du prototype, branchée sur la vraie base.
 *
 * Le nom part sur le serveur (2 à 21 caractères : c'est celui des certificats),
 * les préférences suivent la personne d'un appareil à l'autre, et le code secret
 * est dérivé DANS ce navigateur (600 000 itérations) : seul le résultat voyage,
 * jamais le mot de passe.
 */
export type PreferencesProfil = {
  notifications: boolean;
  echelle: number;
  photoCle: string | null;
};

const ECHELLES = [0.9, 1, 1.1, 1.25] as const;

function messageErreur(erreur?: string): string {
  switch (erreur) {
    case 'nom_invalide':
      return 'Le nom doit faire entre 2 et 21 caractères.';
    case 'code_actuel_incorrect':
      return 'Votre code secret actuel n’est pas correct : rien n’a été changé.';
    case 'code_invalide':
      return 'Le nouveau code secret est trop court (6 caractères minimum).';
    case 'unavailable':
      return 'Impossible pour le moment : réessayez dans un instant.';
    default:
      return 'Enregistrement impossible.';
  }
}

export function ProfilReglages({
  nomInitial,
  email,
  membreDepuis,
  preferencesInitiales,
  photoUrl,
  depotsPossibles,
}: {
  nomInitial: string;
  email: string;
  membreDepuis: string;
  preferencesInitiales: PreferencesProfil;
  photoUrl: string | null;
  depotsPossibles: boolean;
}) {
  const [nom, setNom] = useState(nomInitial);
  const [preferences, setPreferences] = useState<PreferencesProfil>(preferencesInitiales);
  const [photo, setPhoto] = useState(photoUrl);
  const [enCours, setEnCours] = useState<string | null>(null);
  const [message, setMessage] = useState<{ texte: string; ok: boolean } | null>(null);

  const [ancien, setAncien] = useState('');
  const [nouveau, setNouveau] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [theme, setTheme] = useState(() =>
    typeof document === 'undefined' ? 'dark' : document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'
  );

  const initiale = (nom.trim()[0] ?? '?').toUpperCase();

  async function appeler(corps: Record<string, unknown>): Promise<{ ok?: boolean; message?: string; erreur?: string }> {
    try {
      const reponse = await fetch('/api/campus/profil', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corps),
      });
      return (await reponse.json().catch(() => ({}))) as { ok?: boolean; message?: string; erreur?: string };
    } catch {
      return { ok: false, erreur: 'unavailable' };
    }
  }

  function annoncer(texte: string, ok: boolean) {
    setMessage({ texte, ok });
    window.setTimeout(() => setMessage(null), 4000);
  }

  async function enregistrerNom() {
    setEnCours('nom');
    const reponse = await appeler({ action: 'nom', nom });
    setEnCours(null);
    if (reponse.ok) {
      const propre = nom.trim().replace(/\s+/g, ' ');
      setNom(propre);
      annoncer(reponse.message ?? 'Nom enregistré.', true);
    } else {
      annoncer(reponse.message ?? messageErreur(reponse.erreur), false);
    }
  }

  async function basculerNotifications(actives: boolean) {
    setPreferences((actuel) => ({ ...actuel, notifications: actives }));
    const reponse = await appeler({ action: 'preference', cle: 'notifications.actives', valeur: actives ? '1' : '0' });
    if (!reponse.ok) {
      setPreferences((actuel) => ({ ...actuel, notifications: !actives }));
      annoncer(reponse.message ?? messageErreur(reponse.erreur), false);
      return;
    }
    annoncer(reponse.message ?? 'Préférence enregistrée.', true);
  }

  async function changerEchelle(valeur: number) {
    setPreferences((actuel) => ({ ...actuel, echelle: valeur }));
    document.documentElement.style.zoom = valeur === 1 ? '' : String(valeur);
    const reponse = await appeler({ action: 'preference', cle: 'affichage.echelle', valeur: String(valeur) });
    if (!reponse.ok) annoncer(reponse.message ?? messageErreur(reponse.erreur), false);
  }

  function basculerTheme() {
    const suivant = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = suivant;
    try {
      localStorage.setItem('davar_theme', suivant);
    } catch {
      /* stockage bloqué : le thème reste celui de la session */
    }
    setTheme(suivant);
  }

  async function deposerPhoto(fichier: File) {
    if (fichier.size > 10 * 1024 * 1024) {
      annoncer('La photo doit peser moins de 10 Mo.', false);
      return;
    }
    setEnCours('photo');
    const extension = (fichier.name.split('.').pop() ?? 'jpg').toLowerCase();
    const signature = (await appeler({ action: 'photo_depot', extension, octets: fichier.size })) as {
      ok?: boolean;
      url?: string;
      cle?: string;
      message?: string;
      erreur?: string;
    };
    if (!signature.ok || !signature.url || !signature.cle) {
      setEnCours(null);
      annoncer(signature.message ?? messageErreur(signature.erreur), false);
      return;
    }
    try {
      const envoi = await fetch(signature.url, { method: 'PUT', body: fichier });
      if (!envoi.ok) throw new Error('envoi refusé');
    } catch {
      setEnCours(null);
      annoncer('L’envoi de la photo a échoué : réessayez dans un instant.', false);
      return;
    }
    const confirmation = await appeler({ action: 'photo', cle: signature.cle });
    setEnCours(null);
    if (!confirmation.ok) {
      annoncer(confirmation.message ?? messageErreur(confirmation.erreur), false);
      return;
    }
    setPhoto(signature.cle.startsWith('http') ? signature.cle : URL.createObjectURL(fichier));
    annoncer(confirmation.message ?? 'Photo enregistrée.', true);
  }

  async function changerCode() {
    if (nouveau.trim().length < 6) {
      annoncer('Le nouveau code secret doit faire 6 caractères minimum.', false);
      return;
    }
    if (nouveau !== confirmation) {
      annoncer('Les deux nouveaux codes ne sont pas identiques : rien n’a été changé.', false);
      return;
    }
    setEnCours('code');
    const parametres = await fetchDerivationParameters(email);
    if (!parametres.ok || parametres.parameters.scheme !== 'client-v1') {
      setEnCours(null);
      annoncer('Dérivation impossible dans ce navigateur.', false);
      return;
    }
    const ancienVerifier = await deriveClientKey(ancien, parametres.parameters);
    const nouveauVerifier = await deriveClientKey(nouveau, parametres.parameters);
    const reponse = await appeler({ action: 'code', ancien: ancienVerifier, nouveau: nouveauVerifier });
    setEnCours(null);
    if (reponse.ok) {
      setAncien('');
      setNouveau('');
      setConfirmation('');
      annoncer(reponse.message ?? 'Code secret changé.', true);
    } else {
      annoncer(reponse.message ?? messageErreur(reponse.erreur), false);
    }
  }

  return (
    <>
      {message && <p className={`small ${message.ok ? 'muted' : 'muted'} mb16`} role="status">{message.texte}</p>}

      <div className="grid g2" style={{ alignItems: 'start' }}>
        <div className="card card-pad">
          <div className="row">
            <span className="avatar lg" aria-hidden="true">
              {photo ? <img src={photo} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} /> : initiale}
            </span>
            <div>
              <b style={{ fontSize: 15 }}>{nom}</b>
              <div className="xs muted">{email}</div>
              <div className="xs faint mt4">Membre depuis {membreDepuis}</div>
            </div>
          </div>

          <div className="divider" />

          {depotsPossibles ? (
            <div className="field">
              <label htmlFor="pfPhoto">Photo de profil</label>
              <input
                id="pfPhoto"
                type="file"
                accept="image/*"
                className="inp"
                onChange={(evenement) => {
                  const fichier = evenement.target.files?.[0];
                  if (fichier) void deposerPhoto(fichier);
                }}
              />
              <div className="hint">Format carré de préférence, 10 Mo au plus.</div>
            </div>
          ) : (
            <div className="xs faint">
              Photo de profil : disponible dès que le stockage des fichiers est relié. En attendant, vos initiales
              s’affichent.
            </div>
          )}

          <div className="field">
            <label htmlFor="pfNom">Nom complet (21 caractères au plus)</label>
            <input
              className="inp"
              id="pfNom"
              maxLength={21}
              value={nom}
              onChange={(evenement) => setNom(evenement.target.value)}
            />
            <div className="hint">Ce nom apparaît sur vos certificats.</div>
          </div>
          <button className="btn btn-primary btn-sm" onClick={enregistrerNom} disabled={enCours === 'nom'}>
            <Icon nom="check" taille={14} /> {enCours === 'nom' ? 'Enregistrement…' : 'Enregistrer'}
          </button>

          <div className="divider" />

          <div className="row between">
            <span className="small muted">Mode sombre</span>
            <label className="switch">
              <input type="checkbox" checked={theme === 'dark'} onChange={basculerTheme} />
              <i />
            </label>
          </div>
          <div className="xs faint mt4">Par défaut, le thème suit le réglage de votre appareil.</div>

          <div className="row between mt16">
            <span className="small muted">Taille de l’affichage</span>
            <span className="row" style={{ gap: 4 }}>
              {ECHELLES.map((valeur) => (
                <button
                  key={valeur}
                  className={`btn btn-sm ${preferences.echelle === valeur ? 'btn-primary' : ''}`}
                  style={{ padding: '4px 9px' }}
                  onClick={() => changerEchelle(valeur)}
                >
                  {Math.round(valeur * 100)} %
                </button>
              ))}
            </span>
          </div>
        </div>

        <div className="card card-pad">
          <div className="eyebrow mb8">Notifications</div>
          <div className="row between">
            <span className="small muted">
              Réponses du coach, corrections, certificats, motivations du dimanche.
            </span>
            <label className="switch">
              <input
                type="checkbox"
                checked={preferences.notifications}
                onChange={(evenement) => void basculerNotifications(evenement.target.checked)}
              />
              <i />
            </label>
          </div>
          <div className="xs faint mt4">
            Coupées, les alertes de <b>sécurité</b> continuent tout de même de vous prévenir : elles touchent votre
            compte.
          </div>

          <div className="divider" />

          <div className="eyebrow mb8">Code secret</div>
          <div className="field">
            <label htmlFor="pfAncien">Code secret actuel</label>
            <input
              className="inp"
              id="pfAncien"
              type="password"
              autoComplete="current-password"
              value={ancien}
              onChange={(evenement) => setAncien(evenement.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="pfNouveau">Nouveau code secret</label>
            <input
              className="inp"
              id="pfNouveau"
              type="password"
              autoComplete="new-password"
              value={nouveau}
              onChange={(evenement) => setNouveau(evenement.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="pfConfirme">Confirmer le nouveau code</label>
            <input
              className="inp"
              id="pfConfirme"
              type="password"
              autoComplete="new-password"
              value={confirmation}
              onChange={(evenement) => setConfirmation(evenement.target.value)}
            />
          </div>
          <button
            className="btn btn-primary btn-sm"
            onClick={changerCode}
            disabled={enCours === 'code' || !ancien || !nouveau || !confirmation}
          >
            <Icon nom="lock" taille={14} /> {enCours === 'code' ? 'Dérivation…' : 'Changer le code secret'}
          </button>
          <div className="xs faint mt8">
            Le calcul se fait dans votre navigateur : votre code secret ne quitte jamais votre appareil.
          </div>

          <div className="divider" />

          <div className="eyebrow mb8">Compte</div>
          <p className="small muted">
            Votre compte est unique : tous vos achats et toutes vos formations y sont rattachés, sans jamais créer de
            doublon.
          </p>
          <form action="/api/auth/logout" method="post" className="mt16">
            <button className="btn btn-sm" type="submit">
              <Icon nom="logout" taille={15} /> Se déconnecter
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
