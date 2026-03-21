import { z } from 'zod';
import { promptNodeSchema } from './prompt-logic';

export const runTaskTypes = ['text', 'image', 'video'] as const;
export type RunTaskType = (typeof runTaskTypes)[number];

export type SupportedModel = {
  value: string;
  label: string;
  provider: 'openai' | 'nanobanana' | 'klingai';
  taskType: RunTaskType;
  allowsImageInputs: boolean;
};

export const supportedModels: readonly SupportedModel[] = [
  {
    value: 'openai/gpt-5.4',
    label: 'OpenAI / gpt-5.4',
    provider: 'openai',
    taskType: 'text',
    allowsImageInputs: false,
  },
  {
    value: 'openai/gpt-5.4-mini',
    label: 'OpenAI / gpt-5.4-mini',
    provider: 'openai',
    taskType: 'text',
    allowsImageInputs: false,
  },
  {
    value: 'openai/gpt-5.4-nano',
    label: 'OpenAI / gpt-5.4-nano',
    provider: 'openai',
    taskType: 'text',
    allowsImageInputs: false,
  },
  {
    value: 'nanobanana/gemini-3.1-flash-image-preview',
    label: 'Nanobanana / gemini-3.1-flash-image-preview',
    provider: 'nanobanana',
    taskType: 'image',
    allowsImageInputs: true,
  },
  {
    value: 'klingai/kling-v2-5-turbo',
    label: 'Kling / kling-v2-5-turbo',
    provider: 'klingai',
    taskType: 'video',
    allowsImageInputs: true,
  },
] as const;

export const defaultModel = supportedModels[0].value;

export const runInputSlots = ['reference', 'start', 'end'] as const;
export type RunInputSlot = (typeof runInputSlots)[number];

const supportedModelValues = new Set<string>(supportedModels.map((model) => model.value));

export function getSupportedModel(modelId: string) {
  return supportedModels.find((model) => model.value === modelId || model.label === modelId) ?? null;
}

export function getTaskTypeForModel(modelId: string): RunTaskType {
  const supportedModel = getSupportedModel(modelId);
  if (!supportedModel) {
    throw new Error('Unsupported model');
  }

  return supportedModel.taskType;
}

export const createRunSchema = z.object({
  prompt_id: z.union([z.uuid(), z.literal('')]).nullish().transform((value) => value || null),
  prompt_document: z.array(promptNodeSchema).min(1).optional(),
  model: z.string().trim().min(1, 'Model is required').max(200).refine((value) => supportedModelValues.has(value), {
    message: 'Unsupported model',
  }),
  text_context: z.string().max(4000).default(''),
  inputs: z
    .array(
      z.object({
        slot: z.enum(runInputSlots),
        artifact_id: z.uuid().optional(),
        data_url: z.string().trim().min(1).optional(),
        mime_type: z.string().trim().max(200).optional(),
      }).refine((value) => Boolean(value.artifact_id || value.data_url), {
        message: 'Each input requires an artifact or uploaded image',
      }),
    )
    .max(8)
    .default([]),
  settings: z
    .object({
      aspect_ratio: z.string().trim().max(20).optional(),
      duration_seconds: z.number().int().min(1).max(30).optional(),
      kling_mode: z.enum(['std', 'pro']).optional(),
      output_count: z.number().int().min(1).max(4).optional(),
      seed: z.string().trim().max(100).optional(),
    })
    .default({}),
});

export type CreateRunPayload = z.infer<typeof createRunSchema>;

export function buildGenerationPrompt(resolvedPrompt: string, textContext: string) {
  const trimmedResolvedPrompt = resolvedPrompt.trim();
  const trimmedContext = textContext.trim();

  if (!trimmedContext) {
    return trimmedResolvedPrompt;
  }

  if (!trimmedResolvedPrompt) {
    return trimmedContext;
  }

  return `${trimmedResolvedPrompt}\n\nContext:\n${trimmedContext}`;
}
