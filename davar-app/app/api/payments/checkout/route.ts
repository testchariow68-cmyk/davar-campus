/** Ancien checkout CinetPay désactivé : ne jamais encaisser via l'ancien parcours. */
export async function POST() {
  return Response.json({error:'Paiement indisponible : nouveau parcours en préparation.'},
    {status:503,headers:{'Cache-Control':'no-store'}});
}
