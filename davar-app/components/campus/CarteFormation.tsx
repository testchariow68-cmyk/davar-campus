import Link from 'next/link';
import { Icon } from '@/components/campus/Icon';

/** Teinte stable d'une formation : la même couleur à chaque visite, sans stockage. */
export function teinte(id: string): number {
  let somme = 0;
  for (let i = 0; i < id.length; i += 1) somme = (somme * 31 + id.charCodeAt(i)) % 360;
  return somme;
}

export type FormationCarte = {
  id: string;
  title: string;
  description: string | null;
  prixCfa: number;
  lecons: number;
};

/**
 * CARTE DE FORMATION — `trainingCard()` du prototype.
 * Possédée : on ouvre la formation. Non possédée : on ouvre la commande.
 */
export function CarteFormation({ formation, possedee }: { formation: FormationCarte; possedee: boolean }) {
  const hue = teinte(formation.id);
  // Toute la carte est cliquable, et le bouton du bas est un simple habillage :
  // c'est exactement le comportement de `trainingCard()` du prototype.
  return (
    <Link className="card t-card" href={possedee ? `/campus/formation/${formation.id}` : `/campus/checkout/${formation.id}`}>
      <div
        className="t-cover"
        style={{
          background: `linear-gradient(140deg,hsl(${hue} 45% 12%) 0%,hsl(${hue} 55% 22%) 55%,hsl(${hue} 48% 32%) 100%)`,
        }}
      >
        <span className="mono">{formation.title.slice(0, 2).toUpperCase()}</span>
      </div>
      <div className="t-body">
        <h3>{formation.title}</h3>
        {formation.description && <p className="desc">{formation.description}</p>}
        <div className="t-meta">
          <span>
            <Icon nom="layers" taille={12} /> {formation.lecons} leçons
          </span>
          <span>
            <Icon nom="cap" taille={12} /> Certificat
          </span>
        </div>
        <div className="row between mt8">
          <span className="price">{formation.prixCfa.toLocaleString('fr-FR')} FCFA</span>
          {possedee ? (
            <span className="badge b-green">Déjà acquise ✓</span>
          ) : (
            <span className="btn btn-primary btn-sm">
              Obtenir <Icon nom="arrowR" taille={13} />
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
