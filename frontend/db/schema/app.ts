import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import type { PromptDocument } from '../../src/lib/prompt-document';
import { user } from './auth';

export const catalogs = pgTable(
  'catalogs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('catalogs_user_updated_at_idx').on(table.userId, table.updatedAt),
  ]
);

export const catalogOptions = pgTable(
  'catalog_options',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    catalogId: uuid('catalog_id')
      .notNull()
      .references(() => catalogs.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    label: text('label').notNull(),
    value: text('value').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    isArchived: boolean('is_archived').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('catalog_options_catalog_sort_idx').on(table.catalogId, table.sortOrder),
  ]
);

export const prompts = pgTable(
  'prompts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    document: jsonb('document').$type<PromptDocument>().notNull(),
    currentVersion: integer('current_version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('prompts_user_updated_at_idx').on(table.userId, table.updatedAt),
  ]
);

export const promptVersions = pgTable(
  'prompt_versions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    promptId: uuid('prompt_id')
      .notNull()
      .references(() => prompts.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    title: text('title').notNull(),
    document: jsonb('document').$type<PromptDocument>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('prompt_versions_prompt_version_idx').on(table.promptId, table.version),
  ]
);

export const runs = pgTable(
  'runs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    promptVersionId: uuid('prompt_version_id').references(() => promptVersions.id, { onDelete: 'restrict' }),
    model: text('model').notNull(),
    resolvedPrompt: text('resolved_prompt').notNull(),
    settingsJson: jsonb('settings_json').$type<Record<string, unknown>>().notNull().default({}),
    status: text('status').notNull().default('running'),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('runs_user_created_at_idx').on(table.userId, table.createdAt),
    index('runs_prompt_version_created_at_idx').on(table.promptVersionId, table.createdAt),
  ],
);

export const artifacts = pgTable(
  'artifacts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    sourceType: text('source_type').notNull(),
    objectKey: text('object_key'),
    textContent: text('text_content'),
    mimeType: text('mime_type'),
    createdByRunId: uuid('created_by_run_id').references(() => runs.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('artifacts_user_created_at_idx').on(table.userId, table.createdAt),
    index('artifacts_run_created_at_idx').on(table.createdByRunId, table.createdAt),
  ],
);

export const userProviderCredentials = pgTable(
  'user_provider_credentials',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    encryptedAccessKey: text('encrypted_access_key').notNull(),
    encryptedSecretKey: text('encrypted_secret_key'),
    keyHint: text('key_hint'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('provider_credentials_user_updated_at_idx').on(table.userId, table.updatedAt),
    uniqueIndex('provider_credentials_user_provider_idx').on(table.userId, table.provider),
  ],
);
