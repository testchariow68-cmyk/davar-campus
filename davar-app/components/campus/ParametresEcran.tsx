'use client';

import { useEffect, useState } from 'react';
import { Icon } from './Icon';
import { BoutonAide, type Contacts } from './PanneauAide';
import { abonner, desabonner } from '@/lib/client/push';
import { SecuriteEmpreinte } from './SecuriteEmpreinte';

/** Les échelles du prototype : 90, 100, 110 et 125 %. */
const ECHELLES = [0.9, 1, 1.1, 1.25];

/**
 * PARAMÈTRES — `vSettings()` du prototype : apparence, notifications, pays &
 * téléphone, et les moyens de nous joindre. Chaque réglage est enregistré dès
 * qu'il change, et suit la personne d'un appareil à l'autre.
 */
export function ParametresEcran({
  contacts,
  echelleInitiale,
  notificationsInitiales,
  telephoneInitial,
  paysInitial,
  empreinteActive,
  utilisateurId,
}: {
  contacts: Contacts;
  echelleInitiale: number;
  notificationsInitiales: boolean;
  telephoneInitial: string;
  paysInitial: string;
  empreinteActive: boolean;
  utilisateurId: string;
}) {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [echelle, setEchelle] = useState(echelleInitiale);
  const [notifications, setNotifications] = useState(notificationsInitiales);
  const [telephone, setTelephone] = useState(telephoneInitial);
  const [pays, setPays] = useState(paysInitial);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');
  }, []);

  async function appeler(corps: Record<string, unknown>) {
    const reponse = await fetch('/api/campus/profil', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(corps),
    });
    const donnees = (await reponse.json().catch(() => ({}))) as { message?: string };
    if (typeof donnees.message === 'string') setMessage(donnees.message);
    return reponse;
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

  async function changerEchelle(valeur: number) {
    setEchelle(valeur);
    document.documentElement.style.zoom = valeur === 1 ? '' : String(valeur);
    await appeler({ action: 'preference', cle: 'affichage.echelle', valeur: String(valeur) });
  }

  async function basculerNotifications() {
    const suivant = !notifications;
    setNotifications(suivant);
    await appeler({ action: 'preference', cle: 'notifications.actives', valeur: suivant ? '1' : '0' });
    // L'appareil suit la décision. Le prototype se contentait d'afficher
    // « Notifications activées ✓ » : ici, il est réellement abonné, et la
    // notification part réellement. Sans permission du navigateur, la cloche
    // du campus continue de fonctionner — rien d'autre n'est promis.
    if (suivant) {
      const cle = await clePubliqueDuCampus();
      if (cle) await abonner(cle);
    } else {
      await desabonner();
    }
  }

  async function clePubliqueDuCampus(): Promise<string | null> {
    const reponse = await fetch('/api/campus/push', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'cle-publique' }),
    });
    const donnees = (await reponse.json().catch(() => ({}))) as { cle?: string };
    return typeof donnees.cle === 'string' ? donnees.cle : null;
  }

  return (
    <div
      className="grid"
      style={{ gridTemplateColumns: '1fr 1fr', alignItems: 'start', maxWidth: 860 }}
    >
      <div className="card card-pad">
        <div className="eyebrow mb8">Apparence</div>
        <div className="row between">
          <span className="small">Mode sombre</span>
          <label className="switch">
            <input type="checkbox" checked={theme === 'dark'} onChange={basculerTheme} />
            <i />
          </label>
        </div>
        <div className="row between mt8">
          <span className="small">Taille des textes &amp; icônes</span>
          <div className="row" style={{ gap: 4 }}>
            {ECHELLES.map((valeur) => (
              <button
                key={valeur}
                className={`btn btn-sm ${echelle === valeur ? 'btn-primary' : ''}`}
                style={{ padding: '4px 9px' }}
                onClick={() => changerEchelle(valeur)}
              >
                {Math.round(valeur * 100)}
              </button>
            ))}
          </div>
        </div>
        <div className="xs faint mt4">
          Règle la taille de tout votre tableau de bord, sur cet appareil.
        </div>

        <div className="divider" />

        <div className="eyebrow mb8">Notifications</div>
        <div className="row between">
          <span className="small">Activer les notifications</span>
          <label className="switch">
            <input type="checkbox" checked={notifications} onChange={basculerNotifications} />
            <i />
          </label>
        </div>
        <div className="xs faint mt8">
          Recevez les réponses de votre coach, les corrections et vos certificats en temps réel.
        </div>


        <SecuriteEmpreinte activeInitiale={empreinteActive} utilisateurId={utilisateurId} />

        <div className="eyebrow mb8">Pays &amp; téléphone</div>
        <div className="field">
          <label htmlFor="setPays">Pays du compte</label>
          <select
            id="setPays"
            className="inp"
            value={pays}
            onChange={async (event) => {
              const valeur = event.target.value;
              setPays(valeur);
              await appeler({ action: 'pays', pays: valeur });
            }}
          >
            <option value="">Choisir mon pays</option>
            {PAYS.map((nom) => (
              <option key={nom} value={nom}>
                {nom}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="setPhone">Numéro de téléphone</label>
          <input
            id="setPhone"
            className="inp"
            value={telephone}
            placeholder="Votre numéro"
            onChange={(event) => setTelephone(event.target.value)}
            onBlur={async () => {
              if (telephone === telephoneInitial) return;
              await appeler({ action: 'telephone', telephone });
            }}
          />
        </div>
        {message && (
          <div className="xs faint mt4" role="status">
            {message}
          </div>
        )}
      </div>

      <div className="card card-pad">
        <div className="eyebrow mb8">Support</div>
        <p className="xs muted mb8">Notre équipe vous répond sur le canal de votre choix.</p>
        <BoutonAide contacts={contacts} libelle="Discussion en direct" icone="message" />
        <a
          className="btn"
          style={{ width: '100%', marginBottom: 8 }}
          href={contacts.whatsapp}
          target="_blank"
          rel="noopener"
        >
          <Icon nom="whatsapp" taille={16} /> WhatsApp
        </a>
        <a
          className="btn"
          style={{ width: '100%', marginBottom: 8 }}
          href={`tel:${contacts.telephone.replace(/\s+/g, '')}`}
        >
          <Icon nom="phone" taille={16} /> Appeler
        </a>
        <BoutonAide contacts={contacts} libelle="Report" icone="mail" style={{ marginBottom: 0 }} />
      </div>
    </div>
  );
}

/** Les pays d'Afrique de l'Ouest d'abord : c'est de là que viennent les étudiants. */
const PAYS = [
  'Côte d’Ivoire',
  'Sénégal',
  'Mali',
  'Bénin',
  'Togo',
  'Burkina Faso',
  'Guinée',
  'Niger',
  'Ghana',
  'Nigeria',
  'Cameroun',
  'France',
  'Autre pays',
];
