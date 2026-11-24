'use client';

import { usePathname } from 'next/navigation';

const TITRES: Record<string, string> = {
  '/direction': 'Vue d’ensemble',
  '/direction/analytics': 'Analytics',
  '/direction/sante': 'Santé technique',
  '/direction/assistants': 'Analyse assistants virtuels',
  '/direction/badges': 'Badges & distinctions',
  '/direction/activite': 'Activité étudiants',
  '/direction/formations': 'Formations',
  '/direction/ressources': 'Ressources',
  '/direction/exercices': 'Exercices',
  '/direction/devoirs': 'Évaluations',
  '/direction/etudiants': 'Étudiants',
  '/direction/conversations': 'Conversations',
  '/direction/avis': 'Avis',
  '/direction/certificats': 'Certifications',
  '/direction/recompenses': 'Récompenses',
  '/direction/ventes': 'Ventes',
  '/direction/exports': 'Exports',
  '/direction/cycle-de-vie': 'Cycle de vie',
  '/direction/assistant': 'Assistant virtuel',
  '/direction/emails': 'E-mails',
  '/direction/activites': 'Activités de l’équipe',
  '/direction/equipe': 'Équipe',
  '/direction/reglages': 'Configuration',
};

/** Titre synchronisé avec le lien staff réellement ouvert. */
export function DirectionHeading({ estProprietaire }: { estProprietaire: boolean }) {
  const chemin = usePathname() ?? '/direction';
  const titre = Object.keys(TITRES)
    .filter((route) => route === '/direction' ? chemin === route : chemin.startsWith(route))
    .sort((a, b) => b.length - a.length)[0];

  return (
    <h2>
      {TITRES[titre ?? '/direction'] ?? 'Centre de contrôle'}
      <span className={`badge ${estProprietaire ? 'b-gold' : 'b-violet'}`} style={{ marginLeft: 8 }}>
        {estProprietaire ? 'Super Admin' : 'Équipe'}
      </span>
    </h2>
  );
}
