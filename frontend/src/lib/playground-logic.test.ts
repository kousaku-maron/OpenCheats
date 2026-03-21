import { describe, expect, it } from 'vitest';
import { buildGenerationPrompt, createRunSchema, getTaskTypeForModel } from './playground-logic';

describe('playground-logic', () => {
  it('accepts a valid run payload', () => {
    const parsed = createRunSchema.parse({
      prompt_id: crypto.randomUUID(),
      prompt_document: [{ id: 'n1', type: 'text', text: 'render a dessert world' }],
      model: 'nanobanana/gemini-3.1-flash-image-preview',
      text_context: 'focus on glossy candy highlights',
      inputs: [{ slot: 'reference', artifact_id: crypto.randomUUID() }],
      settings: {
        aspect_ratio: '9:16',
      },
    });

    expect(getTaskTypeForModel(parsed.model)).toBe('image');
    expect(parsed.settings.aspect_ratio).toBe('9:16');
    expect(parsed.prompt_document?.[0]?.type).toBe('text');
  });

  it('rejects missing model', () => {
    const parsed = createRunSchema.safeParse({
      prompt_id: crypto.randomUUID(),
      model: '   ',
    });

    expect(parsed.success).toBe(false);
  });

  it('combines resolved prompt and text context', () => {
    expect(buildGenerationPrompt('create a dreamy dessert scene', 'baby dragon, pastel palette')).toBe(
      'create a dreamy dessert scene\n\nContext:\nbaby dragon, pastel palette',
    );
  });

  it('returns text context when resolved prompt is empty', () => {
    expect(buildGenerationPrompt('   ', 'just the extra context')).toBe('just the extra context');
  });
});
