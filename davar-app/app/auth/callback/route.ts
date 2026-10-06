/** Ancien callback Supabase désactivé : aucun échange de session tiers. */
export async function GET() {
  return Response.json({error:'Ancien parcours d’authentification désactivé.'},
    {status:410,headers:{'Cache-Control':'no-store'}});
}
