# DAVAR Campus — app Next.js sur Turso

> **Lisez `MISE-EN-SERVICE.md` (état réel de la dernière tranche livrée), `ARCHITECTURE-GRATUITE.md` (objectif 0 € jusqu'à 3 000 étudiants actifs : briques gratuites, protection des quotas, seuils de révision) puis `REAL-LAUNCH-STATUS.md`.** Comptes, paiements et campus restent sous contrôle : la compilation locale ne vaut pas lancement public. Les guides historiques Supabase/CinetPay ne sont plus applicables. Aucun secret ni base réelle ne sont inclus.

## Démarrage rapide (développement, sans secret)

```bash
npm ci
npm run db:seed    # migrations 001+002 + catalogue + compte de démonstration local
APP_ENV=development TURSO_DATABASE_URL="file:$PWD/dev-data/davar-dev.db" npm run dev
```

Tests : `npm test` (41 tests Node) · `npm run test:sql` (23 tests SQLite) ·
`npm run typecheck` · `npm run build -- --webpack` · `npm run build:vinext`.

Hachage délégué (mode gratuit en production) : `node auth-kdf-service/server.mjs`
avec `DAVAR_KDF_TOKEN` (voir `auth-kdf-service/README.md`), puis
`AUTH_KDF_MODE=remote` et `AUTH_KDF_URL` côté application.

Configuration : copiez `.env.example` en `.env.local` (jamais versionné).

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
