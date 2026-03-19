import { z } from 'zod';

export const catalogOptionInputSchema = z.object({
  id: z.uuid().optional(),
  key: z.string().trim().min(1).max(100).optional(),
  label: z.string().trim().min(1).max(100),
  value: z.string().min(1),
  sort_order: z.number().int().min(0),
});

export const createCatalogSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(500).optional(),
  options: z.array(catalogOptionInputSchema).default([]),
});

export const updateCatalogSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(500).optional(),
  options: z.array(catalogOptionInputSchema).optional(),
});

export type CatalogOptionInput = z.infer<typeof catalogOptionInputSchema>;
export type CatalogOptionWithKey = CatalogOptionInput & { key: string };
export type CreateCatalogInput = z.infer<typeof createCatalogSchema>;
export type UpdateCatalogInput = z.infer<typeof updateCatalogSchema>;

export type ExistingCatalogOption = {
  id: string;
  key: string;
  label: string;
  value: string;
  sort_order: number;
  is_archived: boolean;
};

export type CatalogOptionSyncPlan = {
  create: CatalogOptionWithKey[];
  update: CatalogOptionWithKey[];
  archive: ExistingCatalogOption[];
};

function slugifyCatalogOptionKey(label: string) {
  const slug = label
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  return slug || 'option';
}

function createUniqueCatalogOptionKey(base: string, usedKeys: Set<string>) {
  let key = base;
  let suffix = 2;

  while (usedKeys.has(key)) {
    key = `${base}_${suffix}`;
    suffix += 1;
  }

  usedKeys.add(key);
  return key;
}

export function assignCatalogOptionKeys(
  nextOptions: CatalogOptionInput[],
  currentOptions: ExistingCatalogOption[] = [],
): CatalogOptionWithKey[] {
  const currentById = new Map(currentOptions.map((option) => [option.id, option]));
  const usedKeys = new Set<string>();

  return nextOptions.map((option) => {
    const current = option.id ? currentById.get(option.id) : undefined;
    const baseKey = current?.key?.trim() || option.key?.trim() || slugifyCatalogOptionKey(option.label);

    return {
      ...option,
      key: createUniqueCatalogOptionKey(baseKey, usedKeys),
    };
  });
}

export function normalizeCatalogDescription(description?: string | null) {
  if (description === undefined) {
    return undefined;
  }

  if (description === null) {
    return null;
  }

  const trimmed = description.trim();
  return trimmed ? trimmed : null;
}

export function buildCatalogOptionSyncPlan(
  currentOptions: ExistingCatalogOption[],
  nextOptions: CatalogOptionWithKey[],
): CatalogOptionSyncPlan {
  const currentById = new Map(currentOptions.map((option) => [option.id, option]));
  const nextIds = new Set(
    nextOptions.map((option) => option.id).filter((value): value is string => Boolean(value)),
  );

  const create: CatalogOptionWithKey[] = [];
  const update: CatalogOptionWithKey[] = [];

  for (const option of nextOptions) {
    if (option.id && currentById.has(option.id)) {
      update.push(option);
      continue;
    }

    create.push(option);
  }

  const archive = currentOptions.filter((option) => !nextIds.has(option.id));

  return {
    create,
    update,
    archive,
  };
}
