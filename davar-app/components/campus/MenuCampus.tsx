'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon, type NomIcone } from './Icon';

type Entree = { href: string; icone: NomIcone; libelle: string; description: string };

const ENTREES: Array<{ titre: string; lignes: Entree[] }> = [
  {
    titre: 'Général',
    lignes: [{ href: '/campus', icone: 'home', libelle: 'Accueil', description: 'Votre cockpit du jour' }],
  },
  {
    titre: 'Mon parcours',
    lignes: [
      { href: '/campus/formations', icone: 'cap', libelle: 'Mes formations', description: 'Vos formations achetées' },
      { href: '/campus/exercices', icone: 'edit', libelle: 'Mes exercices', description: 'Travaux corrigés par votre coach' },
      {
        href: '/campus/evaluations',
        icone: 'clipboard',
        libelle: 'Mes évaluations',
        description: 'Historique, tentatives et prochaine évaluation',
      },
    ],
  },
  {
    titre: 'Mes ressources',
    lignes: [
      { href: '/campus/ressources/livre', icone: 'book', libelle: 'Mes livres', description: 'Lecture dans la plateforme' },
      { href: '/campus/ressources/audio', icone: 'headset', libelle: 'Mes audios', description: 'Écoute avec reprise automatique' },
    ],
  },
  {
    titre: 'Mon campus',
    lignes: [
      { href: '/campus/certificats', icone: 'award', libelle: 'Mes certificats', description: 'Vos validations officielles' },
      {
        href: '/campus/distinctions',
        icone: 'rw_seal',
        libelle: 'Mes récompenses',
        description: 'Les étapes qui racontent votre parcours',
      },
      { href: '/campus/questions', icone: 'message', libelle: 'Mes questions', description: 'Vos conversations, réponses comprises' },
    ],
  },
  {
    titre: 'Mon compte',
    lignes: [
      { href: '/campus/profil', icone: 'user', libelle: 'Mon profil', description: 'Nom, photo, informations' },
      { href: '/campus/parametres', icone: 'settings', libelle: 'Paramètres', description: 'Thème, notifications, support' },
    ],
  },
];

/**
 * LE MENU DU CAMPUS — `cpMenuHTML()` du prototype : les onze entrées, leurs
 * cinq sections, et le pied avec le thème et la déconnexion. Une entrée est
 * marquée quand on s'y trouve.
 */
export function MenuCampus({
  nom,
  email,
  formation,
  pourcent,
  initiale,
}: {
  nom: string;
  email: string;
  formation: string | null;
  pourcent: number;
  initiale: string;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const chemin = usePathname() ?? '/campus';

  useEffect(() => {
    if (!ouvert) return;
    const surTouche = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOuvert(false);
    };
    document.addEventListener('keydown', surTouche);
    return () => document.removeEventListener('keydown', surTouche);
  }, [ouvert]);

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

  return (
    <>
      <button className="icon-btn" onClick={() => setOuvert(true)} title="Menu" aria-label="Menu">
        <Icon nom="menu" taille={18} />
      </button>

      {ouvert && (
        <div
          className="cp-menu"
          role="dialog"
          aria-label="Menu du campus"
          onClick={(event) => {
            if (event.target === event.currentTarget) setOuvert(false);
          }}
        >
          <div className="mn-panel">
            <div className="mn-head">
              <div className="row">
                <span className="avatar" aria-hidden="true">
                  {initiale}
                </span>
                <div>
                  <b>{nom}</b>
                  <div className="xs muted">
                    {formation ? `${formation} · ${pourcent} %` : 'Aucune formation active'}
                  </div>
                </div>
              </div>
              <button className="icon-btn" onClick={() => setOuvert(false)} title="Fermer" aria-label="Fermer">
                <Icon nom="x" taille={18} />
              </button>
            </div>

            <div className="mn-body">
              {ENTREES.map((section) => (
                <div className="mn-sec" key={section.titre}>
                  <div className="mn-title">{section.titre}</div>
                  {section.lignes.map((entree) => (
                    <Link
                      key={entree.href}
                      className={`mn-it ${chemin === entree.href ? 'on' : ''}`}
                      href={entree.href}
                      onClick={() => setOuvert(false)}
                    >
                      <span className="mn-ico">
                        <Icon nom={entree.icone} taille={17} />
                      </span>
                      <span className="mn-tx">
                        <b>{entree.libelle}</b>
                        <small>{entree.description}</small>
                      </span>
                    </Link>
                  ))}
                </div>
              ))}
            </div>

            <div className="mn-foot">
              <button className="btn" onClick={basculerTheme}>
                <Icon nom={theme === 'dark' ? 'sun' : 'moon'} taille={15} /> Thème{' '}
                {theme === 'dark' ? 'clair' : 'sombre'}
              </button>
              <form action="/api/auth/logout" method="post">
                <button className="btn btn-danger-ghost" type="submit">
                  <Icon nom="logout" taille={15} /> Se déconnecter
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
