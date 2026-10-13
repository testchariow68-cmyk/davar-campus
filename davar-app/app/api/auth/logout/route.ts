import { isSameOrigin, jsonNoStore } from '@/lib/server/http';
import { logoutCurrentSession } from '@/lib/server/auth';
import { trackApiRequest } from '@/lib/server/quota';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  await trackApiRequest();
  if (!isSameOrigin(request)) return jsonNoStore({ error: 'origin_refused' }, 403);
  await logoutCurrentSession();
  return jsonNoStore({ ok: true });
}
