import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { catalogOptions, catalogs } from '../../../../db/schema/app';
import type { Database } from '../db';

type CatalogRow = typeof catalogs.$inferSelect;
type CatalogOptionRow = typeof catalogOptions.$inferSelect;

export type CatalogOptionResponse = {
  id: string;
  catalog_id: string;
  key: string;
  label: string;
  value: string;
  sort_order: number;
  is_archived: boolean;
};

export type CatalogResponse = {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  created_at: Date;
  updated_at: Date;
  options: CatalogOptionResponse[];
};

function toCatalogOptionResponse(row: CatalogOptionRow): CatalogOptionResponse {
  return {
    id: row.id,
    catalog_id: row.catalogId,
    key: row.key,
    label: row.label,
    value: row.value,
    sort_order: row.sortOrder,
    is_archived: row.isArchived,
  };
}

function toCatalogResponse(row: CatalogRow, options: CatalogOptionRow[]): CatalogResponse {
  return {
    id: row.id,
    user_id: row.userId,
    name: row.name,
    description: row.description,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
    options: options.map(toCatalogOptionResponse),
  };
}

export async function listCatalogs(
  db: Database,
  userId: string,
  includeArchived = false,
): Promise<CatalogResponse[]> {
  const catalogRows = await db
    .select()
    .from(catalogs)
    .where(eq(catalogs.userId, userId))
    .orderBy(desc(catalogs.updatedAt), asc(catalogs.name));

  if (catalogRows.length === 0) {
    return [];
  }

  const catalogIds = catalogRows.map((row) => row.id);
  const optionRows = await db
    .select()
    .from(catalogOptions)
    .where(
      includeArchived
        ? inArray(catalogOptions.catalogId, catalogIds)
        : and(
            inArray(catalogOptions.catalogId, catalogIds),
            eq(catalogOptions.isArchived, false),
          ),
    )
    .orderBy(asc(catalogOptions.sortOrder), asc(catalogOptions.createdAt));

  const optionMap = new Map<string, CatalogOptionRow[]>();
  for (const optionRow of optionRows) {
    const group = optionMap.get(optionRow.catalogId);
    if (group) {
      group.push(optionRow);
      continue;
    }
    optionMap.set(optionRow.catalogId, [optionRow]);
  }

  return catalogRows.map((row) => toCatalogResponse(row, optionMap.get(row.id) ?? []));
}

export async function getCatalogById(
  db: Database,
  userId: string,
  catalogId: string,
  includeArchived = true,
): Promise<CatalogResponse | null> {
  const rows = await db
    .select()
    .from(catalogs)
    .where(and(eq(catalogs.id, catalogId), eq(catalogs.userId, userId)))
    .limit(1);

  const row = rows[0];
  if (!row) {
    return null;
  }

  const options = await db
    .select()
    .from(catalogOptions)
    .where(
      includeArchived
        ? eq(catalogOptions.catalogId, catalogId)
        : and(eq(catalogOptions.catalogId, catalogId), eq(catalogOptions.isArchived, false)),
    )
    .orderBy(asc(catalogOptions.sortOrder), asc(catalogOptions.createdAt));

  return toCatalogResponse(row, options);
}
