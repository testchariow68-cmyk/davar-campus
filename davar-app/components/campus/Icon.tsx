/* ============================================================================
   ICÔNES DU PROTOTYPE — reprises telles quelles depuis `reference/prototype-campus/js/icons.js`
   ----------------------------------------------------------------------------
   Mêmes tracés, mêmes noms, mêmes réglages de trait que la fonction `icon()` du
   prototype (trait 1,8 · taille par défaut 18 · classe « ic »). C'est ce qui
   garantit que chaque écran reconstruit ressemble exactement au prototype.
   ============================================================================ */
type NomIcone =
'home' | 'cap' | 'book' | 'layers' | 'play' | 'pause' | 'file' | 'download' | 'video' | 'message' | 'sparkles' | 'bell' | 'award' | 'check' | 'checkCircle' | 'x' | 'clock' | 'lock' | 'unlock' | 'chevR' | 'chevL' | 'chevD' | 'search' | 'plus' | 'edit' | 'trash' | 'users' | 'user' | 'settings' | 'shield' | 'chart' | 'card' | 'star' | 'alert' | 'refresh' | 'send' | 'eye' | 'logout' | 'upload' | 'mic' | 'sliders' | 'menu' | 'external' | 'expand' | 'calendar' | 'target' | 'zap' | 'globe' | 'key' | 'mail' | 'phone' | 'arrowR' | 'wallet' | 'trend' | 'clipboard' | 'list' | 'grid' | 'paperclip' | 'bot' | 'dot' | 'filter' | 'shieldCheck' | 'sun' | 'moon' | 'camera' | 'fingerprint' | 'quote' | 'back' | 'headset' | 'doc' | 'link' | 'image' | 'instagram' | 'tiktok' | 'facebook' | 'youtube' | 'linkedin' | 'xsocial' | 'whatsapp' | 'telegram' | 'rw_door' | 'rw_path' | 'rw_lines' | 'rw_resume' | 'rw_circle' | 'rw_seal';

