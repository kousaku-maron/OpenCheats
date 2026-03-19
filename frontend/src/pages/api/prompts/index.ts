import type { APIRoute } from 'astro';
import { promptVersions, prompts } from '../../../../db/schema/app';
import { normalizePromptDocument } from '../../../lib/prompt-document';
import { createPromptSchema } from '../../../lib/prompt-logic';
import { listPrompts, toPromptResponse } from '../../../lib/server/api';

function jsonError(status: number, error: string): Response {
  return Response.json({ success: false, error }, { status });
}

export const GET: APIRoute = async ({ locals }) => {
  const user = locals.user;
  if (!user) {
    return jsonError(401, 'Unauthorized');
  }

  const data = await listPrompts(locals.db, user.id);
  return Response.json({ success: true, data });
};

export const POST: APIRoute = async ({ request, locals }) => {
  const user = locals.user;
  if (!user) {
    return jsonError(401, 'Unauthorized');
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, 'Invalid JSON');
  }

  const parsed = createPromptSchema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? 'Invalid request';
    return jsonError(400, message);
  }

  const document = normalizePromptDocument(parsed.data.document);
  const rows = await locals.db
    .insert(prompts)
    .values({
      userId: user.id,
      title: parsed.data.title,
      document,
      currentVersion: 1,
    })
    .returning();

  const prompt = rows[0];
  await locals.db.insert(promptVersions).values({
    promptId: prompt.id,
    version: 1,
    title: prompt.title,
    document,
  });

  return Response.json({ success: true, data: toPromptResponse(prompt) }, { status: 201 });
};
