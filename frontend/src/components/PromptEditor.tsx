import { useEffect, useRef, useState } from 'preact/hooks';
import { ArrowLeft, Check, Copy, Plus } from 'lucide-preact';
import type { CatalogResponse, PromptVersionResponse } from '../lib/server/api';
import {
  createEmptyPromptDocument,
  normalizePromptDocument,
  resolvePromptDocument,
  toPlainPromptText,
  type PromptDocument,
} from '../lib/prompt-document';

type Props = {
  mode: 'create' | 'edit';
  promptId?: string;
  initialTitle?: string;
  initialDocument?: PromptDocument;
  initialCurrentVersion?: number;
  initialVersions?: PromptVersionResponse[];
  catalogs: CatalogResponse[];
};

type PickerMode = 'insert' | 'replace';

function formatVersionDate(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function buildOptionIndex(catalogs: CatalogResponse[]) {
  const optionIndex = new Map<string, CatalogResponse['options'][number]>();
  for (const catalog of catalogs) {
    for (const option of catalog.options) {
      optionIndex.set(option.id, option);
    }
  }
  return optionIndex;
}

function buildCatalogIndex(catalogs: CatalogResponse[]) {
  const catalogIndex = new Map<string, CatalogResponse>();
  for (const catalog of catalogs) {
    for (const option of catalog.options) {
      catalogIndex.set(option.id, catalog);
    }
  }
  return catalogIndex;
}

function applyChipContent(
  chip: HTMLElement,
  optionId: string,
  label: string,
  catalogId: string,
  catalogName: string,
) {
  chip.dataset.optionId = optionId;
  chip.dataset.catalogId = catalogId;
  chip.dataset.catalogName = catalogName;
  chip.replaceChildren();

  const labelNode = document.createElement('span');
  labelNode.className = 'prompt-token-label';
  labelNode.textContent = label;

  chip.appendChild(labelNode);
}

function createChipElement(
  optionId: string,
  label: string,
  catalogId: string,
  catalogName: string,
) {
  const chip = document.createElement('span');
  chip.className = 'prompt-token';
  chip.dataset.nodeType = 'catalog-option';
  chip.contentEditable = 'false';
  applyChipContent(chip, optionId, label, catalogId, catalogName);
  return chip;
}

function appendTextNode(parent: Node, text: string) {
  const parts = text.split('\n');
  parts.forEach((part, index) => {
    if (part) {
      parent.appendChild(document.createTextNode(part));
    }
    if (index < parts.length - 1) {
      parent.appendChild(document.createElement('br'));
    }
  });
}

function renderDocument(
  root: HTMLDivElement,
  documentValue: PromptDocument,
  optionIndex: Map<string, CatalogResponse['options'][number]>,
  catalogIndex: Map<string, CatalogResponse>,
) {
  root.replaceChildren();

  for (const node of documentValue) {
    if (node.type === 'text') {
      appendTextNode(root, node.text);
      continue;
    }

    const option = optionIndex.get(node.optionId);
    const catalog = option ? catalogIndex.get(node.optionId) : null;
    root.appendChild(
      createChipElement(
        node.optionId,
        option?.label ?? 'Missing option',
        catalog?.id ?? '',
        catalog?.name ?? 'Catalog',
      ),
    );
    root.appendChild(document.createTextNode('\u200B'));
  }
}

function serializeDocument(root: HTMLDivElement): PromptDocument {
  const nodes: PromptDocument = [];

  const appendText = (text: string) => {
    const cleaned = text.replace(/\u200B/g, '');
    if (!cleaned) {
      return;
    }

    const last = nodes[nodes.length - 1];
    if (last?.type === 'text') {
      last.text += cleaned;
      return;
    }

    nodes.push({
      id: crypto.randomUUID(),
      type: 'text',
      text: cleaned,
    });
  };

  const appendLineBreak = () => {
    if (nodes.length === 0) {
      return;
    }

    const last = nodes[nodes.length - 1];
    if (last?.type === 'text') {
      last.text += '\n';
      return;
    }

    nodes.push({
      id: crypto.randomUUID(),
      type: 'text',
      text: '\n',
    });
  };

  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      appendText(node.textContent ?? '');
      return;
    }

    if (!(node instanceof HTMLElement)) {
      return;
    }

    if (node.dataset.nodeType === 'catalog-option') {
      const optionId = node.dataset.optionId;
      if (optionId) {
        nodes.push({
          id: crypto.randomUUID(),
          type: 'catalog-option',
          optionId,
        });
      }
      return;
    }

    if (node.tagName === 'BR') {
      appendLineBreak();
      return;
    }

    if (node.tagName === 'DIV' || node.tagName === 'P') {
      if (nodes.length > 0) {
        appendLineBreak();
      }
      Array.from(node.childNodes).forEach((child) => walk(child));
      return;
    }

    Array.from(node.childNodes).forEach((child) => walk(child));
  };

  Array.from(root.childNodes).forEach((child) => walk(child));
  return normalizePromptDocument(nodes.length > 0 ? nodes : createEmptyPromptDocument());
}

