import type { APIRoute } from 'astro';
import { catalogOptions, catalogs } from '../../../../db/schema/app';
import {
  assignCatalogOptionKeys,
  createCatalogSchema,
  normalizeCatalogDescription,
} from '../../../lib/catalog-logic';
import { listCatalogs } from '../../../lib/server/api';

function jsonError(status: number, error: string): Response {
  return Response.json({ success: false, error }, { status });
}

export const GET: APIRoute = async ({ locals }) => {
  const user = locals.user;
  if (!user) {
    return jsonError(401, 'Unauthorized');
  }

  const data = await listCatalogs(locals.db, user.id, true);
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

  const parsed = createCatalogSchema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? 'Invalid request';
    return jsonError(400, message);
  }

  const rows = await locals.db
    .insert(catalogs)
    .values({
      userId: user.id,
      name: parsed.data.name,
      description: normalizeCatalogDescription(parsed.data.description) ?? null,
    })
    .returning();

  const catalog = rows[0];
  const options = assignCatalogOptionKeys(parsed.data.options);

  if (options.length > 0) {
    await locals.db.insert(catalogOptions).values(
      options.map((option, index) => ({
        id: option.id,
        catalogId: catalog.id,
        key: option.key,
        label: option.label,
        value: option.value,
        sortOrder: option.sort_order ?? index,
        isArchived: false,
      })),
    );
  }

  const data = await listCatalogs(locals.db, user.id, true);
  const created = data.find((item) => item.id === catalog.id);

  return Response.json({ success: true, data: created }, { status: 201 });
};
