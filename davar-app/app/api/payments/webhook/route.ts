/** Ancien webhook CinetPay retiré du parcours actif. Aucun paiement n'est attribué. */
export async function POST() {
  return Response.json({error:'Ancien webhook désactivé.'},
    {status:503,headers:{'Cache-Control':'no-store'}});
}
