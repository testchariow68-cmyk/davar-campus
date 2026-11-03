/* ============================================================
   DAVAR ACADÉMIE CAMPUS — Couche données (démo)
   En production : Supabase (Postgres + RLS), R2 pour les vidéos.
   ============================================================ */
const DAY = 86400000;
const ACCESS_MONTHS = 12; /* conditions Davar : accès 12 mois à partir de l'achat */
const DB_KEY = 'davar_campus_v1';
const _now = Date.now();

function uid() { return 'id-' + Math.random().toString(36).slice(2, 9); }
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function fmtMoney(n) { return n.toLocaleString('fr-FR') + ' FCFA'; }
function fmtDate(ts) { return new Date(ts).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }); }
function fmtDT(ts) { return new Date(ts).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) + ' · ' + new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); }
function timeAgo(ts) {
  const d = Date.now() - ts, m = Math.floor(d / 60000), h = Math.floor(d / 3600000), j = Math.floor(d / DAY);
  if (m < 1) return 'à l’instant'; if (m < 60) return `il y a ${m} min`; if (h < 24) return `il y a ${h} h`;
  if (j === 1) return 'hier'; if (j < 30) return `il y a ${j} j`; return fmtDate(ts);
}

/* ------------------------- SEED ------------------------- */
function seedState() {
  return {
    version: 5,
    session: null,
    settings: {
      platform: 'Davar Académie Campus', pushEnabled: false,
      support: {
        whatsapp: 'https://wa.me/message/CGJIVYULI4QKN1',
        phone: '+225 0585375999',
        email: 'support.davaracademie@gmail.com'
      },
      emails: {
        support: 'support@davarcampus.co',
        contact: 'contact@davarcampus.co',
        infos: 'infos@davarcampus.co',
        direction: 'direction@davarcampus.co'
      },
      socials: [
        { id: 'soc-1', platform: 'Instagram', link: 'https://instagram.com/davaracademie' },
        { id: 'soc-2', platform: 'TikTok', link: 'https://tiktok.com/@davaracademie' },
        { id: 'soc-3', platform: 'Facebook', link: 'https://facebook.com/davaracademie' }
      ],
      announcement: { text: '', audience: 'all' },
      motivations: [
        'La parole est une arme : apprends à la viser juste.',
        'Ce n’est pas le talent qui brille, c’est la constance.',
        'Un orateur ne naît pas, il se construit — module après module.',
        'Ta voix porte plus loin que tes doutes.',
        'Chaque dimanche, une marche de plus vers ton excellence.',
        'Le trac est la preuve que tu es vivant : utilise-le.',
        'Parle peu, dis vrai, frappe juste.',
        'Ton histoire mérite d’être entendue : entraîne-toi.',
        'La discipline bat la motivation quand la motivation s’endort.',
        'Écoute deux fois, parle une fois, prépare-toi dix fois.'
      ],
      motivationsIndex: 0,
      chariow: {
        enabled: true,
        note: 'Le 1er achat se fait EN DEHORS de l’app : tout achat Chariow (une formation ou le coaching) crée le premier accès de l’étudiant ; le webhook débloque ensuite la formation achetée. Dans l’app, les achats suivants passent par Flutterwave (voie universelle).',
        coachingBooking: 'https://d-ueo.mychariow.co/prd_ma8xximn/booking',
        pulseSecret: '',
        pulseEvents: ['successful.sale']
      },
      /* Flutterwave — VOIE UNIVERSELLE par défaut : le 1er achat se fait hors de l'app (Chariow, il donne accès à la
         plateforme) ; dans l'app, tous les achats passent par Flutterwave (mobile money Afrique + cartes internationales).
         modes : 'all' = universel (recommandé) | 'cards' = cartes seulement | 'fallback' = simple alternative (repli MF/Chariow) */
      flutterwave: {
        enabled: true,
        mode: 'all',
        apiKey: '',
        webhookSecret: '',
        apiUrl: 'https://api.flutterwave.com/v3/payments'
      },
      appscript: {
        mailUrl: 'https://script.google.com/macros/s/AKfycbzCZv3WlIplI_QDlvNEDnQ4t5K7bVIdnFMcXhQb6KWQlNbImfOb1-fgQ1cuJFHHOb_G3Q/exec',
        certUrl: 'https://script.google.com/macros/s/AKfycbyQ3KuAXQHjPliEMCWjq_seH1enje5G3Jv1P2Y3wUVLSwhTvLhH1RslpZGqwRYigfBX/exec'
      }
    },
    certRequests: [],
    supportThreads: [],
    auditLog: [],
    socialSubs: {},
    invites: [],
    activeTraining: {},
    readPos: { 'u-awa': { 'bk-ora': 17 } },
    audioPos: { 'u-awa': { 'au-ora': 43 } },
    resources: [
      { id: 'bk-ora', type: 'book', title: 'L’Art de parler en public', pages: 24, cover: null, assignedTo: ['u-awa'], trainingId: 't-marketing' },
      { id: 'au-ora', type: 'audio', title: 'Respiration & ancrage — séance guidée', duration: '12:40', cover: null, src: 'assets/au-ora.wav', assignedTo: ['u-awa'], trainingId: 't-marketing' }
    ],
    rewards: [],
    reviews: [],
    reviewAsked: {},
    pedLast: {},
    pedDays: {},
    reminderCycle: {},
    returnCount: {},
    retryFlag: {},
    pendingReveal: {},
    rewardSettings: { absenceDays: 14, reg: { periodDays: 14, minActiveDays: 3 } },
    accountTtlDays: 365,
    /* ---- DAVAR DATA LIFECYCLE & PURGE ENGINE ---- */
    lifecycle: {
      lastRun: 0,
      limits: { audio: 20 * 1048576, video: 128 * 1048576, doc: 10 * 1048576 },
      docExt: ['pdf', 'doc', 'docx', 'odt', 'txt', 'rtf', 'ppt', 'pptx', 'xls', 'xlsx', 'csv'],
      abandonedHours: 24,
      aiConvDays: 90, coachConvMonths: 12,
      notifReadHours: 48, notifMaxDays: 180,
      techLogDays: 90, secLogMonths: 12,
      accountGraceMonths: 12, quarantineDays: 7,
      certRetentionYears: 30
    },
    files: [], fileBlobs: {}, purgeLog: [], purgePending: [],
    anonymStats: { accountsPurged: 0, aiConvPurged: 0, coachConvPurged: 0, aiRequests: 0, completionsByTraining: {} },
    aiConfig: {
      provider: 'groq', status: 'connected', model: 'Llama 3 (Groq · gratuit)',
      defaultName: 'Monsieur Koffi', customName: '', hue: 265, temperature: 0.4,
      /* Chaîne de secours : mêmes consignes, mêmes ressources, mêmes réponses (~99 %).
         Si le quota journalier du 1er est atteint, le 2e prend le relais automatiquement ;
         le lendemain, le quota du 1er est réinitialisé et il reprend la main. */
      fallbackChain: ['groq', 'gemini', 'openrouter', 'hf'],
      photo: '', transcription: 'groq-whisper',
      kb: { 't-marketing': true, 't-excel': true, 't-entreprendre': false, 't-anglais': false, 't-orateur': true }
    },
    users: [
      { id: 'u-awa', name: 'Awa Koné', email: 'awa.kone@gmail.com', role: 'student', phone: '+225 07 59 20 41 83', country: 'Côte d’Ivoire', dial: '+225', paySource: 'chariow', joined: _now - 94 * DAY, color: 'var(--ava-1)', lastLogin: _now - 4 * 3600000 },
      { id: 'u-ibrahim', name: 'Ibrahim Diallo', email: 'ibrahim.diallo@yahoo.fr', role: 'student', phone: '+221 77 55 45 08', country: 'Sénégal', dial: '+221', paySource: 'chariow', joined: _now - 61 * DAY, color: '#2B6CB0', lastLogin: _now - 28 * 3600000 },
      { id: 'u-mariam-s', name: 'Mariam Sidibé', email: 'mariam.sidibe@gmail.com', role: 'student', phone: '+225 07 08 55 21 07', joined: _now - 48 * DAY, color: '#B83280', lastLogin: _now - 72 * 3600000 },
      { id: 'u-jean-k', name: 'Jean Kouassi', email: 'jean.kouassi@outlook.com', role: 'student', phone: '+225 01 02 33 76 54', joined: _now - 30 * DAY, color: '#1F8A4C', lastLogin: _now - 9 * 3600000 },
      { id: 'u-aicha', name: 'Aïcha Bamba', email: 'aicha.bamba@gmail.com', role: 'student', phone: '+225 07 71 40 18 22', joined: _now - 12 * DAY, color: '#B7791F', lastLogin: _now - 2 * 3600000 },
      { id: 'u-serge-n', name: 'Serge N’Guessan', email: 'serge.nguessan@gmail.com', role: 'student', phone: '+225 05 61 09 84 40', joined: _now - 5 * DAY, color: '#C0392B', lastLogin: _now - 120 * 3600000 },
      { id: 'u-yann', name: 'YAPO SERGE TRÉSOR', email: 'tresorsergeyapo2@gmail.com', role: 'admin', title: 'Fondateur · Super Administrateur', joined: _now - 400 * DAY, color: 'var(--ava-sa)', password: 'DAVAR@2026' },
      { id: 'u-coach', name: 'Mariam Touré', email: 'm.toure@davar-academie.ci', role: 'staff', title: 'Coach principale', joined: _now - 300 * DAY, color: 'var(--ava-2)' },
      /* Comptes TEST — exactement un par dashboard d'équipe possible (une seule combinaison de rôle).
         Ils permettent au Super Admin et au Manager de tout tester. Jamais supprimés par la purge. */
      { id: 'u-test-coach', name: 'Coach (test)', email: 'coach.test@davarcampus.co', role: 'staff', title: 'Compte test — Coach', joined: _now - 20 * DAY, color: 'var(--ava-2)', lastLogin: _now - 3 * 3600000 },
      { id: 'u-test-correcteur', name: 'Correcteur (test)', email: 'correcteur.test@davarcampus.co', role: 'staff', title: 'Compte test — Correcteur', joined: _now - 20 * DAY, color: '#2B6CB0', lastLogin: _now - 5 * 3600000 },
      { id: 'u-test-assistant', name: 'Assistant (test)', email: 'assistant.test@davarcampus.co', role: 'staff', title: 'Compte test — Assistant pédagogique', joined: _now - 20 * DAY, color: '#1F8A4C', lastLogin: _now - 26 * 3600000 },
      { id: 'u-test-contenu', name: 'Contenu (test)', email: 'contenu.test@davarcampus.co', role: 'staff', title: 'Compte test — Responsable de contenu', joined: _now - 20 * DAY, color: '#B7791F', lastLogin: _now - 30 * 3600000 },
      { id: 'u-test-support', name: 'Support (test)', email: 'support.test@davarcampus.co', role: 'staff', title: 'Compte test — Support', joined: _now - 20 * DAY, color: '#B83280', lastLogin: _now - 1 * 3600000 },
      { id: 'u-test-analyste', name: 'Analyste (test)', email: 'analyste.test@davarcampus.co', role: 'staff', title: 'Compte test — Analyste', joined: _now - 20 * DAY, color: '#C0392B', lastLogin: _now - 49 * 3600000 },
      { id: 'u-test-manager', name: 'Manager (test)', email: 'manager.test@davarcampus.co', role: 'staff', title: 'Compte test — Manager', joined: _now - 20 * DAY, color: 'var(--ava-sa)', lastLogin: _now - 2 * 3600000 },
      { id: 'u-test-etudiant', name: 'Étudiant (test)', email: 'etudiant.test@davarcampus.co', role: 'student', country: 'Côte d’Ivoire', dial: '+225', joined: _now - 40 * DAY, color: 'var(--ava-1)', lastLogin: _now - 6 * 3600000, test: true }
    ],
    team: [
      { id: 'tm-1', name: 'Mariam Touré', email: 'm.toure@davar-academie.ci', roles: ['coach', 'correcteur'], color: 'var(--ava-2)' },
      { id: 'tm-2', name: 'Jean-Baptiste Koffi', email: 'jb.koffi@davar-academie.ci', roles: ['contenu'], color: '#2B6CB0' },
      { id: 'tm-3', name: 'Fatou Traoré', email: 'f.traore@davar-academie.ci', roles: ['support'], color: '#B83280' },
      { id: 'tm-4', name: 'Serge Adou', email: 's.adou@davar-academie.ci', roles: ['analyste', 'assistant'], color: '#1F8A4C' },
      { id: 'tm-t1', name: 'Coach (test)', email: 'coach.test@davarcampus.co', roles: ['coach'], color: 'var(--ava-2)', test: true },
      { id: 'tm-t2', name: 'Correcteur (test)', email: 'correcteur.test@davarcampus.co', roles: ['correcteur'], color: '#2B6CB0', test: true },
      { id: 'tm-t3', name: 'Assistant (test)', email: 'assistant.test@davarcampus.co', roles: ['assistant'], color: '#1F8A4C', test: true },
      { id: 'tm-t4', name: 'Contenu (test)', email: 'contenu.test@davarcampus.co', roles: ['contenu'], color: '#B7791F', test: true },
      { id: 'tm-t5', name: 'Support (test)', email: 'support.test@davarcampus.co', roles: ['support'], color: '#B83280', test: true },
      { id: 'tm-t6', name: 'Analyste (test)', email: 'analyste.test@davarcampus.co', roles: ['analyste'], color: '#C0392B', test: true },
      { id: 'tm-t7', name: 'Manager (test)', email: 'manager.test@davarcampus.co', roles: ['manager'], color: 'var(--ava-sa)', test: true }
    ],
    trainings: [
      {
      /* DÉCISION DU PROPRIÉTAIRE (6 octobre 2026) : quatre formations retirées —
         Marketing Digital, Excel & Analyse de données, Créer son entreprise, Anglais
         professionnel. Seule « Devenir un excellent orateur » subsiste. Le fichier
         d'origine les contenait ; elles sont retirées ici pour qu'aucune copie de
         travail ne les réintroduise un jour. */
        id: 't-orateur', code: 'OR-101', abbr: 'ORA', title: 'Devenir un excellent orateur', mono: 'OR',
        desc: 'La formation signature DAVAR : vaincre le trac, structurer un discours, captiver n’importe quel auditoire.',
        longDesc: 'Le programme phare de DAVAR Académie. Pas à pas : gestion du trac, structure du message, travail de la voix et du corps, figures de rhétorique, gestion des questions. Chaque module est illustré par une vidéo principale filmée par nos coachs.',
        /* Prix réel : 39 900 FCFA — porté par la page de vente officielle, JAMAIS affiché dans l'application. */
        level: 'Tous niveaux', hours: 12, price: 39900, published: false, hue: 268, students: 0, rating: null,
        chariow_url: 'https://d-ueo.mychariow.co/prd_6wx1czzp/checkout',
        chapters: [
          {
            id: 'c1', title: 'Maîtriser les fondamentaux',
            modules: [
              { id: 'm1-1', title: 'Vaincre le trac et occuper l’espace', duration: '14:20', ratio: '16:9', videoUrl: '', text: 'Le trac est une énergie : on ne le supprime pas, on le convertit. Respiration, ancrage, premier regard : les gestes qui installent votre autorité naturelle dès les premières secondes.', resources: [{ name: 'Fiche respiration & ancrage (PDF)', type: 'pdf', size: '1,1 Mo' }], extraVideos: [{ title: 'Complément : la posture de l’orateur (vidéo test)', duration: '6:00', ratio: '16:9', url: 'https://www.youtube.com/watch?v=EohCLg3dqeI' }] },
              { id: 'm1-2', title: 'Structurer un message qui porte', duration: '16:45', ratio: '16:9', videoUrl: '', text: 'Un auditoire retient trois idées, pas dix. Apprenez la colonne vertébrale d’un discours : accroche, promesse, démonstration, appel à l’action.', resources: [{ name: 'Template de plan de discours (DOC)', type: 'doc', size: '480 Ko' }], extraVideos: [] }
            ],
            exercise: {
              id: 'ex-c1', title: 'Exercice — Votre première accroche', intro: 'Rédigez une accroche de 30 secondes sur un sujet de votre choix. Cet exercice ne bloque pas la suite.',
              questions: [
                { q: 'Quel type d’accroche capte le mieux l’attention dans les 10 premières secondes ?', options: ['Une citation longue', 'Une question ou une histoire vécue', 'La lecture du plan complet', 'Des remerciements détaillés'], answer: 1, explain: 'Question, anecdote ou chiffre surprenant : l’auditoire se projette immédiatement.' },
                { q: 'Combien d’idées fortes un auditoire retient-il en moyenne ?', options: ['Une seule', 'Trois', 'Sept', 'Dix'], answer: 1, explain: 'La règle des trois idées : structurez toujours autour de trois piliers maximum.' }
              ]
            },
            assessment: {
              id: 'ev-c1', title: 'Évaluation — Analyse d’un discours', type: 'quiz', minScore: 70, intro: 'Évaluation bloquante : identifiez les techniques employées dans un extrait de discours. Minimum 70 % pour continuer.',
              questions: [
                { q: 'Dans un bon discours, la promesse annoncée au début doit…', options: ['Être oubliée pour surprendre', 'Être tenue et rappelée à la fin', 'Contredire l’accroche', 'N’apparaître qu’à la fin'], answer: 1, explain: 'La boucle promesse→réalisation crée la satisfaction et la confiance de l’auditoire.' },
                { q: 'Le silence avant une idée forte sert à…', options: ['Combler un trou de mémoire', 'Donner du poids à l’idée qui suit', 'Faire durer le discours', 'Rien de particulier'], answer: 1, explain: 'Le silence est un outil de ponctuation orale : il prépare l’écoute.' },
                { q: 'Une conclusion efficace contient…', options: ['De nouvelles idées', 'Un résumé + un appel à l’action clair', 'Des excuses pour la longueur', 'La liste des sources'], answer: 1, explain: 'Résumer les trois idées puis donner une action concrète : c’est ce que l’auditoire emporte.' }
              ]
            }
          },
          {
            id: 'c2', title: 'Captiver par la voix et le corps',
            modules: [
              { id: 'm2-1', title: 'La voix : rythme, volume, silences', duration: '15:10', ratio: '16:9', videoUrl: '', text: 'Votre voix est un instrument : variations de rythme pour l’énergie, baisses de volume pour l’intimité, silences pour la gravité. Exercices pratiques inclus.', resources: [], extraVideos: [{ title: 'Échauffement vocal en 5 minutes', duration: '5:00', ratio: '16:9' }] },
              { id: 'm2-2', title: 'Le corps : gestes, regards, déplacements', duration: '13:35', ratio: '16:9', videoUrl: '', text: 'Les mains ouvertes convainquent, le regard distribué inclut, le déplacement maîtrisé structure l’espace. Filmez-vous et comparez.', resources: [{ name: 'Grille d’auto-évaluation vidéo (PDF)', type: 'pdf', size: '600 Ko' }], extraVideos: [] }
            ]
          },
          {
            id: 'c3', title: 'Devenir excellent',
            modules: [
              { id: 'm3-1', title: 'Figures de rhétorique qui marquent', duration: '17:05', ratio: '16:9', videoUrl: '', text: 'Anaphore, tricolon, antithèse, question rhétorique : les figures qui rendent un discours mémorable, avec exemples décortiqués.', resources: [{ name: 'Répertoire des figures (PDF)', type: 'pdf', size: '2,0 Mo' }], extraVideos: [] },
              { id: 'm3-2', title: 'Gérer les questions et l’imprévu', duration: '12:50', ratio: '16:9', videoUrl: '', text: 'Techniques de la passerelle, honnêteté structurée, reformulation : transformez chaque question en opportunité de renforcer votre message.', resources: [], extraVideos: [] }
            ],
            assessment: {
              id: 'ev-c3', title: 'Évaluation finale — Votre discours de 3 minutes', type: 'submission', intro: 'Travail à soumettre : enregistrez un discours de 3 minutes appliquant les techniques du programme. Un coach vous évalue personnellement (validation humaine).',
              brief: 'Choisissez un sujet qui vous tient à cœur. Votre discours doit contenir : une accroche, une promesse, trois idées fortes, une figure de rhétorique et un appel à l’action. Format : vidéo (mp4) ou audio (mp3).',
              rubric: ['Structure du message (25 pts)', 'Voix : rythme et silences (25 pts)', 'Corps : gestes et regard (25 pts)', 'Impact et mémorabilité (25 pts)'], minScore: 70
            }
          }
        ]
      }
    ],
    enrollments: [
      { userId: 'u-awa', trainingId: 't-marketing', at: _now - 40 * DAY },
      { userId: 'u-awa', trainingId: 't-excel', at: _now - 90 * DAY },
      { userId: 'u-test-etudiant', trainingId: 't-marketing', at: _now - 40 * DAY },
      { userId: 'u-test-etudiant', trainingId: 't-excel', at: _now - 90 * DAY },
      { userId: 'u-ibrahim', trainingId: 't-marketing', at: _now - 55 * DAY },
      { userId: 'u-ibrahim', trainingId: 't-entreprendre', at: _now - 20 * DAY },
      { userId: 'u-mariam-s', trainingId: 't-excel', at: _now - 44 * DAY },
      { userId: 'u-jean-k', trainingId: 't-marketing', at: _now - 26 * DAY },
      { userId: 'u-aicha', trainingId: 't-anglais', at: _now - 11 * DAY },
      { userId: 'u-serge-n', trainingId: 't-excel', at: _now - 4 * DAY }
    ],
    progress: {
      'u-awa': {
        'm1-1': { viewed: true, pct: 100, at: _now - 36 * DAY },
        'm1-2': { viewed: true, pct: 100, at: _now - 33 * DAY },
        'm2-1': { viewed: true, pct: 100, at: _now - 21 * DAY }
      },
      'u-test-etudiant': {
        'm1-1': { viewed: true, pct: 100, at: _now - 36 * DAY },
        'm1-2': { viewed: true, pct: 100, at: _now - 33 * DAY },
        'm2-1': { viewed: true, pct: 100, at: _now - 21 * DAY }
      },
      'u-ibrahim': {
        'm1-1': { viewed: true, pct: 100, at: _now - 50 * DAY },
        'm1-2': { viewed: true, pct: 100, at: _now - 46 * DAY },
        'm2-1': { viewed: true, pct: 100, at: _now - 39 * DAY },
        'm2-2': { viewed: true, pct: 100, at: _now - 30 * DAY },
        'm2-3': { viewed: true, pct: 100, at: _now - 24 * DAY }
      },
      'u-mariam-s': { 'm1-1': { viewed: true, pct: 100, at: _now - 40 * DAY }, 'm1-2': { viewed: true, pct: 100, at: _now - 32 * DAY } },
      'u-jean-k': { 'm1-1': { viewed: true, pct: 100, at: _now - 20 * DAY } },
      'u-serge-n': { 'm1-1': { viewed: true, pct: 100, at: _now - 3 * DAY } }
    },
    exAttempts: {
      'u-awa': { 'ex-c1': [{ score: 4, total: 4, at: _now - 31 * DAY }] }
    },
    evAttempts: {
      'u-ibrahim': { 'ev-c2': [{ score: 4, total: 5, pct: 80, passed: true, at: _now - 18 * DAY }] }
    },
    submissions: [
      { id: 'sub-1', userId: 'u-ibrahim', trainingId: 't-marketing', evId: 'ev-c3', file: 'calendrier_editorial_kinimo.pdf', size: '1,4 Mo', note: 'Marque fictive : jus Kinimo. J’ai prévu 4 publications/semaine.', status: 'pending', at: _now - 2 * DAY, feedback: null }
    ],
    threads: [
      {
        id: 'th-1', userId: 'u-awa', trainingId: 't-marketing', moduleId: 'm2-2', resolved: false, aiValidated: false,
        messages: [
          { id: uid(), from: 'student', text: 'Comment choisir la bonne fréquence de publication sans saturer mon audience ?', at: _now - 1 * DAY },
          { id: uid(), from: 'ai', text: 'Excellente question 👌 Pour une audience professionnelle, la régularité compte plus que le volume :\n\n1. Commencez par 2 à 3 publications par semaine, sur 1 ou 2 plateformes seulement.\n2. Gardez 3 piliers de contenu fixes (ex. éducatif, coulisses, offre) et alternez.\n3. Surveillez la portée et l’engagement sur 3 semaines : si les indicateurs baissent, réduisez la fréquence.\n\nLe modèle de calendrier éditorial fourni dans ce module vous aidera à planifier tout cela.', at: _now - 1 * DAY + 60000 }
        ]
      },
      {
        id: 'th-2', userId: 'u-awa', trainingId: 't-marketing', moduleId: 'm2-2', resolved: false, aiValidated: false,
        messages: [
          { id: uid(), from: 'student', text: 'Coach, pouvez-vous me dire si mon positionnement tarifaire est cohérent pour une activité de pâtisserie à Cocody ?', at: _now - 3 * DAY, coach: true }
        ]
      }
    ],
    notifs: [
      { id: uid(), userId: 'u-awa', type: 'cert', title: 'Certificat disponible', body: 'Votre certificat « Excel & Analyse de données » est prêt.', at: _now - 15 * DAY, read: true },
      { id: uid(), userId: 'u-awa', type: 'exercise', title: 'Exercice corrigé', body: 'Exercice du chapitre 1 : 4/4, excellent travail.', at: _now - 31 * DAY, read: true },
      { id: uid(), userId: 'u-awa', type: 'coach', title: 'Rappel', body: 'Vous n’avez pas consulté le module « Créer un calendrier éditorial » depuis 5 jours.', at: _now - 1 * DAY, read: false },
      { id: uid(), userId: 'u-yann', type: 'admin', title: 'Soumission en attente', body: 'Ibrahim Diallo a soumis son travail final (Marketing Digital).', at: _now - 2 * DAY, read: false },
      { id: uid(), userId: 'u-yann', type: 'admin', title: 'Question au coach', body: 'Awa Koné attend une réponse de son coach.', at: _now - 3 * DAY, read: false }
    ],
    certs: [
      { id: uid(), code: 'CERT-2026-0147', userId: 'u-awa', trainingId: 't-excel', issuedAt: _now - 15 * DAY, status: 'actif', imageUrl: 'assets/cert-awa.png', holderName: 'Awa Koné', formationTitle: 'Excel — Tableaux de bord', pdfRef: 'assets/cert-awa.png', previewRef: 'assets/cert-awa.png', slideDeleted: true, frozen: true },
      { id: uid(), code: 'CERT-2026-0092', userId: 'u-mariam-s', trainingId: 't-excel', issuedAt: _now - 10 * DAY, status: 'actif' }
    ],
    sales: [
      { id: 'v-1042', userId: 'u-serge-n', email: 'serge.nguessan@gmail.com', trainingId: 't-excel', amount: 35000, method: 'Wave', status: 'confirmé', at: _now - 4 * DAY },
      { id: 'v-1041', userId: 'u-aicha', email: 'aicha.bamba@gmail.com', trainingId: 't-anglais', amount: 40000, method: 'Orange Money', status: 'confirmé', at: _now - 11 * DAY },
      { id: 'v-1040', userId: 'u-jean-k', email: 'jean.kouassi@outlook.com', trainingId: 't-marketing', amount: 45000, method: 'MTN MoMo', status: 'confirmé', at: _now - 26 * DAY },
      { id: 'v-1039', userId: 'u-ibrahim', email: 'ibrahim.diallo@yahoo.fr', trainingId: 't-entreprendre', amount: 55000, method: 'Carte bancaire', status: 'confirmé', at: _now - 20 * DAY }
    ],
    analytics: { activity: [18, 24, 16, 30, 26, 12, 8, 22, 34, 28, 19, 41, 37, 46] }
  };
}

