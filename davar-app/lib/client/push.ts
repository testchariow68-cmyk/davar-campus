/* ABONNER L'APPAREIL AUX NOTIFICATIONS — côté navigateur, et rien de plus.
 *
 * Ce fichier ne contient aucun secret : la clé publique du campus est faite
 * pour être vue. La clé privée, elle, ne quitte jamais le serveur.
 */

/** Convertit la clé publique du campus en octets, comme le demande le navigateur. */
export function cleVersOctets(clePublique: string): Uint8Array<ArrayBuffer> {
  const normalisee = clePublique.replace(/-/g, '+').replace(/_/g, '/');
  const binaire = atob(normalisee + '='.repeat((4 - (normalisee.length % 4)) % 4));
  const octets = new Uint8Array(binaire.length) as Uint8Array<ArrayBuffer>;
  for (let i = 0; i < binaire.length; i += 1) octets[i] = binaire.charCodeAt(i);
  return octets;
}

/** Cet appareil peut-il recevoir des notifications poussées ? */
export function appareilCompatible(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export type EtatPush = 'actif' | 'refuse' | 'incompatible';

/**
 * ABONNER — enregistre le veilleur, demande la permission, puis transmet
 * l'adresse de l'appareil au campus. Renvoie « refuse » si la personne a dit
 * non : on ne la redemande pas, c'est son choix.
 */
export async function abonner(clePublique: string): Promise<EtatPush> {
  if (!appareilCompatible()) return 'incompatible';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return 'refuse';

  const enregistrement = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  const existant = await enregistrement.pushManager.getSubscription();
  const abonnement =
    existant ??
    (await enregistrement.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: cleVersOctets(clePublique),
    }));

  const brut = abonnement.toJSON();
  const reponse = await fetch('/api/campus/push', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      action: 'abonner',
      endpoint: brut.endpoint,
      p256dh: brut.keys?.p256dh,
      auth: brut.keys?.auth,
    }),
  });
  return reponse.ok ? 'actif' : 'refuse';
}

/** SE DÉSABONNER — l'appareil n'est plus dérangé, et le campus l'oublie. */
export async function desabonner(): Promise<void> {
  if (!appareilCompatible()) return;
  const enregistrement = await navigator.serviceWorker.getRegistration('/sw.js');
  const abonnement = await enregistrement?.pushManager.getSubscription();
  if (!abonnement) return;
  const brut = abonnement.toJSON();
  await abonnement.unsubscribe();
  await fetch('/api/campus/push', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'desabonner', endpoint: brut.endpoint }),
  });
}
