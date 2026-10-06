import { redirect } from 'next/navigation';

/**
 * Les anciens liens /campus/checkout/<formation> pointent désormais vers la page
 * publique d'achat. Aucun encaissement n'a jamais eu lieu dans l'application.
 */
export default async function CheckoutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/formation/${encodeURIComponent(id)}`);
}
