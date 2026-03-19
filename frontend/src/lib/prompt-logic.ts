import { z } from 'zod';
import {
  createEmptyPromptDocument,
  normalizePromptDocument,
  type PromptDocument,
} from './prompt-document';

export const promptNodeSchema = z.discriminatedUnion('type', [
  z.object({
    id: z.string().min(1),
    type: z.literal('text'),
    text: z.string(),
  }),
  z.object({
    id: z.string().min(1),
    type: z.literal('catalog-option'),
    optionId: z.uuid(),
  }),
]);

export const createPromptSchema = z.object({
  title: z.string().trim().min(1).max(200),
  document: z.array(promptNodeSchema).min(1).default(createEmptyPromptDocument()),
});

export const updatePromptSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    document: z.array(promptNodeSchema).min(1).optional(),
  })
  .refine((value) => value.title !== undefined || value.document !== undefined, {
    message: 'At least one field is required',
  });

export type CreatePromptInput = z.infer<typeof createPromptSchema>;
export type UpdatePromptInput = z.infer<typeof updatePromptSchema>;

export type ExistingPromptState = {
  title: string;
  document: PromptDocument;
  currentVersion: number;
};

export function buildNextPromptState(
  current: ExistingPromptState,
  update: UpdatePromptInput,
) {
  const title = update.title ?? current.title;
  const document = update.document
    ? normalizePromptDocument(update.document)
    : current.document;

  return {
    title,
    document,
    nextVersion: current.currentVersion + 1,
  };
}
