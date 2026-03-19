import { and, desc, eq } from 'drizzle-orm';
import { promptVersions, prompts } from '../../../../db/schema/app';
import type { PromptDocument } from '../../prompt-document';
import type { Database } from '../db';

type PromptRow = typeof prompts.$inferSelect;

export type PromptResponse = {
  id: string;
  user_id: string;
  title: string;
  document: PromptDocument;
  current_version: number;
  created_at: Date;
  updated_at: Date;
};

export type PromptVersionResponse = {
  id: string;
  prompt_id: string;
  version: number;
  title: string;
  document: PromptDocument;
  created_at: Date;
};

export function toPromptResponse(row: PromptRow): PromptResponse {
  return {
    id: row.id,
    user_id: row.userId,
    title: row.title,
    document: row.document,
    current_version: row.currentVersion,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

export async function listPrompts(db: Database, userId: string): Promise<PromptResponse[]> {
  const rows = await db
    .select()
    .from(prompts)
    .where(eq(prompts.userId, userId))
    .orderBy(desc(prompts.updatedAt));

  return rows.map(toPromptResponse);
}

export async function getPromptById(
  db: Database,
  userId: string,
  promptId: string,
): Promise<PromptResponse | null> {
  const rows = await db
    .select()
    .from(prompts)
    .where(and(eq(prompts.id, promptId), eq(prompts.userId, userId)))
    .limit(1);

  const row = rows[0];
  return row ? toPromptResponse(row) : null;
}

export async function listPromptVersions(
  db: Database,
  userId: string,
  promptId: string,
): Promise<PromptVersionResponse[]> {
  const prompt = await getPromptById(db, userId, promptId);
  if (!prompt) {
    return [];
  }

  const rows = await db
    .select()
    .from(promptVersions)
    .where(eq(promptVersions.promptId, promptId))
    .orderBy(desc(promptVersions.version));

  return rows.map((row) => ({
    id: row.id,
    prompt_id: row.promptId,
    version: row.version,
    title: row.title,
    document: row.document,
    created_at: row.createdAt,
  }));
}
