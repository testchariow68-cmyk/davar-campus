import { isSameOrigin, jsonNoStore } from '@/lib/server/http';
import { logoutCurrentSession } from '@/lib/server/auth';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return jsonNoStore({ error: 'origin_refused' }, 403);
  await logoutCurrentSession();
  return jsonNoStore({ ok: true });
}
