import { svgIcone } from '@/lib/server/icones';

/**
 * Une icône servie en image, fond transparent : c'est ce que réclame une
 * notification poussée, qui ne sait pas dessiner un composant. Le nom est
 * vérifié de près — rien de ce qui vient de l'adresse n'entre dans le SVG.
 */
export async function GET(_request: Request, contexte: { params: Promise<{ nom: string }> }) {
  const { nom } = await contexte.params;
  const propre = typeof nom === 'string' ? nom.replace(/\.svg$/i, '') : '';
  const svg = svgIcone(propre);
  if (!svg) return new Response('icône inconnue', { status: 404 });
  return new Response(svg, {
    headers: {
      'content-type': 'image/svg+xml; charset=utf-8',
      'cache-control': 'public, max-age=86400',
    },
  });
}
