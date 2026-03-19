import { describe, expect, it } from 'vitest';
import {
  assignCatalogOptionKeys,
  buildCatalogOptionSyncPlan,
  createCatalogSchema,
  normalizeCatalogDescription,
  updateCatalogSchema,
} from './catalog-logic';

describe('catalog-logic', () => {
  it('accepts a valid catalog create payload and trims the name', () => {
    const parsed = createCatalogSchema.parse({
      name: '  Font Styles  ',
      options: [],
    });

    expect(parsed.name).toBe('Font Styles');
  });

  it('defaults options to an empty list when omitted', () => {
    const parsed = createCatalogSchema.parse({
      name: 'Font Styles',
    });

    expect(parsed.options).toEqual([]);
  });

  it('rejects invalid catalog option payloads', () => {
    const parsed = createCatalogSchema.safeParse({
      name: 'Font Styles',
      options: [
        {
          label: 'Scribble',
          value: 'scribble handwritten font',
          sort_order: -1,
        },
      ],
    });

    expect(parsed.success).toBe(false);
  });

  it('accepts partial catalog updates', () => {
    const parsed = updateCatalogSchema.parse({
      description: '  Updated description  ',
    });

    expect(parsed.description).toBe('Updated description');
  });

  it('normalizes catalog descriptions', () => {
    expect(normalizeCatalogDescription(undefined)).toBeUndefined();
    expect(normalizeCatalogDescription(null)).toBeNull();
    expect(normalizeCatalogDescription('   ')).toBeNull();
    expect(normalizeCatalogDescription('  usable  ')).toBe('usable');
  });

  it('assigns keys from labels and deduplicates them', () => {
    const options = assignCatalogOptionKeys([
      {
        label: 'Direct Bite',
        value: 'direct bite',
        sort_order: 0,
      },
      {
        label: 'Direct Bite',
        value: 'direct bite alt',
        sort_order: 1,
      },
      {
        label: '日本語',
        value: 'jp',
        sort_order: 2,
      },
    ]);

    expect(options.map((option) => option.key)).toEqual([
      'direct_bite',
      'direct_bite_2',
      'option',
    ]);
  });

  it('preserves existing keys for persisted options', () => {
    const options = assignCatalogOptionKeys(
      [
        {
          id: '11111111-1111-4111-8111-111111111111',
          label: 'Renamed Label',
          value: 'scribble handwritten font',
          sort_order: 0,
        },
      ],
      [
        {
          id: '11111111-1111-4111-8111-111111111111',
          key: 'scribble',
          label: 'Old Label',
          value: 'scribble handwritten font',
          sort_order: 0,
          is_archived: false,
        },
      ],
    );

    expect(options[0]?.key).toBe('scribble');
  });

  it('builds a sync plan that separates creates, updates, and archives', () => {
    const plan = buildCatalogOptionSyncPlan(
      [
        {
          id: '11111111-1111-4111-8111-111111111111',
          key: 'scribble',
          label: 'Scribble',
          value: 'scribble handwritten font',
          sort_order: 0,
          is_archived: false,
        },
        {
          id: '22222222-2222-4222-8222-222222222222',
          key: 'pixel',
          label: 'Pixel',
          value: 'pixel retro font',
          sort_order: 1,
          is_archived: false,
        },
      ],
      [
        {
          id: '11111111-1111-4111-8111-111111111111',
          label: 'Scribble Font',
          value: 'scribble chalk font',
          sort_order: 0,
        },
        {
          label: 'Retro',
          value: 'retro arcade font',
          sort_order: 1,
        },
      ].map((option, index) => ({ ...option, key: index === 0 ? 'scribble' : 'retro' })),
    );

    expect(plan.update).toEqual([
      {
        id: '11111111-1111-4111-8111-111111111111',
        key: 'scribble',
        label: 'Scribble Font',
        value: 'scribble chalk font',
        sort_order: 0,
      },
    ]);
    expect(plan.create).toEqual([
      {
        key: 'retro',
        label: 'Retro',
        value: 'retro arcade font',
        sort_order: 1,
      },
    ]);
    expect(plan.archive.map((option) => option.id)).toEqual([
      '22222222-2222-4222-8222-222222222222',
    ]);
  });

  it('does not archive options that remain referenced', () => {
    const plan = buildCatalogOptionSyncPlan(
      [
        {
          id: '11111111-1111-4111-8111-111111111111',
          key: 'scribble',
          label: 'Scribble',
          value: 'scribble handwritten font',
          sort_order: 0,
          is_archived: false,
        },
      ],
      [
        {
          id: '11111111-1111-4111-8111-111111111111',
          label: 'Scribble',
          value: 'scribble handwritten font',
          sort_order: 3,
        },
      ].map((option) => ({ ...option, key: 'scribble' })),
    );

    expect(plan.archive).toEqual([]);
    expect(plan.update[0]?.sort_order).toBe(3);
  });
});