/* ------------------------- ÉTAT ------------------------- */
let S;
function loadState() {
  try { const raw = localStorage.getItem(DB_KEY); if (raw) { const s = JSON.parse(raw); if (s.version === 5) return s; } } catch (e) { }
  return seedState();
}
let SYNC_AREAS = new Set();
function save(area) {
  if (area) SYNC_AREAS.add(area);
  S.rev = (S.rev || 0) + 1;
  S._areas = [...SYNC_AREAS];
  SYNC_AREAS.clear();
  try { localStorage.setItem(DB_KEY, JSON.stringify(S)); } catch (e) { }
  if (typeof syncChannel !== 'undefined' && syncChannel) syncChannel.postMessage({ rev: S.rev });
  if (typeof SYNC !== 'undefined') SYNC.rev = S.rev;
}
function resetDemo() { try { localStorage.removeItem(DB_KEY); } catch (e) { } S = loadState();
 save(); location.hash = '#/login'; render(); toast('Démo réinitialisée', 'ok'); }
S = loadState();
/* Migration : les profils existants reçoivent la 3ᵉ voie Flutterwave (si l'admin ne l'a pas déjà configurée) */
S.settings.flutterwave = S.settings.flutterwave || { enabled: true, mode: 'all', apiKey: '', webhookSecret: '', apiUrl: 'https://api.flutterwave.com/v3/payments' };
/* Passage en voie universelle pour les profils créés avant cette décision (respecte un mode choisi dès que des clés sont saisies) */
if (S.settings.flutterwave.mode === 'fallback' && !S.settings.flutterwave.apiKey && !S.settings.flutterwave.webhookSecret) S.settings.flutterwave.mode = 'all';
/* Historique d'analyse (démo) : bascules d'assistants virtuels + badges attribués — alimente le rôle Analyste */
if (!(S.auditLog || []).some(a => a.action === 'ai_fallback')) {
  S.auditLog.push(
    { id: uid(), actor: 'system', action: 'ai_fallback', payload: { from: 'groq', to: 'gemini' }, important: false, at: _now - 3 * DAY },
    { id: uid(), actor: 'system', action: 'ai_fallback', payload: { from: 'gemini', to: 'groq' }, important: false, at: _now - 1 * DAY });
}
if (!(S.auditLog || []).some(a => a.action === 'login')) {
  S.auditLog.push(
    { id: uid(), actor: 'u-awa', action: 'login', payload: null, important: false, at: _now - 1 * DAY },
    { id: uid(), actor: 'u-awa', action: 'login', payload: null, important: false, at: _now - 3 * DAY },
    { id: uid(), actor: 'u-awa', action: 'login', payload: null, important: false, at: _now - 6 * DAY },
    { id: uid(), actor: 'u-ibrahim', action: 'login', payload: null, important: false, at: _now - 2 * DAY },
    { id: uid(), actor: 'u-ibrahim', action: 'login', payload: null, important: false, at: _now - 9 * DAY },
    { id: uid(), actor: 'u-jean-k', action: 'login', payload: null, important: false, at: _now - 4 * DAY });
}
if (!(S.rewards || []).length) {
  S.rewards = [
    { id: 'rw-d1', userId: 'u-awa', badgeId: 'BADGE_FORMATION_01', at: _now - 9 * DAY, type: 'formation', source: '', trainingId: 't-marketing', moduleId: null, desc: 'Assiduité', mode: 'AUTOMATIQUE' },
    { id: 'rw-d2', userId: 'u-ibrahim', badgeId: 'BADGE_FORMATION_03', at: _now - 2 * DAY, type: 'formation', source: '', trainingId: 't-entreprendre', moduleId: null, desc: 'Progression', mode: 'MANUEL' }];
}
/* Interactions de cours : réactions emoji + commentaires publics (aucune notification) */
S.reactions = S.reactions || [
  { mid: 'm2-2', userId: 'u-ibrahim', emoji: '🔥' }, { mid: 'm2-2', userId: 'u-mariam-s', emoji: '🔥' },
  { mid: 'm2-2', userId: 'u-jean-k', emoji: '❤️' }, { mid: 'm2-2', userId: 'u-aicha', emoji: '👏' },
  { mid: 'm1-1', userId: 'u-ibrahim', emoji: '👍' }, { mid: 'm1-1', userId: 'u-serge-n', emoji: '🔥' }
];
S.comments = S.comments || [
  { id: 'c-s1', mid: 'm2-2', userId: 'u-ibrahim', text: 'Le modèle Excel fourni m’a fait gagner un temps fou, merci !', at: _now - 2 * DAY, replyTo: null },
  { id: 'c-s2', mid: 'm2-2', userId: 'u-mariam-s', text: 'Je bloque un peu sur le choix des piliers de contenu, des conseils ?', at: _now - DAY, replyTo: null },
  { id: 'c-s3', mid: 'm2-2', userId: 'u-jean-k', text: 'Mariam : 3 piliers maximum au début, sinon tu t’épuises. C’est ce que le coach nous a dit en séance.', at: _now - DAY + 3600e3, replyTo: 'c-s2' },
  { id: 'c-s4', mid: 'm2-2', userId: 'u-aicha', text: 'Ce cours devrait être obligatoire avant de lancer sa page 🔥', at: _now - 5 * 3600e3, replyTo: null }
];

