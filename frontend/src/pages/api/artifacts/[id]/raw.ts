import { and, eq } from 'drizzle-orm';
import type { APIRoute } from 'astro';
import { artifacts } from '../../../../../db/schema/app';

function jsonError(status: number, error: string) {
  return Response.json({ success: false, error }, { status });
}

export const GET: APIRoute = async ({ locals, params }) => {
  if (!locals.user) {
    return jsonError(401, 'Unauthorized');
  }

  const artifactId = params.id;
  if (!artifactId) {
    return jsonError(400, 'Artifact id is required');
  }

  const artifactRows = await locals.db
    .select()
    .from(artifacts)
    .where(and(eq(artifacts.id, artifactId), eq(artifacts.userId, locals.user.id)))
    .limit(1);

  const artifact = artifactRows[0];
  if (!artifact || !artifact.objectKey) {
    return jsonError(404, 'Artifact not found');
  }

  const object = await locals.runtime.env.PLAYGROUND_BUCKET.get(artifact.objectKey);
  if (!object) {
    return jsonError(404, 'Artifact object not found');
  }

  return new Response(object.body, {
    headers: {
      'Content-Type': artifact.mimeType ?? object.httpMetadata?.contentType ?? 'application/octet-stream',
      'Cache-Control': 'private, max-age=60',
    },
  });
};
