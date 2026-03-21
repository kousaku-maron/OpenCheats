import type { APIRoute } from 'astro';
import { listHistory } from '../../lib/server/playground';

function jsonError(status: number, error: string) {
  return Response.json({ success: false, error }, { status });
}

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) {
    return jsonError(401, 'Unauthorized');
  }

  const data = await listHistory(locals.db, locals.user.id);
  return Response.json({ success: true, data });
};
