export type PromptTextNode = {
  id: string;
  type: 'text';
  text: string;
};

export type PromptCatalogOptionNode = {
  id: string;
  type: 'catalog-option';
  optionId: string;
};

export type PromptNode = PromptTextNode | PromptCatalogOptionNode;
export type PromptDocument = PromptNode[];

export type CatalogOptionLike = {
  id: string;
  label: string;
  value: string;
  is_archived?: boolean;
};

export function createPromptTextNode(text = ''): PromptTextNode {
  return {
    id: crypto.randomUUID(),
    type: 'text',
    text,
  };
}

export function createEmptyPromptDocument(): PromptDocument {
  return [createPromptTextNode('')];
}

export function normalizePromptDocument(nodes: PromptDocument): PromptDocument {
  const normalized: PromptDocument = [];

  for (const node of nodes) {
    if (node.type === 'text') {
      const text = node.text.replace(/\u200B/g, '');
      const previous = normalized[normalized.length - 1];
      if (previous?.type === 'text') {
        previous.text += text;
        continue;
      }
      normalized.push({ ...node, text });
      continue;
    }

    normalized.push(node);
  }

  return normalized.length > 0 ? normalized : createEmptyPromptDocument();
}

export function resolvePromptDocument(
  nodes: PromptDocument,
  optionIndex: Map<string, CatalogOptionLike>,
) {
  return normalizePromptDocument(nodes)
    .map((node) => {
      if (node.type === 'text') {
        return node.text;
      }

      const option = optionIndex.get(node.optionId);
      if (!option) {
        return '[missing option]';
      }

      return option.value;
    })
    .join('');
}

export function toPlainPromptText(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}
