/**
 * ARCHIVE DE L'ANCIEN PARCOURS SUPABASE : NE PAS RÉUTILISER.
 * Voir REAL-LAUNCH-STATUS.md. Ce composant n'est plus importé par les pages actives.
 * Affiché tant que les variables d'environnement ne sont pas renseignées.
 * Guide l'installation pas à pas (voir SETUP.md).
 */
export function SetupScreen() {
  const checks = [
    {
      ok: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      title: "NEXT_PUBLIC_SUPABASE_URL",
      desc: "Créez un projet sur supabase.com → Project Settings → API.",
    },
    {
      ok: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      title: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      desc: "Clé publique « anon » du même écran Supabase.",
    },
    {
      ok: false,
      title: "Exécuter supabase/schema.sql",
      desc: "SQL Editor de Supabase → collez le schéma du dossier davar-campus/supabase.",
    },
    {
      ok: false,
      title: "Clés CinetPay (sandbox)",
      desc: "Compte marchand gratuit sur web.cinetpay.com → CINETPAY_API_KEY & CINETPAY_SITE_ID.",
    },
  ];
  return (
    <div className="login-right" style={{ minHeight: "100vh" }}>
      <div style={{ width: "min(560px, 100%)" }}>
        <div className="brand mb16">
          <div className="brand-mark">D</div>
          <div className="brand-txt">
            DAVAR<span>Académie Campus</span>
          </div>
        </div>
        <h2 style={{ fontSize: 20 }}>Installation requise 🛠️</h2>
        <p className="muted small mt4 mb16">
          L’application fonctionne, mais elle n’est pas encore branchée sur
          Supabase. Renseignez le fichier <span className="kbd">.env.local</span>{" "}
          (modèle fourni dans <span className="kbd">.env.example</span>) puis
          relancez <span className="kbd">npm run dev</span>.
        </p>
        <div className="card card-pad">
          {checks.map((c) => (
            <div className="check-item" key={c.title}>
              <span className={`ck ${c.ok ? "ok" : "no"}`}>
                {c.ok ? "✓" : "•"}
              </span>
              <div className="wrap">
                <b style={{ fontSize: 13 }}>{c.title}</b>
                <div className="xs muted">{c.desc}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="banner gold mt16">
          <span>📖</span>
          <span className="small">
            Guide complet étape par étape : <b>SETUP.md</b> à la racine du
            projet.
          </span>
        </div>
      </div>
    </div>
  );
}