/* ------------------------- ACCESSEURS ------------------------- */
const isSuspended = u => u && u.status === 'suspended';
/* Actions « importantes » : chaque occurrence alerte le Super Admin (et le Manager,
   sauf quand l'auteur EST le Super Admin — le Manager reçoit alors la décision).
   Sans Manager présent sur la plateforme, personne d'autre n'est alerté. */
const IMPORTANT_ACTIONS = ['cert_validate', 'cert_reject', 'user_status', 'member_remove', 'member_add',
  'role_toggle', 'invite', 'export', 'settings', 'purge', 'training_publish', 'training_price',
  'mail', 'refund', 'suspension', 'revoke', 'reset_demo'];
/* Le « vrai » Manager : membre actif, hors comptes test (les comptes test ne servent qu'aux vues) */
function realManager() {
  const managerEmails = S.team.filter(m => m.roles.includes('manager') && !m.test).map(m => m.email);
  return S.users.find(x => managerEmails.includes(x.email) && !isSuspended(x) && x.id.indexOf('u-test-') !== 0);
}
function recordAudit(action, payload) {
  const actor = S.session ? S.session.userId : 'system';
  S.auditLog.unshift({ id: uid(), actor, action, payload: payload || null, at: Date.now(), important: IMPORTANT_ACTIONS.includes(action) });
  if (!IMPORTANT_ACTIONS.includes(action) || typeof notify !== 'function' || typeof getUser !== 'function') return;
  const actorU = getUser(actor); if (!actorU) return;
  const isSuper = actorU.role === 'admin';
  const admin = S.users.find(u => u.role === 'admin');
  const manager = realManager();
  const detail = (payload && (payload.subject || payload.name || payload.data || payload.email)) || action;
  if (!isSuper && admin) notify(admin.id, 'staff', 'Action importante — ' + actorU.name, `${actionLabel(action)} : ${detail}`, { route: '#/admin/activites' });
  if (manager && manager.id !== actor) notify(manager.id, 'staff', (isSuper ? 'Décision du Super Admin — ' : 'Action importante — ') + actorU.name, `${actionLabel(action)} : ${detail}`, { route: '#/admin/activites' });
}
function actionLabel(a) {
  return ({ cert_validate: 'Certificat validé', cert_reject: 'Certificat refusé', user_status: 'Statut de compte modifié',
    member_remove: 'Membre retiré', member_add: 'Membre ajouté', role_toggle: 'Rôle modifié', invite: 'Invitation envoyée',
    export: 'Export de données', settings: 'Configuration modifiée', purge: 'Purge des données', training_publish: 'Publication de formation',
    training_price: 'Prix modifié', mail: 'E-mail envoyé', refund: 'Remboursement', suspension: 'Suspension', revoke: 'Révocation',
    reset_demo: 'Réinitialisation démo' })[a] || a;
}
/* Envoi d'e-mail via l'Apps Script Davar (bienvenue, invitation, suspension, certificat…).
   En démo : journalisé + toast ; en production : fetch(S.settings.appscript.mailUrl). */
