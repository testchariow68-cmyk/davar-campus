import type { Metadata } from "next";
import { PaletteLoader } from "@/components/PaletteLoader";
import { Splash } from "@/components/Splash";
import "./globals.css";
// Base de style du PROTOTYPE, chargée après : c'est elle qui porte la
// ressemblance à 100 % demandée par le propriétaire (voir prototype.css).
import "./prototype.css";

export const metadata: Metadata = {
  title: "Davar Académie Campus",
  description:
    "Votre campus numérique personnel : formations, exercices, évaluations, coach et assistant IA.",
  icons: [{ rel: "icon", url: "/campus-icon.png", sizes: "512x512", type: "image/png" }],
  appleWebApp: { title: "Davar Campus" },
  manifest: "/manifest.webmanifest",
};

/**
 * Amorce du thème — réglage du PROTOTYPE : le mode SOMBRE est celui par défaut,
 * et le choix de la personne est mémorisé (clé `davar_theme`, la même que dans
 * le prototype, pour rester compatible).
 */
const themeScript = `(function(){try{var t=localStorage.getItem('davar_theme');if(!t)t='dark';document.documentElement.dataset.theme=t;var p=localStorage.getItem('davar_palette');if(p)document.documentElement.dataset.palette=p;}catch(e){document.documentElement.dataset.theme='dark';}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
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
        {/* La palette du propriétaire s'applique ici, sans requête base au rendu
            (la page d'accueil reste statique pour un simple visiteur). */}
        <PaletteLoader />
        {children}
      </body>
    </html>
  );
}
