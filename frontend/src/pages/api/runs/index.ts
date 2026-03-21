import type { APIRoute } from 'astro';
import { createRunSchema } from '../../../lib/playground-logic';
import { createRun } from '../../../lib/server/playground';

function jsonError(status: number, error: string) {
  return Response.json({ success: false, error }, { status });
}

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) {
    return jsonError(401, 'Unauthorized');
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, 'Invalid JSON');
  }

  const parsed = createRunSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, parsed.error.issues[0]?.message ?? 'Invalid request');
  }

  try {
    const data = await createRun(locals.db, locals.user.id, locals.runtime.env, parsed.data);
    return Response.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(400, error instanceof Error ? error.message : 'Run creation failed');
  }
};
