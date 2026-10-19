'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

type Miette = { label: string; href?: string };

const NOMS: Record<string, string> = {
  formations: 'Mes formations',
  exercices: 'Mes exercices',
  evaluations: 'Mes évaluations',
  certificats: 'Mes certificats',
  distinctions: 'Mes récompenses',
  avis: 'Mes avis',
  questions: 'Mes questions',
  notifications: 'Notifications',
  profil: 'Mon profil',
  parametres: 'Paramètres',
  catalogue: 'Découvrir des formations',
  ressources: 'Mes ressources',
};

/**
 * LE FIL D'ARIANE — `cpCrumbs()` du prototype : « Accueil › Mes formations ›
 * La formation ». La dernière miette est la page courante, les autres sont des
 * liens. Rien de plus : le prototype ne connaît pas d'autre chemin.
 */
export function FilAriane({ formations = [] }: { formations?: Array<{ id: string; title: string }> }) {
  const chemin = usePathname() ?? '/campus';
  const morceaux = chemin.replace(/^\/campus\/?/, '').split('/').filter(Boolean);
  const miettes: Miette[] = [{ label: 'Accueil', href: '/campus' }];

  if (morceaux.length === 0) {
    // Accueil : une seule miette, comme au prototype.
  } else if (morceaux[0] === 'formation' && morceaux[1]) {
    miettes.push({ label: 'Mes formations', href: '/campus/formations' });
    const titre = formations.find((formation) => formation.id === morceaux[1])?.title;
    miettes.push({ label: titre ?? 'Formation', href: `/campus/formation/${morceaux[1]}` });
    if (morceaux[2] === 'module') miettes.push({ label: 'Chapitre en cours' });
    if (morceaux[2] === 'exercice') miettes.push({ label: 'Exercice' });
    if (morceaux[2] === 'evaluation') miettes.push({ label: 'Évaluation' });
  } else if (morceaux[0] === 'ressources') {
    if (morceaux[1] === 'livre') {
      miettes.push({ label: 'Mes livres', href: '/campus/ressources' });
      if (morceaux[2]) miettes.push({ label: 'Lecture' });
    } else if (morceaux[1] === 'audio') {
      miettes.push({ label: 'Mes audios', href: '/campus/ressources' });
      if (morceaux[2]) miettes.push({ label: 'Écoute' });
    } else {
      miettes.push({ label: 'Mes ressources' });
    }
  } else if (morceaux[0] === 'questions' && morceaux[1]) {
    miettes.push({ label: 'Mes questions', href: '/campus/questions' });
    miettes.push({ label: 'Conversation' });
  } else {
    const nom = NOMS[morceaux[0]];
    miettes.push(nom ? { label: nom } : { label: morceaux[0] });
  }

  return (
    <div className="cp-crumb">
      {miettes.map((miette, index) => {
        const derniere = index === miettes.length - 1;
        return (
          <span key={`${miette.label}-${index}`}>
            {!derniere && miette.href ? (
              <>
                <Link href={miette.href}>{miette.label}</Link>
                <span className="sep">›</span>
              </>
            ) : (
              <span className="cur">{miette.label}</span>
            )}
          </span>
        );
      })}
    </div>
  );
}