function sendMailSim(to, subject, opts) {
  recordAudit('mail', { to, subject, from: (opts && opts.from) || null, flow: (opts && opts.flow) || null });
  const url = S.settings.appscript.mailUrl;
  if (url) { try { fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ to, subject, from: opts && opts.from, body: opts && opts.body }) }).catch(() => { }); } catch (e) { } }
}
const getUser = id => S.users.find(u => u.id === id);
const getTraining = id => S.trainings.find(t => t.id === id);
const isStaff = u => u && (u.role === 'admin' || u.role === 'staff');
const enrolledIn = (uidv, tid) => S.enrollments.some(e => e.userId === uidv && e.trainingId === tid);
const aiName = () => S.aiConfig.customName?.trim() || S.aiConfig.defaultName;

/* ============================================================
   CATALOGUE DES RÉCOMPENSES — entièrement préconfiguré.
   L'application n'invente jamais un nom, une icône, une couleur.
   ============================================================ */
const REWARD_DEFS = {
  BADGE_PREMIER_PAS: { id: 'BADGE_PREMIER_PAS', name: 'Premier Pas', cat: 'parcours', icon: 'rw_door',
    pal: ['var(--violet-deep)', '#F5F1E6', '#D9B662'],
    desc: 'Reconnaît la première entrée réelle dans le Campus, après l’activation de l’accès.',
    short: 'Vous avez choisi de commencer. Et tout parcours commence ainsi.',
    emotion: 'Il n’est pas nécessaire de savoir jusqu’où l’on ira pour faire le premier pas. Aujourd’hui, vous avez simplement décidé de commencer.',
    notifTitle: 'Une première étape commence', notifMsg: 'Premier Pas — Bienvenue dans votre parcours DAVAR.' },
  BADGE_EN_ROUTE: { id: 'BADGE_EN_ROUTE', name: 'En Route', cat: 'parcours', icon: 'rw_path',
    pal: ['#7B6CB7', '#5B6BB5', '#F5F1E6'],
    desc: 'Reconnaît le début réel du parcours pédagogique : un premier contenu appris, une première progression.',
    short: 'Vous n’êtes plus au point de départ. Vous êtes en chemin.',
    emotion: 'Un commencement devient un parcours lorsque l’on choisit d’avancer. Continuez à votre rythme. Chaque étape compte.',
    notifTitle: 'Nouvelle distinction', notifMsg: 'En Route — votre parcours a réellement commencé.' },
  BADGE_REGULARITE: { id: 'BADGE_REGULARITE', name: 'Régularité', cat: 'parcours', icon: 'rw_lines',
    pal: ['#9CAF97', 'var(--violet-deep)', '#C9A24B'],
    desc: 'Reconnaît une activité pédagogique régulière sur la période définie par l’administration.',
    short: 'Vous êtes présent, encore et encore. C’est ainsi que le progrès s’installe.',
    emotion: 'Les grandes transformations ne naissent pas toujours de grands efforts. Elles naissent souvent de petits efforts que l’on accepte de répéter.',
    notifTitle: 'Nouvelle distinction', notifMsg: 'Régularité — votre constance est reconnue.' },
  BADGE_PERSEVERANCE: { id: 'BADGE_PERSEVERANCE', name: 'Persévérance', cat: 'parcours', icon: 'rw_resume',
    pal: ['#B7791F', '#D9B662', '#2A1A4A'],
    desc: 'Reconnaît la reprise réussie après une difficulté pédagogique : l’étudiant a recommencé et a réussi.',
    short: 'Vous avez choisi de continuer.',
    emotion: 'Il y a des moments où avancer demande davantage de courage que de savoir. Vous avez rencontré une difficulté, vous avez repris votre chemin et vous êtes allé jusqu’au bout.',
    notifTitle: 'Nouvelle distinction', notifMsg: 'Persévérance — vous avez choisi de continuer.' },
  BADGE_RETOUR_EN_FORCE: { id: 'BADGE_RETOUR_EN_FORCE', name: 'Retour en Force', cat: 'parcours', icon: 'rw_circle',
    pal: ['#B87352', '#C99A8E', 'var(--violet-deep)', '#D9B662'],
    desc: 'Reconnaît le premier retour d’un étudiant après une longue absence (au moins 14 jours).',
    short: 'Vous êtes revenu. Et votre parcours est toujours là.',
    emotion: 'Parfois, la vie nous éloigne de nos projets. L’essentiel est de pouvoir revenir. Vous êtes de retour aujourd’hui, et la suite de votre parcours peut reprendre là où vous l’avez laissée.',
    notifTitle: 'Bon retour parmi nous', notifMsg: 'Votre retour est une nouvelle étape. Votre parcours vous attend.' },
  BADGE_MISSION_ACCOMPLIE: { id: 'BADGE_MISSION_ACCOMPLIE', name: 'Mission Accomplie', cat: 'accomplissement', icon: 'rw_seal',
    pal: ['#D9B662', '#F5F1E6', 'var(--violet-deep)'],
    desc: 'Reconnaît une grande étape pédagogique entièrement accomplie : une formation menée jusqu’au bout.',
    short: 'Une grande étape vient d’être franchie.',
    emotion: 'Vous aviez quelque chose à accomplir. Vous avez avancé jusqu’au bout. Prenez un instant pour mesurer le chemin parcouru.',
    notifTitle: 'Nouvelle distinction', notifMsg: 'Mission Accomplie — une grande étape est franchie.' },
  BADGE_FORMATION_01: { id: 'BADGE_FORMATION_01', name: 'Marketing Digital — Fondamentaux', cat: 'formation', icon: 'chart', pal: ['var(--violet)', '#F5F1E6', '#D9B662'], trainingId: 't-marketing',
    desc: 'Distinction propre à la formation « Marketing Digital — Fondamentaux », remise lorsqu’elle est officiellement terminée.',
    short: 'Vous avez mené cette formation jusqu’au bout.', emotion: 'Chaque formation terminée est une page de votre histoire qui se tourne, et une nouvelle qui s’ouvre.',
    notifTitle: 'Nouvelle distinction', notifMsg: 'Votre badge de formation vous attend.' },
  BADGE_FORMATION_02: { id: 'BADGE_FORMATION_02', name: 'Excel & Analyse de données', cat: 'formation', icon: 'grid', pal: ['#5B6BB5', '#F5F1E6', '#C9A24B'], trainingId: 't-excel',
    desc: 'Distinction propre à la formation « Excel & Analyse de données », remise lorsqu’elle est officiellement terminée.',
    short: 'Vous avez mené cette formation jusqu’au bout.', emotion: 'Chaque formation terminée est une page de votre histoire qui se tourne, et une nouvelle qui s’ouvre.',
    notifTitle: 'Nouvelle distinction', notifMsg: 'Votre badge de formation vous attend.' },
  BADGE_FORMATION_03: { id: 'BADGE_FORMATION_03', name: 'Créer son entreprise en Côte d’Ivoire', cat: 'formation', icon: 'target', pal: ['#B7791F', '#F5F1E6', 'var(--violet-deep)'], trainingId: 't-entreprendre',
    desc: 'Distinction propre à la formation « Créer son entreprise en Côte d’Ivoire », remise lorsqu’elle est officiellement terminée.',
    short: 'Vous avez mené cette formation jusqu’au bout.', emotion: 'Chaque formation terminée est une page de votre histoire qui se tourne, et une nouvelle qui s’ouvre.',
    notifTitle: 'Nouvelle distinction', notifMsg: 'Votre badge de formation vous attend.' },
  BADGE_FORMATION_04: { id: 'BADGE_FORMATION_04', name: 'Anglais professionnel', cat: 'formation', icon: 'globe', pal: ['#7B6CB7', '#F5F1E6', '#D9B662'], trainingId: 't-anglais',
    desc: 'Distinction propre à la formation « Anglais professionnel », remise lorsqu’elle est officiellement terminée.',
    short: 'Vous avez mené cette formation jusqu’au bout.', emotion: 'Chaque formation terminée est une page de votre histoire qui se tourne, et une nouvelle qui s’ouvre.',
    notifTitle: 'Nouvelle distinction', notifMsg: 'Votre badge de formation vous attend.' },
  BADGE_FORMATION_05: { id: 'BADGE_FORMATION_05', name: 'Devenir un excellent orateur', cat: 'formation', icon: 'quote', pal: ['#C99A8E', 'var(--violet-deep)', '#D9B662'], trainingId: 't-orateur',
    desc: 'Distinction propre à la formation « Devenir un excellent orateur », remise lorsqu’elle est officiellement terminée.',
    short: 'Vous avez mené cette formation jusqu’au bout.', emotion: 'Chaque formation terminée est une page de votre histoire qui se tourne, et une nouvelle qui s’ouvre.',
    notifTitle: 'Nouvelle distinction', notifMsg: 'Votre badge de formation vous attend.' },
  BADGE_FORMATION_06: { id: 'BADGE_FORMATION_06', name: 'Formation 06', cat: 'formation', icon: 'layers', pal: ['#9CAF97', '#F5F1E6', 'var(--violet-deep)'], trainingId: null,
    desc: 'Emplacement réservé — le nom et le symbole définitifs suivront le contenu réel de cette formation.',
    short: '', emotion: '', notifTitle: '', notifMsg: '' },
  BADGE_FORMATION_07: { id: 'BADGE_FORMATION_07', name: 'Formation 07', cat: 'formation', icon: 'book', pal: ['var(--violet)', '#F5F1E6', '#B87352'], trainingId: null,
    desc: 'Emplacement réservé — le nom et le symbole définitifs suivront le contenu réel de cette formation.',
    short: '', emotion: '', notifTitle: '', notifMsg: '' },
  BADGE_FORMATION_08: { id: 'BADGE_FORMATION_08', name: 'Formation 08', cat: 'formation', icon: 'zap', pal: ['#B7791F', '#F5F1E6', '#7B6CB7'], trainingId: null,
    desc: 'Emplacement réservé — le nom et le symbole définitifs suivront le contenu réel de cette formation.',
    short: '', emotion: '', notifTitle: '', notifMsg: '' },
  BADGE_FORMATION_09: { id: 'BADGE_FORMATION_09', name: 'Formation 09', cat: 'formation', icon: 'cap', pal: ['#5B6BB5', '#F5F1E6', '#9CAF97'], trainingId: null,
    desc: 'Emplacement réservé — le nom et le symbole définitifs suivront le contenu réel de cette formation.',
    short: '', emotion: '', notifTitle: '', notifMsg: '' },
  BADGE_FORMATION_10: { id: 'BADGE_FORMATION_10', name: 'Formation 10', cat: 'formation', icon: 'message', pal: ['#C99A8E', '#F5F1E6', '#C9A24B'], trainingId: null,
    desc: 'Emplacement réservé — le nom et le symbole définitifs suivront le contenu réel de cette formation.',
    short: '', emotion: '', notifTitle: '', notifMsg: '' }
};

