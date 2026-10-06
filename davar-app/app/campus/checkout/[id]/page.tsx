import Link from 'next/link';

/**
 * Nouveau checkout Flutterwave/MoneyFusion : inactif tant que la vérification
 * serveur du montant, de la signature, du statut et de l'idempotence n'est
 * pas démontrée. Chariow reste hors de l'application.
 */
export default function CheckoutPage() {
  return (
    <div className="card card-pad" style={{maxWidth:640,margin:'40px auto'}}>
      <h1>Paiement en préparation</h1>
      <p>Les paiements Flutterwave et MoneyFusion ne sont pas encore activés.
        Aucun montant ne peut être encaissé par ce parcours.</p>
      <Link href="/connexion" className="btn btn-ghost mt16">Retour</Link>
    </div>
  );
}
