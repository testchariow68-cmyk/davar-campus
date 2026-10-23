/* LE VEILLEUR DU CAMPUS — le service worker.
 *
 * Il ne fait qu'une chose : recevoir les notifications poussées et les
 * afficher. Il ne met rien en cache et ne touche à aucune donnée — le campus
 * reste servi par le réseau, comme avant.
 *
 * Le prototype, lui, se contentait d'afficher « Notifications activées ✓ »
 * sans jamais rien envoyer : ce fichier est ce qui manquait pour que la
 * promesse soit tenue.
 */

self.addEventListener('push', (evenement) => {
  const donnees = evenement.data ? evenement.data.json() : {};
  const titre = donnees.titre || 'Davar Académie';
  evenement.waitUntil(
    self.registration.showNotification(titre, {
      body: donnees.corps || '',
      icon: '/campus-icon.png',
      badge: '/campus-icon.png',
      tag: 'davar',
      data: { route: donnees.route || '/campus' },
    })
  );
});

self.addEventListener('notificationclick', (evenement) => {
  evenement.notification.close();
  const route = (evenement.notification.data && evenement.notification.data.route) || '/campus';
  evenement.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((fenetres) => {
        for (const fenetre of fenetres) {
          if (new URL(fenetre.url).origin === self.location.origin && 'focus' in fenetre) {
            fenetre.navigate(route);
            return fenetre.focus();
          }
        }
        return self.clients.openWindow(route);
      })
  );
});
