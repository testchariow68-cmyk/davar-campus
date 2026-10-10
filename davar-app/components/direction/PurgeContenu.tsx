'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { messageDe, poster } from './api';

/**
 * Purge du contenu d'essai. Le propriétaire l'a demandée explicitement : la
 * plateforme doit être vide, tout ce qui s'y trouvait servait à tester.
 * La confirmation se tape à la main (VIDER) : aucune purge ne part d'un clic distrait.
 */
export function PurgeContenu({ contenu }: { contenu: { formations: number; modules: number; lecons: number; acces: number } }) {
  const router = useRouter();
  const [confirmation, setConfirmation] = useState('');
  const [bilan, setBilan] = useState<{ ok: boolean; texte: string } | null>(null);
  const [enCours, setEnCours] = useState(false);

  const rienAVider = contenu.modules === 0 && contenu.lecons === 0 && contenu.acces === 0;

  async function purger() {
    setEnCours(true);
    const reponse = await poster('/api/direction/people', { action: 'purge-content', confirmation });
    setBilan({ ok: reponse.ok, texte: messageDe(reponse) });
    setEnCours(false);
    if (reponse.ok) {
      setConfirmation('');
      router.refresh();
    }
  }

  return (
    <div className="card card-pad" style={{ borderColor: 'var(--red-line)' }}>
      <h3 className="mb8" style={{ color: 'var(--red)' }}>
        Vider le contenu d&apos;essai
      </h3>
      <p className="small muted mb16">
        Supprime tous les modules, toutes les leçons, tous les accès et toute la progression. Les formations elles-mêmes
        sont conservées. Une seule chose arrête cette purge : des achats vérifiés — une vente est une pièce comptable, elle
        ne se détruit pas.
      </p>
      <div className="banner info mb16">
        <span>
          Contenu actuel : {contenu.formations} formation{contenu.formations > 1 ? 's' : ''}, {contenu.modules} module
          {contenu.modules > 1 ? 's' : ''}, {contenu.lecons} leçon{contenu.lecons > 1 ? 's' : ''}, {contenu.acces} accès.
        </span>
      </div>
      {bilan && (
        <div className={`banner ${bilan.ok ? 'ok' : 'err'} mb16`} role="status">
          <span>{bilan.texte}</span>
        </div>
      )}
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <input
          className="inp"
          style={{ maxWidth: 220 }}
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value.toUpperCase())}
          placeholder="Tapez VIDER"
          aria-label="Confirmation de la purge"
        />
        <button className="btn btn-danger" disabled={enCours || confirmation !== 'VIDER' || rienAVider} onClick={purger}>
          {enCours ? 'Purge…' : 'Vider maintenant'}
        </button>
      </div>
      {rienAVider && <p className="small muted mt8">La plateforme est déjà vide : il n&apos;y a rien à purger.</p>}
    </div>
  );
}
