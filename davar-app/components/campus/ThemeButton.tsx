'use client';

import { useEffect, useState } from 'react';
import { Icon } from './Icon';

/**
 * Bouton de thème et bascule clair/sombre — même geste que le prototype :
 * l'icône annonce le mode vers lequel on bascule, et le choix est mémorisé sous
 * la clé `davar_theme` (la clé du prototype, pour rester compatible).
 */
export function ThemeButton({ variante = 'barre' }: { variante?: 'barre' | 'rail' | 'mobile' } = {}) {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    const actuel = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
    setTheme(actuel);
  }, []);

  function basculer() {
    const suivant = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = suivant;
    try {
      localStorage.setItem('davar_theme', suivant);
    } catch {
      /* stockage bloqué : le thème reste celui de la session */
    }
    setTheme(suivant);
  }

  const libelle = `Mode ${theme === 'dark' ? 'clair' : 'sombre'}`;
  const classe = variante === 'rail' ? 'rail-ico' : variante === 'mobile' ? 'icon-btn d-lg-none' : 'icon-btn';

  return (
    <button className={classe} onClick={basculer} title={libelle} aria-label="Changer de thème">
      <Icon nom={theme === 'dark' ? 'sun' : 'moon'} taille={variante === 'rail' ? 18 : 17} />
      {variante === 'rail' && <span>Thème</span>}
    </button>
  );
}