/* Rappels après absence — ton chaleureux, jamais culpabilisant, rotation */
const REMINDER_MSGS = [
  { title: 'Votre parcours vous attend', body: 'Cela fait quelque temps que nous ne vous avons pas vu. Prenez votre temps, puis revenez lorsque vous êtes prêt : votre parcours est toujours là.' },
  { title: 'Nous pensons à vous', body: 'Votre parcours est resté exactement là où vous l’aviez laissé. Revenez quand vous le souhaitez, nous serons heureux de vous retrouver.' },
  { title: 'Une étape vous attend', body: 'Chaque parcours a son rythme. Le vôtre vous attend, sagement, là où vous vous êtes arrêté.' },
  { title: 'Le campus vous garde une place', body: 'Pas à pas, à votre rythme : la prochaine étape de votre parcours est prête lorsque vous le serez.' }
];
/* Messages de bon retour — rotation */
const RETURN_MSGS = [
  'Bon retour parmi nous. Votre parcours vous attendait. Reprenons là où vous vous étiez arrêté.',
  'Heureux de vous revoir. Vous n’avez pas besoin de tout recommencer : il suffit de reprendre le chemin.',
  'Vous voilà de retour. Prenez votre temps, retrouvez votre rythme et continuez votre parcours.',
  'Votre parcours est toujours là. Une pause n’efface pas le chemin déjà parcouru.',
  'Bon retour dans votre espace. La prochaine étape vous attend.'
];

