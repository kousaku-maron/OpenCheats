import type { APIRoute } from 'astro';
import { z } from 'zod';
import {
  deleteProviderCredential,
  listProviderCredentialSummaries,
  testProviderCredential,
  upsertProviderCredential,
} from '../../lib/server/provider-credentials';

const upsertSchema = z.object({
  provider: z.enum(['openai', 'google', 'klingai']),
  access_key: z.string().trim().min(1, 'Access key is required'),
  secret_key: z.string().trim().optional(),
});

const deleteSchema = z.object({
  provider: z.enum(['openai', 'google', 'klingai']),
});

function jsonError(status: number, error: string) {
  return Response.json({ success: false, error }, { status });
}

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) {
    return jsonError(401, 'Unauthorized');
  }

  const data = await listProviderCredentialSummaries(locals.db, locals.user.id);
  return Response.json({ success: true, data });
};

export const PUT: APIRoute = async ({ request, locals }) => {
  if (!locals.user) {
    return jsonError(401, 'Unauthorized');
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, 'Invalid JSON');
  }

  const parsed = upsertSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, parsed.error.issues[0]?.message ?? 'Invalid request');
  }

  try {
    await testProviderCredential({
      provider: parsed.data.provider,
      accessKey: parsed.data.access_key,
      secretKey: parsed.data.secret_key,
    });
    await upsertProviderCredential(locals.db, locals.user.id, locals.runtime.env, {
      provider: parsed.data.provider,
      accessKey: parsed.data.access_key,
      secretKey: parsed.data.secret_key,
    });
    const data = await listProviderCredentialSummaries(locals.db, locals.user.id);
    return Response.json({ success: true, data, message: 'Connection verified and saved.' });
  } catch (error) {
    return jsonError(400, error instanceof Error ? error.message : 'Credential save failed');
  }
};

export const DELETE: APIRoute = async ({ request, locals }) => {
  if (!locals.user) {
    return jsonError(401, 'Unauthorized');
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, 'Invalid JSON');
  }

  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, parsed.error.issues[0]?.message ?? 'Invalid request');
  }

  await deleteProviderCredential(locals.db, locals.user.id, parsed.data.provider);
  const data = await listProviderCredentialSummaries(locals.db, locals.user.id);
  return Response.json({ success: true, data });
};