function insertLineBreakAtSelection(root: HTMLDivElement, selectionRef: { current: Range | null }) {
  const selection = window.getSelection();
  const range = selectionRef.current;

  if (!selection || !range || !root.contains(range.startContainer)) {
    root.appendChild(document.createElement('br'));
    root.appendChild(document.createTextNode('\u200B'));
    return;
  }

  range.deleteContents();

  const br = document.createElement('br');
  const spacer = document.createTextNode('\u200B');

  range.insertNode(spacer);
  range.insertNode(br);

  const nextRange = document.createRange();
  nextRange.setStart(spacer, spacer.textContent?.length ?? 0);
  nextRange.collapse(true);

  selection.removeAllRanges();
  selection.addRange(nextRange);
  selectionRef.current = nextRange.cloneRange();
}

function getAdjacentChipFromRange(range: Range, direction: 'backward' | 'forward') {
  const container = range.startContainer;
  const offset = range.startOffset;

  const resolveChip = (node: Node | null, step: 'previousSibling' | 'nextSibling') => {
    let cursor = node;
    while (cursor) {
      if (cursor instanceof HTMLElement && cursor.dataset.nodeType === 'catalog-option') {
        return cursor;
      }

      if (cursor.nodeType === Node.TEXT_NODE && cursor.textContent === '\u200B') {
        cursor = cursor[step];
        continue;
      }

      return null;
    }

    return null;
  };

  if (container.nodeType === Node.TEXT_NODE) {
    const text = container.textContent ?? '';
    if (direction === 'backward' && offset === 0) {
      return resolveChip(container.previousSibling, 'previousSibling');
    }
    if (direction === 'forward' && offset === text.length) {
      return resolveChip(container.nextSibling, 'nextSibling');
    }
    return null;
  }

  if (container instanceof HTMLElement) {
    if (direction === 'backward' && offset > 0) {
      return resolveChip(container.childNodes[offset - 1] ?? null, 'previousSibling');
    }
    if (direction === 'forward') {
      return resolveChip(container.childNodes[offset] ?? null, 'nextSibling');
    }
  }

  return null;
}