/* Pays couverts + indicatifs ; WEST_AFRICA = zone Money Fusion (repli historique si Flutterwave est désactivé — le 1er achat se fait hors de l’app via Chariow) */
/* Pays : d = indicatif, f = drapeau, min/max = longueur attendue du numéro national (contrôle de forme) */
const COUNTRIES = [
  { n: 'Côte d’Ivoire', d: '+225', f: '🇨🇮', min: 10, max: 10 }, { n: 'Sénégal', d: '+221', f: '🇸🇳', min: 9, max: 9 },
  { n: 'Mali', d: '+223', f: '🇲🇱', min: 8, max: 8 }, { n: 'Burkina Faso', d: '+226', f: '🇧🇫', min: 8, max: 8 },
  { n: 'Bénin', d: '+229', f: '🇧🇯', min: 8, max: 8 }, { n: 'Togo', d: '+228', f: '🇹🇬', min: 8, max: 8 },
  { n: 'Niger', d: '+227', f: '🇳🇪', min: 8, max: 8 }, { n: 'Guinée-Bissau', d: '+245', f: '🇬🇼', min: 7, max: 9 },
  { n: 'Guinée', d: '+224', f: '🇬🇳', min: 8, max: 9 }, { n: 'Ghana', d: '+233', f: '🇬🇭', min: 9, max: 9 },
  { n: 'Cameroun', d: '+237', f: '🇨🇲', min: 8, max: 9 }, { n: 'Gabon', d: '+241', f: '🇬🇦', min: 7, max: 8 },
  { n: 'Congo-Brazzaville', d: '+242', f: '🇨🇬', min: 9, max: 9 }, { n: 'RDC', d: '+243', f: '🇨🇩', min: 7, max: 9 },
  { n: 'Tchad', d: '+235', f: '🇹🇩', min: 8, max: 8 }, { n: 'Centrafrique', d: '+236', f: '🇨🇫', min: 8, max: 8 },
  { n: 'Mauritanie', d: '+222', f: '🇲🇷', min: 8, max: 8 }, { n: 'Maroc', d: '+212', f: '🇲🇦', min: 9, max: 9 },
  { n: 'Algérie', d: '+213', f: '🇩🇿', min: 8, max: 9 }, { n: 'Tunisie', d: '+216', f: '🇹🇳', min: 8, max: 8 },
  { n: 'Égypte', d: '+20', f: '🇪🇬', min: 9, max: 10 }, { n: 'Nigéria', d: '+234', f: '🇳🇬', min: 10, max: 10 },
  { n: 'Afrique du Sud', d: '+27', f: '🇿🇦', min: 9, max: 9 }, { n: 'Rwanda', d: '+250', f: '🇷🇼', min: 9, max: 9 },
  { n: 'Kenya', d: '+254', f: '🇰🇪', min: 9, max: 10 }, { n: 'France', d: '+33', f: '🇫🇷', min: 9, max: 9 },
  { n: 'Belgique', d: '+32', f: '🇧🇪', min: 8, max: 9 }, { n: 'Suisse', d: '+41', f: '🇨🇭', min: 9, max: 9 },
  { n: 'Luxembourg', d: '+352', f: '🇱🇺', min: 6, max: 9 }, { n: 'Canada', d: '+1', f: '🇨🇦', min: 10, max: 10 },
  { n: 'États-Unis', d: '+1', f: '🇺🇸', min: 10, max: 10 }, { n: 'Royaume-Uni', d: '+44', f: '🇬🇧', min: 9, max: 10 },
  { n: 'Allemagne', d: '+49', f: '🇩🇪', min: 9, max: 12 }, { n: 'Espagne', d: '+34', f: '🇪🇸', min: 9, max: 9 },
  { n: 'Portugal', d: '+351', f: '🇵🇹', min: 9, max: 9 }, { n: 'Italie', d: '+39', f: '🇮🇹', min: 9, max: 11 },
  { n: 'Pays-Bas', d: '+31', f: '🇳🇱', min: 9, max: 9 }, { n: 'Haïti', d: '+509', f: '🇭🇹', min: 8, max: 8 },
  { n: 'Liban', d: '+961', f: '🇱🇧', min: 7, max: 8 }, { n: 'Émirats arabes unis', d: '+971', f: '🇦🇪', min: 8, max: 9 },
  { n: 'Chine', d: '+86', f: '🇨🇳', min: 9, max: 11 }, { n: 'Inde', d: '+91', f: '🇮🇳', min: 10, max: 10 },
  { n: 'Japon', d: '+81', f: '🇯🇵', min: 9, max: 10 }, { n: 'Brésil', d: '+55', f: '🇧🇷', min: 10, max: 11 },
  { n: 'Turquie', d: '+90', f: '🇹🇷', min: 10, max: 10 }, { n: 'Russie', d: '+7', f: '🇷🇺', min: 10, max: 10 },
  { n: 'Autre pays', d: '', f: '🌍', min: 7, max: 15 }
];
function findModule(tid, mid) {
  const t = getTraining(tid); if (!t) return null;
  for (const ch of t.chapters) { const m = ch.modules.find(m => m.id === mid); if (m) return { t, ch, m }; }
  return null;
}
function stepsOf(t) {
  const steps = [];
  t.chapters.forEach((ch, ci) => {
    ch.modules.forEach(m => steps.push({ kind: 'module', id: m.id, chapter: ci, ref: m, chRef: ch }));
    if (ch.exercise) steps.push({ kind: 'exercise', id: ch.exercise.id, chapter: ci, ref: ch.exercise, chRef: ch });
    if (ch.assessment) steps.push({ kind: 'assessment', id: ch.assessment.id, chapter: ci, ref: ch.assessment, chRef: ch });
  });
  return steps;
}
function stepDone(u, t, step) {
  if (step.kind === 'module') return !!((S.progress[u] || {})[step.id]?.viewed);
  if (step.kind === 'exercise') return true; /* jamais bloquant */
  const a = step.ref;
  if (a.type === 'quiz') return ((S.evAttempts[u] || {})[step.id] || []).some(x => x.passed);
  return S.submissions.some(x => x.userId === u && x.evId === step.id && x.status === 'approved');
}
function stepUnlocked(u, t, step) {
  const steps = stepsOf(t);
  const i = steps.findIndex(x => x.id === step.id && x.kind === step.kind);
  for (let j = 0; j < i; j++) {
    const p = steps[j];
    if (p.kind === 'exercise') continue; /* l’exercice ne conditionne pas la progression */
    if (!stepDone(u, t, p)) return false;
  }
  return true;
}
function trainingProgress(u, t) {
  const enr = S.enrollments.find(e => e.userId === u && e.trainingId === t.id);
  const mods = stepsOf(t).filter(s => s.kind === 'module');
  /* Formation déjà terminée : verrouillée à 100 %, même si du contenu est ajouté ensuite */
  if (enr && enr.completedAt) return { done: mods.length, total: mods.length, pct: 100, locked: true };
  const done = mods.filter(s => stepDone(u, t, s)).length;
  return { done, total: mods.length, pct: mods.length ? Math.round(done / mods.length * 100) : 0 };
}
function trainingCompleted(u, t) {
  return stepsOf(t).filter(s => s.kind !== 'exercise').every(s => stepDone(u, t, s));
}
function nextStep(u, t) {
  return stepsOf(t).find(s => s.kind !== 'exercise' && !stepDone(u, t, s) && stepUnlocked(u, t, s)) || null;
}
function myTrainings(u) { return S.enrollments.filter(e => e.userId === u).map(e => getTraining(e.trainingId)).filter(Boolean); }
function pendingCountAdmin() {
  const subs = S.submissions.filter(x => x.status === 'pending').length;
  const coach = S.threads.filter(th => !th.resolved && th.messages.some(m => m.from === 'student' && m.coach) && !th.messages.some(m => m.from === 'coach')).length;
  const ai = S.threads.filter(th => !th.resolved && th.messages.some(m => m.from === 'ai') && !th.aiValidated).length;
  const sales = S.sales.filter(s => s.status === 'declaré').length;
  const certs = S.certRequests.filter(q => q.status === 'pending').length;
  return subs + coach + ai + sales + certs;
}

