import { describe, expect, it } from 'vitest';
import {
  buildNextPromptState,
  createPromptSchema,
  updatePromptSchema,
} from './prompt-logic';

const OPTION_ID = '11111111-1111-4111-8111-111111111111';

describe('prompt-logic', () => {
  it('accepts a valid prompt payload and trims the title', () => {
    const parsed = createPromptSchema.parse({
      title: '  My Prompt  ',
      document: [{ id: 'a', type: 'text', text: 'hello' }],
    });

    expect(parsed.title).toBe('My Prompt');
  });

  it('defaults the document when omitted during create', () => {
    const parsed = createPromptSchema.parse({
      title: 'Prompt only',
    });

    expect(parsed.document).toHaveLength(1);
    expect(parsed.document[0]?.type).toBe('text');
  });

  it('rejects invalid prompt create payloads', () => {
    const parsed = createPromptSchema.safeParse({
      title: ' ',
      document: [{ id: 'a', type: 'catalog-option', optionId: 'not-a-uuid' }],
    });

    expect(parsed.success).toBe(false);
  });

  it('rejects empty update payloads', () => {
    const parsed = updatePromptSchema.safeParse({});

    expect(parsed.success).toBe(false);
  });

  it('accepts partial update payloads', () => {
    const parsed = updatePromptSchema.parse({
      title: '  Updated Prompt  ',
    });

    expect(parsed.title).toBe('Updated Prompt');
  });

  it('builds the next prompt state by incrementing the version and preserving omitted fields', () => {
    const nextState = buildNextPromptState(
      {
        title: 'Current title',
        document: [{ id: 'a', type: 'text', text: 'current body' }],
        currentVersion: 4,
      },
      {
        title: 'Next title',
      },
    );

    expect(nextState).toEqual({
      title: 'Next title',
      document: [{ id: 'a', type: 'text', text: 'current body' }],
      nextVersion: 5,
    });
  });

  it('normalizes the incoming document while building the next prompt state', () => {
    const nextState = buildNextPromptState(
      {
        title: 'Current title',
        document: [{ id: 'a', type: 'text', text: 'current body' }],
        currentVersion: 1,
      },
      {
        document: [
          { id: 'a', type: 'text', text: 'Use\u200B ' },
          { id: 'b', type: 'text', text: 'this ' },
          { id: 'c', type: 'catalog-option', optionId: OPTION_ID },
          { id: 'd', type: 'text', text: ' now' },
        ],
      },
    );

    expect(nextState.document).toEqual([
      { id: 'a', type: 'text', text: 'Use this ' },
      { id: 'c', type: 'catalog-option', optionId: OPTION_ID },
      { id: 'd', type: 'text', text: ' now' },
    ]);
  });
});
