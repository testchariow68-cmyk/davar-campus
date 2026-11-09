'use client';

import { useEffect, useState } from 'react';
import { Icon } from './Icon';

type Signal = Event & { prompt?: () => Promise<void>; userChoice?: Promise<{ outcome: string }> };

/**
 * « AJOUTER À L'ÉCRAN D'ACCUEIL » — installer le campus comme une application.
 *
 * Le navigateur ne nous laisse pas décider : il envoie un signal
 * (`beforeinstallprompt`) quand l'installation est possible, et iOS ne
 * l'envoie jamais. On ne montre donc jamais un bouton qui ne ferait rien :
 *   - le signal est là ? le bouton installe vraiment ;
 *   - c'est iOS ? le bouton explique le geste, qui ne peut pas être automatisé ;
 *   - l'application est déjà installée ? le bouton disparaît.
 */
export function BoutonInstaller({ className }: { className?: string }) {
  const [signal, setSignal] = useState<Signal | null>(null);
  const [installee, setInstallee] = useState(false);
  const [ios, setIos] = useState(false);
  const [aide, setAide] = useState(false);

  useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setInstallee(true);
      return;
    }
    const surSignal = (evenement: Event) => {
      evenement.preventDefault();
      setSignal(evenement as Signal);
    };
    const surInstallee = () => setInstallee(true);
    window.addEventListener('beforeinstallprompt', surSignal);
    window.addEventListener('appinstalled', surInstallee);
    // Safari sur iPhone et iPad : pas de signal, mais le geste existe.
    const estIos = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const sansSignal = estIos && !(navigator as unknown as { standalone?: boolean }).standalone;
    setIos(sansSignal);
    return () => {
      window.removeEventListener('beforeinstallprompt', surSignal);
      window.removeEventListener('appinstalled', surInstallee);
    };
  }, []);

  if (installee) return null;

  async function installer() {
    if (signal?.prompt) {
      await signal.prompt();
      const choix = await signal.userChoice;
      if (choix?.outcome === 'accepted') setInstallee(true);
      setSignal(null);
      return;
    }
    // Le navigateur n'a pas envoyé de signal (iOS, ou page non sécurisée) :
    // on explique le geste plutôt que de laisser un bouton muet.
    setAide(true);
  }

  return (
    <>
      <button className={className ?? 'btn btn-ghost btn-sm'} onClick={() => void installer()}>
        <Icon nom="download" taille={14} /> Ajouter à l’écran d’accueil
      </button>
      {aide && (
        <div className="banner info mt8" role="status">
          <span>
            {ios
              ? 'Sur iPhone ou iPad : touchez le bouton de partage, puis « Ajouter à l’écran d’accueil ».'
              : 'Ouvrez le menu de votre navigateur (⋮ en haut à droite) puis touchez « Installer cette application » ou « Ajouter à l’écran d’accueil ».'}
          </span>
        </div>
      )}
    </>
  );
}