/* ------------------------- ACTIONS ------------------------- */
function notify(userId, type, title, body, meta) {
  SYNC_AREAS.add('notifs');
  S.notifs.unshift({ id: uid(), userId, type, title, body, at: Date.now(), read: false, meta: meta || null });
}
function ensureEnrollment(userId, trainingId) {
  /* Un achat n’ajoute qu’une formation : jamais de doublon de compte ni d’inscription */
  if (!enrolledIn(userId, trainingId)) {
    const at = Date.now();
    S.enrollments.push({ userId, trainingId, at, accessExpiresAt: at + ACCESS_MONTHS * 30 * DAY });
    return true;
  }
  return false;
}
function markModuleViewed(userId, mid) {
  S.progress[userId] = S.progress[userId] || {};
  const existed = !!S.progress[userId][mid]?.viewed;
  S.progress[userId][mid] = { viewed: true, pct: 100, at: Date.now() };
  return !existed;
}
function maybeIssueCert(userId, trainingId) {
  const t = getTraining(trainingId);
  if (!t || !trainingCompleted(userId, t)) return null;
  if (S.certs.some(c => c.userId === userId && c.trainingId === trainingId)) return null;
  const holder = getUser(userId);
  /* Certificat figé : le nom et la formation sont capturés à l'émission (document historique) */
  const cert = { id: uid(), code: 'CERT-2026-' + String(Math.floor(1000 + Math.random() * 9000)), userId, trainingId, issuedAt: Date.now(), status: 'actif', holderName: holder ? holder.name : '', formationTitle: t.title, pdfRef: null, previewRef: null, slideDeleted: false, frozen: true };
  S.certs.push(cert);
  notify(userId, 'cert', 'Certificat disponible 🎓', `Votre certificat « ${t.title} » a été émis.`);
  return cert;
}
function gradeQuiz(questions, answers) {
  let score = 0;
  const detail = questions.map((q, i) => {
    const a = answers[i];
    let ok = false;
    if (q.type === 'single') ok = a === q.correct;
    else if (Array.isArray(a)) {
      const want = [...q.correct].sort().join(',');
      ok = [...a].sort().join(',') === want;
    }
    if (ok) score++;
    return { ok };
  });
  return { score, total: questions.length, detail };
}
