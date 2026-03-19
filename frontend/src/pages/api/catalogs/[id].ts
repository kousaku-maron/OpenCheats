import type { APIRoute } from 'astro';
import { and, eq, sql } from 'drizzle-orm';
import { catalogOptions, catalogs } from '../../../../db/schema/app';
import {
  assignCatalogOptionKeys,
  buildCatalogOptionSyncPlan,
  normalizeCatalogDescription,
  updateCatalogSchema,
} from '../../../lib/catalog-logic';
import { getCatalogById } from '../../../lib/server/api';

function jsonError(status: number, error: string): Response {
  return Response.json({ success: false, error }, { status });
}

export const GET: APIRoute = async ({ params, locals }) => {
  const id = params.id;
  if (!id) {
    return jsonError(400, 'Catalog ID is required');
  }

  const user = locals.user;
  if (!user) {
    return jsonError(401, 'Unauthorized');
  }

  const catalog = await getCatalogById(locals.db, user.id, id, true);
  if (!catalog) {
    return jsonError(404, 'Catalog not found');
  }

  return Response.json({ success: true, data: catalog });
};

export const PATCH: APIRoute = async ({ request, params, locals }) => {
  const id = params.id;
  if (!id) {
    return jsonError(400, 'Catalog ID is required');
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

  const parsed = updateCatalogSchema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? 'Invalid request';
    return jsonError(400, message);
  }

  const currentCatalog = await getCatalogById(locals.db, user.id, id, true);
  if (!currentCatalog) {
    return jsonError(404, 'Catalog not found');
  }

  const rows = await locals.db
    .update(catalogs)
    .set({
      name: parsed.data.name ?? currentCatalog.name,
      description:
        parsed.data.description !== undefined
          ? normalizeCatalogDescription(parsed.data.description)
          : currentCatalog.description,
      updatedAt: sql`now()`,
    })
    .where(and(eq(catalogs.id, id), eq(catalogs.userId, user.id)))
    .returning();

  const catalog = rows[0];
  if (!catalog) {
    return jsonError(404, 'Catalog not found');
  }

  if (parsed.data.options) {
    const nextOptions = assignCatalogOptionKeys(parsed.data.options, currentCatalog.options);
    const plan = buildCatalogOptionSyncPlan(currentCatalog.options, nextOptions);

    for (const option of plan.update) {
      await locals.db
        .update(catalogOptions)
        .set({
          key: option.key,
          label: option.label,
          value: option.value,
          sortOrder: option.sort_order,
          isArchived: false,
          updatedAt: sql`now()`,
        })
        .where(and(eq(catalogOptions.id, option.id!), eq(catalogOptions.catalogId, id)));
    }

    for (const option of plan.create) {
      await locals.db.insert(catalogOptions).values({
        catalogId: id,
        key: option.key,
        label: option.label,
        value: option.value,
        sortOrder: option.sort_order,
        isArchived: false,
      });
    }

    for (const option of plan.archive) {
      await locals.db
        .update(catalogOptions)
        .set({
          isArchived: true,
          updatedAt: sql`now()`,
        })
        .where(and(eq(catalogOptions.id, option.id), eq(catalogOptions.catalogId, id)));
    }
  }

  const data = await getCatalogById(locals.db, user.id, id, true);
  return Response.json({ success: true, data });
};
