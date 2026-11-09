/**
 * LES VRAIS LOGOS DES PLATEFORMES, avec leurs couleurs officielles.
 *
 * Portés tels quels du prototype (`socialLogo()`, views-campus.js) : le
 * propriétaire a demandé les logos officiels, pas des pictogrammes génériques.
 * Sur une plateforme inconnue, un carré neutre — jamais un faux logo.
 */
const LOGOS: Record<string, React.ReactNode> = {
  facebook: (
    <>
      <rect width="24" height="24" rx="6" fill="#1877F2" />
      <path
        d="M13.4 21v-6.9h2.3l.4-2.7h-2.7V9.6c0-.8.4-1.5 1.6-1.5h1.3V5.8s-1.1-.2-2.2-.2c-2.3 0-3.8 1.4-3.8 3.9v2H8v2.7h2.3V21z"
        fill="#fff"
      />
    </>
  ),
  instagram: (
    <>
      <defs>
        <linearGradient id="davar-ig" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#FEDA75" />
          <stop offset=".3" stopColor="#FA7E1E" />
          <stop offset=".55" stopColor="#D62976" />
          <stop offset=".8" stopColor="#962FBF" />
          <stop offset="1" stopColor="#4F5BD5" />
        </linearGradient>
      </defs>
      <rect width="24" height="24" rx="6.5" fill="url(#davar-ig)" />
      <rect x="5.2" y="5.2" width="13.6" height="13.6" rx="4.2" fill="none" stroke="#fff" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="3.1" fill="none" stroke="#fff" strokeWidth="1.5" />
      <circle cx="16.4" cy="7.6" r="1" fill="#fff" />
    </>
  ),
  tiktok: (
    <>
      <rect width="24" height="24" rx="6" fill="#010101" />
      <path
        d="M14.6 5.4c.4 2.1 1.9 3.5 4 3.7v2.5c-1.5 0-2.9-.5-4-1.3v5.3a4.8 4.8 0 11-4.8-4.8c.3 0 .6 0 .9.1v2.6a2.2 2.2 0 101.4 2.1V5.4z"
        fill="#25F4EE"
        transform="translate(-.6 -.4)"
      />
      <path
        d="M14.6 5.4c.4 2.1 1.9 3.5 4 3.7v2.5c-1.5 0-2.9-.5-4-1.3v5.3a4.8 4.8 0 11-4.8-4.8c.3 0 .6 0 .9.1v2.6a2.2 2.2 0 101.4 2.1V5.4z"
        fill="#FE2C55"
        transform="translate(.6 .4)"
      />
      <path
        d="M14.6 5.4c.4 2.1 1.9 3.5 4 3.7v2.5c-1.5 0-2.9-.5-4-1.3v5.3a4.8 4.8 0 11-4.8-4.8c.3 0 .6 0 .9.1v2.6a2.2 2.2 0 101.4 2.1V5.4z"
        fill="#fff"
      />
    </>
  ),
  youtube: (
    <>
      <rect width="24" height="24" rx="6" fill="#FF0000" />
      <path d="M9.7 8.3l5.8 3.7-5.8 3.7z" fill="#fff" />
    </>
  ),
  linkedin: (
    <>
      <rect width="24" height="24" rx="5" fill="#0A66C2" />
      <path
        d="M8.3 10.2H6V18h2.3zM7.1 9.1a1.35 1.35 0 100-2.7 1.35 1.35 0 000 2.7zM18 13.4c0-2.4-1.3-3.5-3-3.5-1.4 0-2 .8-2.4 1.3v-1h-2.3V18h2.3v-4.2c0-1.1.5-1.8 1.5-1.8s1.5.7 1.5 1.8V18H18z"
        fill="#fff"
      />
    </>
  ),
  x: (
    <>
      <rect width="24" height="24" rx="6" fill="#000" />
      <path d="M17.8 6h-2.7l-3 4.1L9.2 6H6l4.6 6.2L6 18h2.7l3.2-4.4 3.2 4.4h3.2l-4.8-6.5z" fill="#fff" />
    </>
  ),
  whatsapp: (
    <>
      <rect width="24" height="24" rx="12" fill="#25D366" />
      <path d="M12 5.6a6.4 6.4 0 00-5.5 9.6l-.9 3.2 3.3-.9A6.4 6.4 0 1012 5.6z" fill="none" stroke="#fff" strokeWidth="1.4" />
      <path
        d="M9.6 8.9c-.3.1-.8.5-.8 1.2 0 1.9 2.4 4.6 4.9 5.3.9.2 1.5-.2 1.7-.7l.3-.9c.1-.3 0-.5-.3-.6l-1.6-.8c-.6-.2-.8.5-1.2.5-.7-.3-1.7-1.2-2-1.9 0-.4.6-.6.4-1.2l-.7-1.6c-.1-.3-.4-.4-.7-.3z"
        fill="#fff"
      />
    </>
  ),
  telegram: (
    <>
      <rect width="24" height="24" rx="12" fill="#26A5E4" />
      <path
        d="M18.6 6.8L6 11.6c-.7.3-.7.9-.1 1.1l3.1 1 1.2 3.7c.2.5.7.6 1.1.2l1.7-1.6 3.2 2.4c.5.3 1 .1 1.1-.6l2-9.4c.2-.8-.3-1.2-.7-1z"
        fill="#fff"
      />
    </>
  ),
};

export function LogoSocial({ plateforme, taille = 20 }: { plateforme: string; taille?: number }) {
  const trace = LOGOS[(plateforme ?? '').toLowerCase()] ?? (
    <>
      <rect width="24" height="24" rx="6" fill="#6F6A80" />
      <circle cx="12" cy="12" r="5" fill="#fff" />
    </>
  );
  return (
    <svg width={taille} height={taille} viewBox="0 0 24 24" aria-hidden="true">
      {trace}
    </svg>
  );
}