export function PromptEditor({
  mode,
  promptId,
  initialTitle = '',
  initialDocument = createEmptyPromptDocument(),
  initialCurrentVersion = 1,
  initialVersions = [],
  catalogs,
}: Props) {
  const normalizedInitialDocument = normalizePromptDocument(initialDocument);
  const editorRef = useRef<HTMLDivElement>(null);
  const selectionRef = useRef<Range | null>(null);
  const selectedChipRef = useRef<HTMLElement | null>(null);
  const composingRef = useRef(false);

  const [title, setTitle] = useState(initialTitle);
  const [currentDocument, setCurrentDocument] = useState<PromptDocument>(normalizedInitialDocument);
  const [currentVersion, setCurrentVersion] = useState(initialCurrentVersion);
  const [versions, setVersions] = useState<PromptVersionResponse[]>(initialVersions);
  const [selectedVersionId, setSelectedVersionId] = useState<string>(
    initialVersions[0]?.id ?? '',
  );
  const [, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerMode, setPickerMode] = useState<PickerMode>('insert');
  const [pickerCatalogId, setPickerCatalogId] = useState<string | null>(null);
  const [preview, setPreview] = useState('');
  const [previewEnabled, setPreviewEnabled] = useState(false);
  const [copyFeedbackVisible, setCopyFeedbackVisible] = useState(false);

  const optionIndex = buildOptionIndex(catalogs);
  const catalogIndex = buildCatalogIndex(catalogs);
  const activeCatalogs = catalogs.map((catalog) => ({
    ...catalog,
    options: catalog.options.filter((option) => !option.is_archived),
  }));

  const applyDocumentState = (nextDocument: PromptDocument) => {
    setCurrentDocument(nextDocument);
    setPreview(resolvePromptDocument(nextDocument, optionIndex));
  };

  const applyVersionState = (nextDocument: PromptDocument) => {
    const normalizedDocument = normalizePromptDocument(nextDocument);
    setCurrentDocument(normalizedDocument);
    setPreview(resolvePromptDocument(normalizedDocument, optionIndex));

    const root = editorRef.current;
    if (root && !previewEnabled) {
      renderDocument(root, normalizedDocument, optionIndex, catalogIndex);
    }
  };

  const syncFromEditor = () => {
    const root = editorRef.current;
    if (!root) {
      return currentDocument;
    }

    const nextDocument = serializeDocument(root);
    applyDocumentState(nextDocument);
    return nextDocument;
  };

  useEffect(() => {
    setPreview(resolvePromptDocument(normalizedInitialDocument, optionIndex));
  }, []);

  useEffect(() => {
    if (previewEnabled) {
      return;
    }

    const root = editorRef.current;
    if (!root) {
      return;
    }

    renderDocument(root, currentDocument, optionIndex, catalogIndex);
  }, [previewEnabled]);

  useEffect(() => {
    if (mode !== 'edit') {
      return;
    }

    const selectedVersion = versions.find((version) => version.id === selectedVersionId);
    if (!selectedVersion) {
      return;
    }

    applyVersionState(selectedVersion.document);
    clearSelection();
    selectionRef.current = null;
  }, [selectedVersionId]);

  const rememberSelection = () => {
    const root = editorRef.current;
    const selection = window.getSelection();
    if (!root || !selection || selection.rangeCount === 0) {
      return;
    }

    const range = selection.getRangeAt(0);
    if (!root.contains(range.startContainer)) {
      return;
    }

    selectionRef.current = range.cloneRange();
  };

  const clearSelection = () => {
    if (selectedChipRef.current) {
      selectedChipRef.current.dataset.selected = 'false';
      selectedChipRef.current = null;
    }
  };

  const selectChip = (chip: HTMLElement) => {
    clearSelection();
    chip.dataset.selected = 'true';
    selectedChipRef.current = chip;
  };

  const handleEditorClick = (event: MouseEvent) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      clearSelection();
      return;
    }

    const chip = target.closest<HTMLElement>('[data-node-type="catalog-option"]');
    if (!chip) {
      clearSelection();
      rememberSelection();
      return;
    }

    selectChip(chip);
    setPickerMode('replace');
    setPickerCatalogId(chip.dataset.catalogId ?? null);
    setPickerOpen(true);
  };

  const handleEditorKeyDown = (event: KeyboardEvent) => {
    const root = editorRef.current;
    if (!root) {
      return;
    }

    if (composingRef.current || event.isComposing || event.key === 'Process') {
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      insertLineBreakAtSelection(root, selectionRef);
      clearSelection();
      syncFromEditor();
      return;
    }

    if (event.key === 'Backspace' || event.key === 'Delete') {
      if (selectedChipRef.current) {
        event.preventDefault();
        removeSelectedOption();
        return;
      }

      const selection = window.getSelection();
      const range =
        selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : selectionRef.current;

      if (!range || !range.collapsed) {
        return;
      }

      const adjacentChip = getAdjacentChipFromRange(
        range,
        event.key === 'Backspace' ? 'backward' : 'forward',
      );

      if (adjacentChip) {
        event.preventDefault();
        selectChip(adjacentChip);
        removeSelectedOption();
      }
    }
  };

  const openPicker = (modeValue: PickerMode, catalogId?: string | null) => {
    setPickerMode(modeValue);
    setPickerCatalogId(catalogId ?? null);
    setPickerOpen(true);
  };

  const insertOrReplaceOption = (optionId: string) => {
    const option = optionIndex.get(optionId);
    const root = editorRef.current;
    if (!root || !option) {
      return;
    }

    if (pickerMode === 'replace' && selectedChipRef.current) {
      const catalog = catalogIndex.get(option.id);
      applyChipContent(
        selectedChipRef.current,
        option.id,
        option.label,
        catalog?.id ?? '',
        catalog?.name ?? 'Catalog',
      );
      syncFromEditor();
      setPickerOpen(false);
      return;
    }

    const catalog = catalogIndex.get(option.id);
    const chip = createChipElement(
      option.id,
      option.label,
      catalog?.id ?? '',
      catalog?.name ?? 'Catalog',
    );
    const spacer = document.createTextNode('\u200B');
    const selection = window.getSelection();
    const range = selectionRef.current;

    if (range && root.contains(range.startContainer)) {
      range.deleteContents();
      range.insertNode(spacer);
      range.insertNode(chip);

      const nextRange = document.createRange();
      nextRange.setStart(spacer, spacer.textContent?.length ?? 0);
      nextRange.collapse(true);
      selection?.removeAllRanges();
      selection?.addRange(nextRange);
      selectionRef.current = nextRange.cloneRange();
    } else {
      root.appendChild(chip);
      root.appendChild(spacer);
    }

    clearSelection();
    syncFromEditor();
    setPickerOpen(false);
  };

  const removeSelectedOption = () => {
    const chip = selectedChipRef.current;
    if (!chip) {
      return;
    }

    const nextSibling = chip.nextSibling;
    chip.remove();
    if (nextSibling?.nodeType === Node.TEXT_NODE && nextSibling.textContent === '\u200B') {
      nextSibling.remove();
    }

    clearSelection();
    syncFromEditor();
  };

  const handleSubmit = async (event: Event) => {
    event.preventDefault();

    setLoading(true);
    setStatus(mode === 'create' ? 'Prompt を作成中...' : 'Prompt を保存中...');

    const payload = {
      title: title.trim(),
      document: previewEnabled ? currentDocument : syncFromEditor(),
    };

    const url = mode === 'create' ? '/api/prompts' : `/api/prompts/${promptId}`;
    const method = mode === 'create' ? 'POST' : 'PATCH';

    try {
      const response = await fetch(url, {
        method,
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error ?? 'Prompt save failed');
      }

      setStatus(mode === 'create' ? '作成しました。移動します...' : '保存しました。');
      if (mode === 'create') {
        setTimeout(() => {
          window.location.href = `/prompts/${json.data.id}/edit`;
        }, 400);
      } else {
        const nextVersion = json.data.current_version;
        const nextDocument = payload.document;
        const nextVersionId = crypto.randomUUID();

        setCurrentVersion(nextVersion);
        setVersions((current) => [
          {
            id: nextVersionId,
            prompt_id: promptId ?? '',
            version: nextVersion,
            title: payload.title,
            document: nextDocument,
            created_at: new Date(),
          },
          ...current,
        ]);
        setSelectedVersionId(nextVersionId);
        applyVersionState(nextDocument);
        setLoading(false);
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Prompt save failed');
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!promptId) {
      return;
    }

    if (!window.confirm('この Prompt を削除しますか？')) {
      return;
    }

    setLoading(true);
    setStatus('Prompt を削除中...');

    try {
      const response = await fetch(`/api/prompts/${promptId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error ?? 'Prompt delete failed');
      }

      window.location.href = '/';
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Prompt delete failed');
      setLoading(false);
    }
  };

  const copyPrompt = async () => {
    const text = resolvePromptDocument(currentDocument, optionIndex);
    if (!text.trim()) {
      setStatus('コピーする Prompt がありません。');
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      setStatus('Prompt をコピーしました。');
      setCopyFeedbackVisible(true);
    } catch {
      setStatus('コピーに失敗しました。ブラウザの権限設定を確認してください。');
    }
  };

  useEffect(() => {
    if (!copyFeedbackVisible) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setCopyFeedbackVisible(false);
    }, 1600);

    return () => window.clearTimeout(timeoutId);
  }, [copyFeedbackVisible]);

  const selectedPickerCatalog = pickerCatalogId
    ? activeCatalogs.find((catalog) => catalog.id === pickerCatalogId) ?? null
    : null;
  const showCatalogList = pickerMode === 'insert' && !selectedPickerCatalog;
  const visibleCatalogs = showCatalogList
    ? activeCatalogs
    : selectedPickerCatalog
      ? [selectedPickerCatalog]
      : [];
  const pickerTitle = showCatalogList ? 'Catalogs' : selectedPickerCatalog?.name ?? 'Catalog';
  const selectedVersion = versions.find((version) => version.id === selectedVersionId) ?? null;
  const hasVersions = mode === 'edit' && versions.length > 0;
  const isViewingPastVersion =
    hasVersions &&
    selectedVersion !== null &&
    selectedVersion.version !== currentVersion;
  const saveLabel = loading
    ? 'Saving...'
    : isViewingPastVersion
      ? 'Save as New Version'
      : 'Save';

  const promptContent = (
    <>
      <section className="panel prompt-name-panel stack-sm">
        <div className="prompt-panel-header">
          <h2 className="section-title">Name</h2>
        </div>
        <input
          id="prompt-title"
          className="text-input"
          value={title}
          onInput={(event) => setTitle(event.currentTarget.value)}
          maxLength={200}
          placeholder="Prompt 名"
          required
        />
      </section>

      <div className="editor-preview-grid editor-preview-grid-single">
        {previewEnabled ? (
          <section className="preview-panel">
            <div className="editor-toolbar">
              <div className="editor-toolbar-main">
                <h2 className="section-title">Prompt</h2>
              </div>
              <div className="toolbar-meta">
                <p className="muted-copy">{toPlainPromptText(preview).length} chars</p>
                <label className="preview-toggle">
                  <span className="preview-toggle-label">Preview</span>
                  <button
                    type="button"
                    className={`preview-switch${previewEnabled ? ' is-on' : ''}`}
                    aria-pressed={previewEnabled}
                    onClick={() => setPreviewEnabled((current) => !current)}
                  >
                    <span className="preview-switch-thumb" />
                  </button>
                </label>
                <button
                  type="button"
                  className={`icon-button${copyFeedbackVisible ? ' is-success' : ''}`}
                  aria-label={copyFeedbackVisible ? 'コピーしました' : 'Prompt をコピー'}
                  onClick={copyPrompt}
                >
                  {copyFeedbackVisible ? (
                    <Check aria-hidden="true" />
                  ) : (
                    <Copy aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>
            <pre className="resolved-preview">{preview || 'ここに現在の Prompt 展開結果が表示されます。'}</pre>
          </section>
        ) : (
          <section className="editor-panel">
            <div className="editor-toolbar">
              <div className="editor-toolbar-main">
                <div className="editor-title-row">
                  <h2 className="section-title">Prompt</h2>
                  <button
                    type="button"
                    className="btn-secondary button-with-icon"
                    onClick={() => openPicker('insert')}
                  >
                    <span className="button-icon" aria-hidden="true">
                      <Plus />
                    </span>
                    Item
                  </button>
                </div>
              </div>
              <div className="toolbar-meta">
                <p className="muted-copy">{toPlainPromptText(preview).length} chars</p>
                <label className="preview-toggle">
                  <span className="preview-toggle-label">Preview</span>
                  <button
                    type="button"
                    className={`preview-switch${previewEnabled ? ' is-on' : ''}`}
                    aria-pressed={previewEnabled}
                    onClick={() => setPreviewEnabled((current) => !current)}
                  >
                    <span className="preview-switch-thumb" />
                  </button>
                </label>
                <button
                  type="button"
                  className={`icon-button${copyFeedbackVisible ? ' is-success' : ''}`}
                  aria-label={copyFeedbackVisible ? 'コピーしました' : 'Prompt をコピー'}
                  onClick={copyPrompt}
                >
                  {copyFeedbackVisible ? (
                    <Check aria-hidden="true" />
                  ) : (
                    <Copy aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>

            <div
              ref={editorRef}
              className="prompt-editor"
              contentEditable
              spellcheck={false}
              onCompositionStart={() => {
                composingRef.current = true;
              }}
              onCompositionEnd={() => {
                composingRef.current = false;
              }}
              onClick={handleEditorClick}
              onKeyDown={handleEditorKeyDown}
              onKeyUp={rememberSelection}
              onMouseUp={rememberSelection}
              onInput={syncFromEditor}
            />
          </section>
        )}
      </div>
    </>
  );

  return (
    <div className={`prompt-editor-shell${hasVersions ? ' has-versions-layout' : ''}`}>
      {hasVersions ? (
        <form className="prompt-edit-layout has-versions" onSubmit={handleSubmit}>
          <div className="prompt-edit-main prompt-edit-main-with-versions">
            <div className="field-nav-row">
              <a href="/" className="btn-secondary button-with-icon nav-back-link" aria-label="Prompts に戻る">
                <ArrowLeft aria-hidden="true" />
                <span>Prompts</span>
              </a>
            </div>

            {promptContent}

            <div className="page-actions">
              <button type="submit" className="btn-primary" disabled={loading}>
                {saveLabel}
              </button>
              {mode === 'edit' && promptId ? (
                <a href={`/playground?promptId=${promptId}`} className="btn-secondary">
                  Open in Playground
                </a>
              ) : null}
              {mode === 'edit' ? (
                <button type="button" className="btn-ghost-danger" onClick={handleDelete} disabled={loading}>
                  Delete
                </button>
              ) : null}
            </div>
          </div>

          {hasVersions ? (
            <aside className="panel prompt-versions-panel stack-sm">
              <div className="prompt-panel-header">
                <h2 className="section-title">Versions</h2>
              </div>
              <div className="prompt-versions-list">
                {versions.map((version) => {
                  const isSelected = version.id === selectedVersionId;
                  const isCurrent = version.version === currentVersion;

                  return (
                    <button
                      key={version.id}
                      type="button"
                      className={`prompt-version-item${isSelected ? ' is-selected' : ''}`}
                      onClick={() => setSelectedVersionId(version.id)}
                      disabled={loading}
                    >
                      <div className="prompt-version-item-header">
                        <span className="prompt-version-item-label">{`v${version.version}`}</span>
                        {isCurrent ? (
                          <span className="prompt-version-current-badge">Current</span>
                        ) : null}
                      </div>
                      <p className="prompt-version-item-date">{formatVersionDate(version.created_at)}</p>
                    </button>
                  );
                })}
              </div>
            </aside>
          ) : null}
        </form>
      ) : (
        <form className="stack-lg prompt-editor-form" onSubmit={handleSubmit}>
          <div className="field-nav-row">
            <a href="/" className="btn-secondary button-with-icon nav-back-link" aria-label="Prompts に戻る">
              <ArrowLeft aria-hidden="true" />
              <span>Prompts</span>
            </a>
          </div>

          {promptContent}

          <div className="page-actions">
            <button type="submit" className="btn-primary" disabled={loading}>
              {saveLabel}
            </button>
            {mode === 'edit' && promptId ? (
              <a href={`/playground?promptId=${promptId}`} className="btn-secondary">
                Open in Playground
              </a>
            ) : null}
            {mode === 'edit' ? (
              <button type="button" className="btn-ghost-danger" onClick={handleDelete} disabled={loading}>
                Delete
              </button>
            ) : null}
          </div>
        </form>
      )}

      {pickerOpen ? (
        <div className="picker-backdrop" onClick={() => setPickerOpen(false)}>
          <div className="picker-panel" onClick={(event) => event.stopPropagation()}>
            <div className="section-row">
              <div className="picker-title-row">
                {pickerMode === 'insert' && selectedPickerCatalog ? (
                  <button
                    type="button"
                    className="icon-button icon-button-nav"
                    aria-label="Catalogs に戻る"
                    onClick={() => setPickerCatalogId(null)}
                  >
                    <ArrowLeft aria-hidden="true" />
                  </button>
                ) : null}
                <h2 className="section-title">{pickerTitle}</h2>
              </div>
              <div className="picker-actions">
                <button type="button" className="btn-secondary" onClick={() => setPickerOpen(false)}>
                  Close
                </button>
              </div>
            </div>

            <div className="picker-results">
              {showCatalogList ? (
                <div className="token-grid">
                  {activeCatalogs.map((catalog) => (
                    <button
                      type="button"
                      key={catalog.id}
                      className="token-choice token-choice-catalog"
                      onClick={() => setPickerCatalogId(catalog.id)}
                    >
                      <span className="token-choice-label">{catalog.name}</span>
                    </button>
                  ))}
                </div>
              ) : (
                visibleCatalogs.map((catalog) => (
                  <section className="stack-sm" key={catalog.id}>
                    <div className="token-grid">
                      {catalog.options.map((option) => (
                        <button
                          type="button"
                          key={option.id}
                          className="token-choice"
                          onClick={() => insertOrReplaceOption(option.id)}
                        >
                          <span className="token-choice-label">{option.label}</span>
                        </button>
                      ))}
                    </div>
                  </section>
                ))
              )}

              {showCatalogList && activeCatalogs.length === 0 ? (
                <div className="empty-panel">
                  <p className="empty-panel-title">Catalog がありません</p>
                  <p className="muted-copy">Catalog を作成すると、ここから Item を挿入できます。</p>
                </div>
              ) : null}

              {!showCatalogList && visibleCatalogs[0]?.options.length === 0 ? (
                <div className="empty-panel">
                  <p className="empty-panel-title">Item がありません</p>
                  <p className="muted-copy">この Catalog に Item を追加してから選択できます。</p>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