const TRACES: Record<string, React.ReactNode> = {
  home: (
    <><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.7V21h14V9.7"/></>
  ),
  cap: (
    <><path d="M12 4 2 9l10 5 10-5-10-5Z"/><path d="M6 11.5V16c0 1.5 2.7 3 6 3s6-1.5 6-3v-4.5"/><path d="M22 9v5"/></>
  ),
  book: (
    <><path d="M4 19V5a2 2 0 0 1 2-2h13v16H6.5A2.5 2.5 0 0 0 4 21.5"/><path d="M4 19a2.5 2.5 0 0 1 2.5-2.5H19"/></>
  ),
  layers: (
    <><path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/></>
  ),
  play: (
    <><path d="M7 4.5v15l12-7.5L7 4.5Z"/></>
  ),
  pause: (
    <><path d="M8 5v14M16 5v14"/></>
  ),
  file: (
    <><path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8l-5-5Z"/><path d="M14 3v5h5"/></>
  ),
  download: (
    <><path d="M12 3v12m0 0 4-4m-4 4-4-4"/><path d="M4 17v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/></>
  ),
  video: (
    <><rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10 5-3v10l-5-3"/></>
  ),
  message: (
    <><path d="M21 12a8 8 0 0 1-8 8H4l2-3a8 8 0 1 1 15-5Z"/></>
  ),
  sparkles: (
    <><path d="M12 3l1.9 4.6L18.5 9l-4.6 1.9L12 15.5l-1.9-4.6L5.5 9l4.6-1.4L12 3Z"/><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15Z"/></>
  ),
  bell: (
    <><path d="M18 9a6 6 0 1 0-12 0c0 6-2.5 7-2.5 7h17S18 15 18 9Z"/><path d="M10 20a2.2 2.2 0 0 0 4 0"/></>
  ),
  award: (
    <><circle cx="12" cy="9" r="5.5"/><path d="m8.8 13.5-1.6 7 4.8-2.6 4.8 2.6-1.6-7"/></>
  ),
  check: (
    <><path d="m4.5 12.5 5 5 10-11"/></>
  ),
  checkCircle: (
    <><circle cx="12" cy="12" r="9"/><path d="m8.5 12.3 2.5 2.5 4.8-5"/></>
  ),
  x: (
    <><path d="M6 6l12 12M18 6 6 18"/></>
  ),
  clock: (
    <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></>
  ),
  lock: (
    <><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></>
  ),
  unlock: (
    <><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.7-1.5"/></>
  ),
  chevR: (
    <><path d="m9 5 7 7-7 7"/></>
  ),
  chevL: (
    <><path d="m15 5-7 7 7 7"/></>
  ),
  chevD: (
    <><path d="m5 9 7 7 7-7"/></>
  ),
  search: (
    <><circle cx="11" cy="11" r="7"/><path d="m20 20-3.8-3.8"/></>
  ),
  plus: (
    <><path d="M12 5v14M5 12h14"/></>
  ),
  edit: (
    <><path d="M4 20h4L20.5 7.5a2.1 2.1 0 0 0-3-3L5 17v3Z"/><path d="m14.5 6.5 3 3"/></>
  ),
  trash: (
    <><path d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13"/></>
  ),
  users: (
    <><circle cx="9" cy="8.5" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 5.5a3.5 3.5 0 0 1 0 6.6M17.5 14.5A6.5 6.5 0 0 1 21.5 20"/></>
  ),
  user: (
    <><circle cx="12" cy="8" r="4"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/></>
  ),
  settings: (
    <><circle cx="12" cy="12" r="3.2"/><path d="M19 12a7 7 0 0 0-.14-1.4l2-1.55-2-3.5-2.4 1a7 7 0 0 0-2.4-1.4L13.7 2h-3.4l-.36 2.6a7 7 0 0 0-2.4 1.4l-2.4-1-2 3.5 2 1.55A7 7 0 0 0 5 12c0 .5.05.95.14 1.4l-2 1.55 2 3.5 2.4-1a7 7 0 0 0 2.4 1.4l.36 2.6h3.4l.36-2.6a7 7 0 0 0 2.4-1.4l2.4 1 2-3.5-2-1.55c.09-.45.14-.9.14-1.4Z"/></>
  ),
  shield: (
    <><path d="M12 3 4.5 6v5.5c0 4.7 3.2 8 7.5 9.5 4.3-1.5 7.5-4.8 7.5-9.5V6L12 3Z"/></>
  ),
  chart: (
    <><path d="M4 4v16h16"/><path d="M8 16v-5m4 5V8m4 8v-3"/></>
  ),
  card: (
    <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4"/></>
  ),
  star: (
    <><path d="m12 3 2.7 5.7 6.3.8-4.6 4.3 1.2 6.2L12 17l-5.6 3 1.2-6.2L3 9.5l6.3-.8L12 3Z"/></>
  ),
  alert: (
    <><path d="M12 4 2.5 20h19L12 4Z"/><path d="M12 10v4m0 3v.5"/></>
  ),
  refresh: (
    <><path d="M20 12a8 8 0 1 1-2.34-5.66M20 4v4h-4"/></>
  ),
  send: (
    <><path d="M21 3 3.5 10.5l6.5 3 3 6.5L21 3Z"/><path d="m10 14 4-4"/></>
  ),
  eye: (
    <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/></>
  ),
  logout: (
    <><path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3"/><path d="m15 8 4 4-4 4m4-4H9"/></>
  ),
  upload: (
    <><path d="M12 16V4m0 0-4 4m4-4 4 4"/><path d="M4 17v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/></>
  ),
  mic: (
    <><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></>
  ),
  sliders: (
    <><path d="M4 8h9m4 0h3M4 16h3m4 0h9"/><circle cx="15" cy="8" r="2"/><circle cx="9" cy="16" r="2"/></>
  ),
  menu: (
    <><path d="M4 7h16M4 12h16M4 17h16"/></>
  ),
  external: (
    <><path d="M14 4h6v6M20 4 11 13"/><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/></>
  ),
  expand: (
    <><path d="M4 9V4h5"/><path d="M20 9V4h-5"/><path d="M4 15v5h5"/><path d="M20 15v5h-5"/></>
  ),
  calendar: (
    <><rect x="4" y="5" width="16" height="16" rx="2"/><path d="M4 10h16M8 3v4m8-4v4"/></>
  ),
  target: (
    <><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2"/></>
  ),
  zap: (
    <><path d="M13 2 4.5 13.5H11L9.5 22 19 10h-6.5L13 2Z"/></>
  ),
  globe: (
    <><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14.5 14.5 0 0 1 0 18 14.5 14.5 0 0 1 0-18Z"/></>
  ),
  key: (
    <><circle cx="8" cy="14" r="4.5"/><path d="m11.5 10.5 8-8M17 5l2.5 2.5M14 8l2 2"/></>
  ),
  mail: (
    <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/></>
  ),
  phone: (
    <><path d="M6 3h4l1.5 5L9 10a12 12 0 0 0 5 5l2-2.5 5 1.5v4a2 2 0 0 1-2 2A16 16 0 0 1 4 5a2 2 0 0 1 2-2Z"/></>
  ),
  arrowR: (
    <><path d="M4 12h16m0 0-6-6m6 6-6 6"/></>
  ),
  wallet: (
    <><path d="M20 7H5a2 2 0 0 1 0-4h13v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16V7"/><path d="M16 14h4"/></>
  ),
  trend: (
    <><path d="m3 17 6-6 4 4 8-8"/><path d="M15 7h6v6"/></>
  ),
  clipboard: (
    <><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4a3 3 0 0 1 6 0"/><path d="M9 11h6M9 15h4"/></>
  ),
  list: (
    <><path d="M8 6h13M8 12h13M8 18h13"/><path d="M3.5 6h.01M3.5 12h.01M3.5 18h.01"/></>
  ),
  grid: (
    <><rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/></>
  ),
  paperclip: (
    <><path d="m20 11.5-8.2 8.2a5 5 0 0 1-7-7l8.9-8.9a3.3 3.3 0 0 1 4.7 4.7L9.5 17.4a1.7 1.7 0 0 1-2.4-2.4l7.8-7.8"/></>
  ),
  bot: (
    <><rect x="4" y="8" width="16" height="11" rx="3"/><path d="M12 8V4m-6 4 0-2m12 2 0-2"/><circle cx="9" cy="13" r="1"/><circle cx="15" cy="13" r="1"/><path d="M9.5 16.5h5"/></>
  ),
  dot: (
    <><circle cx="12" cy="12" r="5" fill="currentColor" stroke="none"/></>
  ),
  filter: (
    <><path d="M3 5h18l-7 8v6l-4 2v-8L3 5Z"/></>
  ),
  shieldCheck: (
    <><path d="M12 3 4.5 6v5.5c0 4.7 3.2 8 7.5 9.5 4.3-1.5 7.5-4.8 7.5-9.5V6L12 3Z"/><path d="m9 12 2.2 2.2 4-4.4"/></>
  ),
  sun: (
    <><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></>
  ),
  moon: (
    <><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"/></>
  ),
  camera: (
    <><path d="M4 8h3l2-3h6l2 3h3v12H4V8Z"/><circle cx="12" cy="13" r="3.5"/></>
  ),
  fingerprint: (
    <><path d="M7 19c-1-2-1.5-4.5-1.5-7A6.5 6.5 0 0 1 12 5.5 6.5 6.5 0 0 1 18.5 12c0 2.5-.5 5-1.5 7"/><path d="M9.5 20.5c-.7-2.5-1-5-1-8.5a3.5 3.5 0 0 1 7 0c0 3.5-.3 6-1 8.5"/><path d="M12 12v4"/></>
  ),
  quote: (
    <><path d="M9 7H5.5A1.5 1.5 0 0 0 4 8.5v4A1.5 1.5 0 0 0 5.5 14H8v2.5A2.5 2.5 0 0 1 5.5 19"/><path d="M20 7h-3.5A1.5 1.5 0 0 0 15 8.5v4a1.5 1.5 0 0 0 1.5 1.5H19v2.5a2.5 2.5 0 0 1-2.5 2.5"/></>
  ),
  back: (
    <><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></>
  ),
  headset: (
    <><path d="M4 13a8 8 0 0116 0"/><rect x="2.5" y="12" width="4.5" height="7" rx="2.2"/><rect x="17" y="12" width="4.5" height="7" rx="2.2"/><path d="M19.5 19v1.2a3.2 3.2 0 01-3.2 3.2h-3.1"/><circle cx="12.4" cy="23.4" r="1.3"/></>
  ),
  doc: (
    <><path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9z"/><path d="M14 3v6h6"/><path d="M9 13h6M9 17h6"/></>
  ),
  link: (
    <><path d="M10 13a5 5 0 007.5.5l3-3a5 5 0 00-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 00-7.5-.5l-3 3a5 5 0 007 7l1.7-1.7"/></>
  ),
  image: (
    <><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></>
  ),
  instagram: (
    <><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.2" cy="6.8" r="0.7" fill="currentColor" stroke="none"/></>
  ),
  tiktok: (
    <><path d="M15 4c.5 2.6 2.1 4.1 4.6 4.4"/><path d="M15 4v10.5a3.9 3.9 0 11-3.9-3.9"/></>
  ),
  facebook: (
    <><path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z"/></>
  ),
  youtube: (
    <><rect x="2.5" y="6" width="19" height="12" rx="3.2"/><path d="M10 9.5l5 2.5-5 2.5z" fill="currentColor"/></>
  ),
  linkedin: (
    <><rect x="3" y="3" width="18" height="18" rx="2.5"/><path d="M8 11v5M8 8v.01M12 16v-3a2 2 0 014 0v3"/></>
  ),
  xsocial: (
    <><path d="M4 4l16 16"/><path d="M20 4L4 20"/></>
  ),
  whatsapp: (
    <><path d="M12 3a9 9 0 00-7.8 13.5L3 21l4.6-1.2A9 9 0 1012 3z"/><path d="M9 9c0 3.5 2.5 6 6 6l1.2-1.2-2-1.4-1 .7c-1-.6-1.8-1.4-2.4-2.4l.7-1-1.4-2z" fill="currentColor" stroke="none"/></>
  ),
  telegram: (
    <><path d="M21 4L3 11.5l5.5 2L10 19l3-3.5 4.5 3z"/></>
  ),
  rw_door: (
    <><path d="M4 21h16"/><path d="M7 21V5a2 2 0 012-2h6a2 2 0 012 2v16"/><path d="M12 4v17" stroke-dasharray="1.5 3.2" opacity=".7"/></>
  ),
  rw_path: (
    <><path d="M4 19c3 0 4.2-3.2 7-5.2s5.8-3.4 8.6-3.6"/><circle cx="19.6" cy="9.6" r="1.5" fill="currentColor" stroke="none"/></>
  ),
  rw_lines: (
    <><path d="M5 20v-6M9.7 20v-8.5M14.4 20V9M19 20V6"/></>
  ),
  rw_resume: (
    <><path d="M3 16h5.2"/><path d="M13.2 16H21"/><path d="M9.4 16a3.1 3.1 0 016.2 0" opacity=".6"/></>
  ),
  rw_circle: (
    <><path d="M12 4a8 8 0 108 8"/><path d="M20 12a8 8 0 00-2.4-5.7" opacity=".4"/></>
  ),
  rw_seal: (
    <><circle cx="12" cy="12" r="8.2"/><circle cx="12" cy="12" r="5.6" opacity=".45"/><path d="M9.4 12.2l1.9 1.9 3.6-3.9"/></>
  ),
};

/** Équivalent React de la fonction `icon(name, size, cls)` du prototype. */
export function Icon({ nom, taille = 18, className = '' }: { nom: NomIcone; taille?: number; className?: string }) {
  return (
    <svg
      className={`ic ${className}`.trim()}
      width={taille}
      height={taille}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {TRACES[nom] ?? null}
    </svg>
  );
}
