import { redirect } from 'next/navigation';
import { NotificationsEcran } from '@/components/campus/NotificationsEcran';
import { currentSession } from '@/lib/server/auth';
import { listerNotifications } from '@/lib/server/notifications';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Notifications — Davar Académie Campus' };

/** NOTIFICATIONS — `vNotifs()` du prototype. */
export default async function NotificationsPage() {
  const session = await currentSession();
  if (!session) redirect('/connexion');
  const notifications = await listerNotifications(session.db, session.user.id, Date.now(), 60);

  return (
    <NotificationsEcran
      initiales={notifications.map((notification) => ({
        id: notification.id,
        kind: notification.kind,
        titre: notification.titre,
        corps: notification.corps,
        route: notification.route,
        atMs: notification.atMs,
        lue: notification.lue,
      }))}
    />
  );
}
