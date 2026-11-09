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
  chapitres: number;
  code: string | null;
  hours: number;
  rating: number | null;
};

/**
 * CARTE DE FORMATION — `trainingCard()` du prototype.
 * Possédée : on ouvre la formation. Non possédée : on ouvre la commande.
 */
export function CarteFormation({ formation, possedee }: { formation: FormationCarte; possedee: boolean }) {
  const hue = teinte(formation.id);
  // Le prototype affiche « OR-101 · ⭐ 4.9 » sous le titre. Référence et note
  // viennent de la base : rien n'est inventé quand elles ne sont pas renseignées.
  const meta: string[] = [];
  if (formation.code) meta.push(formation.code);
  if (formation.rating !== null) meta.push(`\u2B50 ${formation.rating.toFixed(1)}`);
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
        {meta.length > 0 && <div className="xs faint">{meta.join(' · ')}</div>}
        <h3>{formation.title}</h3>
        {formation.description && <p className="desc">{formation.description}</p>}
        <div className="t-meta">
          {formation.hours > 0 && (
            <span>
              <Icon nom="clock" taille={12} /> {formation.hours} h
            </span>
          )}
          <span>
            <Icon nom="layers" taille={12} /> {formation.chapitres} chapitres
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
