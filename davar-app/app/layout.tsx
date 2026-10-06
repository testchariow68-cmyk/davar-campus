import type { Metadata } from "next";
import { Splash } from "@/components/Splash";
import { trackDynamicRequest } from "@/lib/server/quota";
import { openDb } from "@/lib/server/turso";
import "./globals.css";

export const metadata: Metadata = {
  title: "Davar Académie Campus",
  description:
    "Votre campus numérique personnel : formations, exercices, évaluations, coach et assistant IA.",
  icons: [{ rel: "icon", url: "/campus-icon.png", sizes: "512x512", type: "image/png" }],
  appleWebApp: { title: "Davar Campus" },
  manifest: "/manifest.webmanifest",
};

/** Amorce : thème clair/sombre (système par défaut, persistant) + Inter */
const themeScript = `(function(){try{var t=localStorage.getItem('davar-theme');if(!t)t=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';document.documentElement.dataset.theme=t;}catch(e){}})();`;

/**
 * Chaque page dynamique est comptée avant rendu (les assets statiques servis par
 * Cloudflare sont gratuits et illimités : ils ne consomment aucun quota).
 * Le comptage est local et vidé par lots : il ne peut jamais faire échouer une page.
 */
async function trackPageView(): Promise<void> {
  try {
    await trackDynamicRequest(await openDb());
  } catch {
    /* la protection de quota ne doit jamais casser l'affichage */
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  await trackPageView();
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <Splash />
        {children}
      </body>
    </html>
  );
}
