import type { APIRoute } from 'astro';
import { and, eq, sql } from 'drizzle-orm';
import { promptVersions, prompts } from '../../../../db/schema/app';
import { buildNextPromptState, updatePromptSchema } from '../../../lib/prompt-logic';
import { getPromptById, listPromptVersions, toPromptResponse } from '../../../lib/server/api';

function jsonError(status: number, error: string): Response {
  return Response.json({ success: false, error }, { status });
}

export const GET: APIRoute = async ({ params, locals }) => {
  const id = params.id;
  if (!id) {
    return jsonError(400, 'Prompt ID is required');
  }

  const user = locals.user;
  if (!user) {
    return jsonError(401, 'Unauthorized');
  }

  const prompt = await getPromptById(locals.db, user.id, id);
  if (!prompt) {
    return jsonError(404, 'Prompt not found');
  }

  const versions = await listPromptVersions(locals.db, user.id, id);
  return Response.json({ success: true, data: { ...prompt, versions } });
};

export const PATCH: APIRoute = async ({ request, params, locals }) => {
  const id = params.id;
  if (!id) {
    return jsonError(400, 'Prompt ID is required');
  }

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

  const parsed = updatePromptSchema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? 'Invalid request';
    return jsonError(400, message);
  }

  const currentPrompt = await getPromptById(locals.db, user.id, id);
  if (!currentPrompt) {
    return jsonError(404, 'Prompt not found');
  }

  const nextState = buildNextPromptState(
    {
      title: currentPrompt.title,
      document: currentPrompt.document,
      currentVersion: currentPrompt.current_version,
    },
    parsed.data,
  );

  const rows = await locals.db
    .update(prompts)
    .set({
      title: nextState.title,
      document: nextState.document,
      currentVersion: nextState.nextVersion,
      updatedAt: sql`now()`,
    })
    .where(and(eq(prompts.id, id), eq(prompts.userId, user.id)))
    .returning();

  const prompt = rows[0];
  if (!prompt) {
    return jsonError(404, 'Prompt not found');
  }

  await locals.db.insert(promptVersions).values({
    promptId: prompt.id,
    version: nextState.nextVersion,
    title: nextState.title,
    document: nextState.document,
  });

  return Response.json({ success: true, data: toPromptResponse(prompt) });
};

export const DELETE: APIRoute = async ({ params, locals }) => {
  const id = params.id;
  if (!id) {
    return jsonError(400, 'Prompt ID is required');
  }

  const user = locals.user;
  if (!user) {
    return jsonError(401, 'Unauthorized');
  }

  const rows = await locals.db
    .delete(prompts)
    .where(and(eq(prompts.id, id), eq(prompts.userId, user.id)))
    .returning({ id: prompts.id });

  if (!rows[0]) {
    return jsonError(404, 'Prompt not found');
  }

  return Response.json({ success: true, data: { id } });
};
