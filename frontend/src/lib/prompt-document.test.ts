import { describe, expect, it } from 'vitest';
import {
  createEmptyPromptDocument,
  normalizePromptDocument,
  resolvePromptDocument,
  toPlainPromptText,
} from './prompt-document';

const OPTION_ID = '11111111-1111-4111-8111-111111111111';

describe('prompt-document', () => {
  it('creates an empty prompt document with a single text node', () => {
    const document = createEmptyPromptDocument();

    expect(document).toHaveLength(1);
    expect(document[0]?.type).toBe('text');
    if (document[0]?.type === 'text') {
      expect(document[0].text).toBe('');
    }
  });

  it('normalizes by merging adjacent text nodes', () => {
    const normalized = normalizePromptDocument([
      { id: 'a', type: 'text', text: 'Hello' },
      { id: 'b', type: 'text', text: ' ' },
      { id: 'c', type: 'text', text: 'world' },
    ]);

    expect(normalized).toEqual([{ id: 'a', type: 'text', text: 'Hello world' }]);
  });

  it('removes zero-width spaces during normalization', () => {
    const normalized = normalizePromptDocument([
      { id: 'a', type: 'text', text: 'Hello\u200B' },
      { id: 'b', type: 'text', text: '\u200Bworld' },
    ]);

    expect(normalized).toEqual([{ id: 'a', type: 'text', text: 'Helloworld' }]);
  });

  it('preserves catalog option nodes while merging text around them', () => {
    const normalized = normalizePromptDocument([
      { id: 'a', type: 'text', text: 'A' },
      { id: 'b', type: 'catalog-option', optionId: OPTION_ID },
      { id: 'c', type: 'text', text: 'B' },
      { id: 'd', type: 'text', text: 'C' },
    ]);

    expect(normalized).toEqual([
      { id: 'a', type: 'text', text: 'A' },
      { id: 'b', type: 'catalog-option', optionId: OPTION_ID },
      { id: 'c', type: 'text', text: 'BC' },
    ]);
  });

  it('preserves consecutive line breaks inside text nodes', () => {
    const normalized = normalizePromptDocument([
      { id: 'a', type: 'text', text: 'Hello\n\n\nWorld' },
    ]);

    expect(normalized).toEqual([{ id: 'a', type: 'text', text: 'Hello\n\n\nWorld' }]);
  });

  it('returns a fallback empty document when normalizing an empty list', () => {
    const normalized = normalizePromptDocument([]);

    expect(normalized).toHaveLength(1);
    expect(normalized[0]?.type).toBe('text');
  });

  it('resolves prompt text by replacing option references with current values', () => {
    const resolved = resolvePromptDocument(
      [
        { id: 'a', type: 'text', text: 'Use ' },
        { id: 'b', type: 'catalog-option', optionId: OPTION_ID },
        { id: 'c', type: 'text', text: ' here' },
      ],
      new Map([
        [
          OPTION_ID,
          {
            id: OPTION_ID,
            label: 'Scribble Font',
            value: 'scribble handwritten font',
          },
        ],
      ]),
    );

    expect(resolved).toBe('Use scribble handwritten font here');
  });

  it('renders a missing marker when an option reference cannot be resolved', () => {
    const resolved = resolvePromptDocument(
      [{ id: 'a', type: 'catalog-option', optionId: OPTION_ID }],
      new Map(),
    );

    expect(resolved).toBe('[missing option]');
  });

  it('keeps consecutive line breaks in resolved prompt text', () => {
    const resolved = resolvePromptDocument(
      [{ id: 'a', type: 'text', text: 'Hello\n\nWorld' }],
      new Map(),
    );

    expect(resolved).toBe('Hello\n\nWorld');
  });

  it('collapses whitespace for list previews', () => {
    expect(toPlainPromptText('  hello\n\n   world\tagain  ')).toBe('hello world again');
  });
});
