import { ChevronDown, ChevronUp, Ellipsis, ImagePlus, SlidersHorizontal, X } from 'lucide-preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { defaultModel, getSupportedModel, supportedModels } from '../lib/playground-logic';
import type { CatalogResponse } from '../lib/server/api';
import type { PromptDocument } from '../lib/prompt-document';

type PromptOption = {
  id: string;
  title: string;
  current_version: number;
  document: PromptDocument;
};

type Artifact = {
  id: string;
  kind: string;
  source_type: string;
  url: string | null;
  text_content: string | null;
  mime_type: string | null;
  created_at: string | Date;
  slot?: 'reference' | 'start' | 'end' | null;
};

type HistoryItem = {
  id: string;
  prompt_id: string | null;
  prompt_title: string;
  prompt_version: number | null;
  model: string;
  resolved_prompt: string;
  status: string;
  error_message: string | null;
  created_at: string | Date;
  updated_at: string | Date;
  input_artifacts: Artifact[];
  output_artifacts: Artifact[];
};

type Props = {
  prompts: PromptOption[];
  catalogs: CatalogResponse[];
  initialPromptId?: string | null;
};

type KlingInputSlot = 'start' | 'end';
type UploadTarget = 'nanobanana-reference' | 'kling-start' | 'kling-end';

type LocalImageInput = {
  id: string;
  kind: 'image';
  source_type: 'upload-local';
  url: string;
  mime_type: string | null;
  data_url: string;
};

type ImageInputItem = Artifact | LocalImageInput;

type ActionMenuChoice = {
  value: string;
  label: string;
  selected: boolean;
  onSelect: () => void;
};

type ActionMenuSection = {
  label: string;
  choices: ActionMenuChoice[];
};

type ProviderActionMenu = {
  summary: string;
  sections: ActionMenuSection[];
};

type HistoryMediaMenuState = {
  runId: string;
  artifactId: string;
};

type HistoryMediaAction = {
  label: string;
  onSelect: () => void;
};

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
  nodeId: string,
  optionId: string,
  label: string,
  catalogId: string,
  catalogName: string,
) {
  const chip = document.createElement('span');
  chip.className = 'prompt-token playground-prompt-token';
  chip.dataset.nodeType = 'catalog-option';
  chip.dataset.nodeId = nodeId;
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
        node.id,
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
      const nodeId = node.dataset.nodeId;
      if (optionId && nodeId) {
        nodes.push({
          id: nodeId,
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
  return nodes.length > 0 ? nodes : [{ id: crypto.randomUUID(), type: 'text', text: '' }];
}

function formatDate(value: string | Date) {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}/${month}/${day} ${hours}:${minutes}`;
}

function statusLabel(status: string) {
  if (status === 'succeeded') return 'Succeeded';
  if (status === 'failed') return 'Failed';
  if (status === 'running') return 'Running';
  return status;
}

function firstOutput(historyItem: HistoryItem) {
  return historyItem.output_artifacts[0] ?? null;
}

function historyKindLabel(item: HistoryItem) {
  const output = firstOutput(item);
  if (output?.kind) {
    return output.kind;
  }

  const modelId = item.model.split('/')[1] ?? item.model;
  if (modelId.includes('flash-image') || item.model.startsWith('nanobanana/')) {
    return 'image';
  }
  if (item.model.startsWith('klingai/')) {
    return 'video';
  }

  return 'text';
}

function inputTileMetaLabel(artifact: ImageInputItem) {
  if (isLocalImageInput(artifact)) {
    return 'Local image';
  }

  return `Artifact #${artifact.id.slice(0, 8)}`;
}

function inputSlotLabel(slot?: Artifact['slot']) {
  if (slot === 'reference') {
    return 'Reference image';
  }
  if (slot === 'start') {
    return 'Start frame';
  }
  if (slot === 'end') {
    return 'End frame';
  }
  return 'Input image';
}

function artifactFileName(artifact: Artifact) {
  const extension = artifact.kind === 'video'
    ? artifact.mime_type === 'video/webm'
      ? 'webm'
      : 'mp4'
    : artifact.mime_type === 'image/jpeg'
      ? 'jpg'
      : artifact.mime_type === 'image/webp'
        ? 'webp'
        : artifact.kind === 'image'
          ? 'png'
          : 'txt';

  return `${artifact.kind}-${artifact.id.slice(0, 8)}.${extension}`;
}

function HistoryMediaCard({
  artifact,
  label,
  showLabel = true,
  menuOpen,
  onToggleMenu,
  onCloseMenu,
  actions,
}: {
  artifact: Artifact;
  label: string;
  showLabel?: boolean;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onCloseMenu: () => void;
  actions: HistoryMediaAction[];
}) {
  return (
    <div className="playground-history-media-card">
      <div className="playground-history-media-button">
        {artifact.kind === 'video' ? (
          <video src={artifact.url ?? undefined} className="playground-history-media-surface" preload="metadata" muted playsInline />
        ) : (
          <img src={artifact.url ?? ''} alt="" className="playground-history-media-surface" />
        )}
      </div>

      <button
        type="button"
        className="playground-history-media-trigger"
        onClick={onToggleMenu}
        aria-label={`${label} actions`}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        data-history-menu-trigger="true"
      >
        <Ellipsis size={16} strokeWidth={2} />
      </button>

      {showLabel ? <p className="playground-history-media-label">{label}</p> : null}

      {menuOpen ? (
        <div className="playground-history-media-menu" data-history-menu="true">
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              className="playground-history-media-menu-item"
              onClick={() => {
                action.onSelect();
                onCloseMenu();
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

type InputTileProps = {
  title: string;
  artifact: ImageInputItem | null;
  onSelect?: () => void;
  onRemove?: () => void;
};

function InputTile({ title, artifact, onSelect, onRemove }: InputTileProps) {
  return (
    <button type="button" className={`playground-input-tile${artifact ? ' is-filled' : ''}`} onClick={onSelect}>
      {artifact?.url ? (
        <img src={artifact.url} alt="" className="playground-input-tile-media" />
      ) : (
        <div className="playground-input-tile-placeholder">
          <ImagePlus size={24} strokeWidth={1.8} />
        </div>
      )}

      <div className="playground-input-tile-copy">
        <p className="playground-input-tile-title">{title}</p>
        {artifact ? <p className="playground-input-tile-meta">{inputTileMetaLabel(artifact)}</p> : null}
      </div>

      {artifact && onRemove ? (
        <button
          type="button"
          className="playground-input-tile-remove"
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
          aria-label={`${title} を削除`}
        >
          <X size={14} strokeWidth={2} />
        </button>
      ) : null}
    </button>
  );
}

function isLocalImageInput(input: ImageInputItem): input is LocalImageInput {
  return input.source_type === 'upload-local';
}

function buildNanobananaActionMenu(
  aspectRatio: string,
  setAspectRatio: (value: string) => void,
): ProviderActionMenu {
  return {
    summary: aspectRatio,
    sections: [
      {
        label: 'Ratio',
        choices: ['16:9', '1:1', '9:16'].map((value) => ({
          value,
          label: value,
          selected: aspectRatio === value,
          onSelect: () => setAspectRatio(value),
        })),
      },
    ],
  };
}

function buildKlingActionMenu(
  durationSeconds: string,
  klingMode: 'std' | 'pro',
  aspectRatio: string,
  outputCount: string,
  setDurationSeconds: (value: string) => void,
  setKlingMode: (value: 'std' | 'pro') => void,
  setAspectRatio: (value: string) => void,
  setOutputCount: (value: string) => void,
): ProviderActionMenu {
  return {
    summary: `${klingMode === 'pro' ? '1080p' : '720p'} · ${durationSeconds}s · ${aspectRatio} · ${outputCount}`,
    sections: [
      {
        label: 'Resolution',
        choices: [
          { value: 'std' as const, label: '720p' },
          { value: 'pro' as const, label: '1080p' },
        ].map((choice) => ({
          value: choice.value,
          label: choice.label,
          selected: klingMode === choice.value,
          onSelect: () => setKlingMode(choice.value),
        })),
      },
      {
        label: 'Duration',
        choices: ['5', '10'].map((value) => ({
          value,
          label: `${value}s`,
          selected: durationSeconds === value,
          onSelect: () => setDurationSeconds(value),
        })),
      },
      {
        label: 'Ratio',
        choices: ['16:9', '1:1', '9:16'].map((value) => ({
          value,
          label: value,
          selected: aspectRatio === value,
          onSelect: () => setAspectRatio(value),
        })),
      },
      {
        label: 'Outputs',
        choices: ['1', '2', '3', '4'].map((value) => ({
          value,
          label: value,
          selected: outputCount === value,
          onSelect: () => setOutputCount(value),
        })),
      },
    ],
  };
}

export function PlaygroundShell({ prompts, catalogs, initialPromptId = null }: Props) {
  const editorRef = useRef<HTMLDivElement>(null);
  const selectedChipRef = useRef<HTMLElement | null>(null);
  const actionMenuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedPromptId, setSelectedPromptId] = useState(initialPromptId ?? '');
  const [currentPromptDocument, setCurrentPromptDocument] = useState<PromptDocument>([]);
  const [model, setModel] = useState<string>(defaultModel);
  const [textContext, setTextContext] = useState('');
  const [aspectRatio, setAspectRatio] = useState('9:16');
  const [durationSeconds, setDurationSeconds] = useState('5');
  const [klingMode, setKlingMode] = useState<'std' | 'pro'>('std');
  const [outputCount, setOutputCount] = useState('1');
  const [nanobananaInput, setNanobananaInput] = useState<ImageInputItem | null>(null);
  const [klingStartInput, setKlingStartInput] = useState<ImageInputItem | null>(null);
  const [klingEndInput, setKlingEndInput] = useState<ImageInputItem | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [pickerNodeId, setPickerNodeId] = useState<string | null>(null);
  const [promptPickerOpen, setPromptPickerOpen] = useState(false);
  const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);
  const [uploadTarget, setUploadTarget] = useState<UploadTarget | null>(null);
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
  const [activeHistoryMenu, setActiveHistoryMenu] = useState<HistoryMediaMenuState | null>(null);

  useEffect(() => {
    const loadHistory = async () => {
      const response = await fetch('/api/history', {
        credentials: 'include',
      });

      const json = await response.json();
      if (!response.ok || !json.success) {
        setStatus(json.error ?? 'History の取得に失敗しました。');
        return;
      }

      setHistory(json.data);
    };

    void loadHistory();
  }, []);

  const selectedPrompt = prompts.find((prompt) => prompt.id === selectedPromptId) ?? null;
  const optionIndex = buildOptionIndex(catalogs);
  const catalogIndex = buildCatalogIndex(catalogs);
  const activeCatalogs = catalogs.map((catalog) => ({
    ...catalog,
    options: catalog.options.filter((option) => !option.is_archived),
  }));
  const selectedModel = getSupportedModel(model);
  const provider = selectedModel?.provider ?? 'openai';
  const allowsImageInputs = provider === 'klingai' || provider === 'nanobanana';
  const providerActionMenu =
    provider === 'nanobanana'
      ? buildNanobananaActionMenu(aspectRatio, setAspectRatio)
      : provider === 'klingai'
        ? buildKlingActionMenu(
            durationSeconds,
            klingMode,
            aspectRatio,
            outputCount,
            setDurationSeconds,
            setKlingMode,
            setAspectRatio,
            setOutputCount,
          )
        : null;
  const hasActionMenu = providerActionMenu !== null;
  const pickerNode = pickerNodeId
    ? currentPromptDocument.find(
        (node): node is Extract<PromptDocument[number], { type: 'catalog-option' }> =>
          node.id === pickerNodeId && node.type === 'catalog-option',
      ) ?? null
    : null;
  const selectedPickerCatalog = pickerCatalogIdFromNode(activeCatalogs, pickerNode?.optionId ?? null);

  useEffect(() => {
    const nextDocument = selectedPrompt?.document ?? [];
    setCurrentPromptDocument(nextDocument);
    setPickerNodeId(null);
    setPromptPickerOpen(false);
    clearSelectedChip();

    if (selectedPrompt && editorRef.current) {
      renderDocument(editorRef.current, nextDocument, optionIndex, catalogIndex);
    }
  }, [selectedPromptId]);

  useEffect(() => {
    if (provider === 'openai') {
      setNanobananaInput(null);
      setKlingStartInput(null);
      setKlingEndInput(null);
      return;
    }

    if (provider === 'nanobanana') {
      setKlingStartInput(null);
      setKlingEndInput(null);
      return;
    }

    if (provider === 'klingai') {
      setNanobananaInput(null);
    }
  }, [provider]);

  useEffect(() => {
    setIsActionMenuOpen(false);
  }, [provider]);

  useEffect(() => {
    if (!isActionMenuOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!actionMenuRef.current?.contains(event.target as Node)) {
        setIsActionMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [isActionMenuOpen]);

  useEffect(() => {
    if (!activeHistoryMenu) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        setActiveHistoryMenu(null);
        return;
      }

      if (target.closest('[data-history-menu="true"]') || target.closest('[data-history-menu-trigger="true"]')) {
        return;
      }

      setActiveHistoryMenu(null);
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [activeHistoryMenu]);

  const addNanobananaInput = (artifact: Artifact) => {
    if (provider !== 'nanobanana' || artifact.kind !== 'image') {
      return;
    }

    setNanobananaInput(artifact);
  };

  const setKlingInput = (slot: KlingInputSlot, artifact: Artifact) => {
    if (provider !== 'klingai' || artifact.kind !== 'image') {
      return;
    }

    if (slot === 'start') {
      setKlingStartInput(artifact);
      return;
    }

    setKlingEndInput(artifact);
  };

  const openLocalImagePicker = (target: UploadTarget) => {
    setUploadTarget(target);
    fileInputRef.current?.click();
  };

  const handleLocalImageChange = async (event: Event) => {
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    if (!file || !uploadTarget) {
      return;
    }

    if (!file.type.startsWith('image/')) {
      setStatus('画像ファイルを選択してください。');
      return;
    }

    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(new Error('画像の読み込みに失敗しました。'));
      reader.readAsDataURL(file);
    });

    const nextInput: LocalImageInput = {
      id: crypto.randomUUID(),
      kind: 'image',
      source_type: 'upload-local',
      url: dataUrl,
      mime_type: file.type || null,
      data_url: dataUrl,
    };

    if (uploadTarget === 'nanobanana-reference') {
      setNanobananaInput(nextInput);
    } else if (uploadTarget === 'kling-start') {
      setKlingStartInput(nextInput);
    } else if (uploadTarget === 'kling-end') {
      setKlingEndInput(nextInput);
    }

    setUploadTarget(null);
    (event.currentTarget as HTMLInputElement).value = '';
  };

  const removeInputArtifact = (artifactId: string) => {
    if (provider === 'nanobanana') {
      if (nanobananaInput?.id === artifactId) {
        setNanobananaInput(null);
      }
      return;
    }

    if (provider === 'klingai') {
      if (klingStartInput?.id === artifactId) {
        setKlingStartInput(null);
      }
      if (klingEndInput?.id === artifactId) {
        setKlingEndInput(null);
      }
    }
  };

  const clearSelectedChip = () => {
    selectedChipRef.current?.classList.remove('is-active');
    selectedChipRef.current = null;
  };

  const replacePromptOption = (nodeId: string, nextOptionId: string) => {
    const nextDocument = currentPromptDocument.map((node) =>
      node.type === 'catalog-option' && node.id === nodeId
        ? { ...node, optionId: nextOptionId }
        : node,
    );

    setCurrentPromptDocument(nextDocument);
    if (editorRef.current) {
      renderDocument(editorRef.current, nextDocument, optionIndex, catalogIndex);
    }
    clearSelectedChip();
    setPickerNodeId(null);
  };

  const handlePromptInput = () => {
    const root = editorRef.current;
    if (!root) {
      return;
    }

    setCurrentPromptDocument(serializeDocument(root));
  };

  const handlePromptClick = (event: MouseEvent) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      clearSelectedChip();
      setPickerNodeId(null);
      return;
    }

    const chip = target.closest<HTMLElement>('[data-node-type="catalog-option"]');
    if (!chip) {
      clearSelectedChip();
      setPickerNodeId(null);
      return;
    }

    clearSelectedChip();
    chip.classList.add('is-active');
    selectedChipRef.current = chip;
    setPickerNodeId(chip.dataset.nodeId ?? null);
    setPromptPickerOpen(true);
  };

  const downloadArtifact = (artifact: Artifact) => {
    if (!artifact.url) {
      return;
    }

    const link = document.createElement('a');
    link.href = artifact.url;
    link.download = artifactFileName(artifact);
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const openArtifact = (artifact: Artifact) => {
    if (!artifact.url) {
      return;
    }

    window.open(artifact.url, '_blank', 'noopener,noreferrer');
  };

  const historyMediaActions = (artifact: Artifact): HistoryMediaAction[] => {
    const actions: HistoryMediaAction[] = [
      {
        label: 'Open',
        onSelect: () => openArtifact(artifact),
      },
      {
        label: 'Download',
        onSelect: () => downloadArtifact(artifact),
      },
    ];

    if (artifact.kind === 'image') {
      if (provider === 'nanobanana') {
        actions.push({
          label: 'Use as reference image',
          onSelect: () => addNanobananaInput(artifact),
        });
      }

      if (provider === 'klingai') {
        actions.push(
          {
            label: 'Use as start frame',
            onSelect: () => setKlingInput('start', artifact),
          },
          {
            label: 'Use as end frame',
            onSelect: () => setKlingInput('end', artifact),
          },
        );
      }
    }

    return actions;
  };

  const handleSubmit = async (event: Event) => {
    event.preventDefault();
    if (!selectedPromptId && !textContext.trim()) {
      setStatus('Prompt が未設定の場合は Free Text Context を入力してください。');
      return;
    }

    setLoading(true);
    setStatus('Generate を実行中...');

    const payload = {
      prompt_id: selectedPromptId || null,
      prompt_document: selectedPromptId ? currentPromptDocument : undefined,
      model,
      text_context: selectedPromptId ? '' : textContext,
      inputs: allowsImageInputs
        ? provider === 'nanobanana'
          ? nanobananaInput
            ? [isLocalImageInput(nanobananaInput)
                ? {
                    slot: 'reference' as const,
                    data_url: nanobananaInput.data_url,
                    mime_type: nanobananaInput.mime_type ?? undefined,
                  }
                : {
                    slot: 'reference' as const,
                    artifact_id: nanobananaInput.id,
                  }]
            : []
          : ([
              klingStartInput
                ? isLocalImageInput(klingStartInput)
                  ? {
                      slot: 'start' as const,
                      data_url: klingStartInput.data_url,
                      mime_type: klingStartInput.mime_type ?? undefined,
                    }
                  : {
                      slot: 'start' as const,
                      artifact_id: klingStartInput.id,
                    }
                : null,
              klingEndInput
                ? isLocalImageInput(klingEndInput)
                  ? {
                      slot: 'end' as const,
                      data_url: klingEndInput.data_url,
                      mime_type: klingEndInput.mime_type ?? undefined,
                    }
                  : {
                      slot: 'end' as const,
                      artifact_id: klingEndInput.id,
                    }
                : null,
            ].filter((artifact) => artifact !== null) as Array<{
              slot: 'start' | 'end';
              artifact_id?: string;
              data_url?: string;
              mime_type?: string;
            }>)
        : [],
      settings: {
        aspect_ratio: providerActionMenu ? aspectRatio : undefined,
        duration_seconds: provider === 'klingai' ? Number(durationSeconds) : undefined,
        kling_mode: provider === 'klingai' ? klingMode : undefined,
        output_count: provider === 'klingai' ? Number(outputCount) : undefined,
      },
    };

    try {
      const response = await fetch('/api/runs', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error ?? 'Run の実行に失敗しました。');
      }

      setHistory((current) => [json.data, ...current.filter((item) => item.id !== json.data.id)]);
      setStatus(json.data.status === 'failed' ? (json.data.error_message ?? 'Generate failed') : 'Generate を保存しました。');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Run の実行に失敗しました。');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="playground-shell">
      <div className="playground-grid">
        <form className="playground-composer stack-md" onSubmit={handleSubmit}>
          <div className="playground-composer-body stack-md">
            <div className="stack-sm">
              <label className="field-label" htmlFor="playground-model">
                Model
              </label>
            <select
              id="playground-model"
              className="text-input select-input playground-select"
              value={model}
              onChange={(event) => {
                const nextValue = event.currentTarget.value;
                const canonicalModel = getSupportedModel(nextValue)?.value ?? nextValue;
                setModel(canonicalModel);
                }}
              >
                {supportedModels.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="stack-sm">
              <label className="field-label" htmlFor="playground-prompt">
                Using Prompt
              </label>
            <select
              id="playground-prompt"
              className="text-input select-input playground-select"
              value={selectedPromptId}
              onChange={(event) => setSelectedPromptId(event.currentTarget.value)}
            >
                <option value="">未設定</option>
                {prompts.map((prompt) => (
                  <option key={prompt.id} value={prompt.id}>
                    {prompt.title} / v{prompt.current_version}
                  </option>
                ))}
              </select>
            </div>

            <div className="stack-sm">
              {selectedPrompt ? (
                <>
                  <span className="field-label">Input</span>
                  <div
                    ref={editorRef}
                    className="prompt-editor playground-text-context playground-prompt-preview"
                    contentEditable
                    onInput={handlePromptInput}
                    onClick={handlePromptClick}
                  />
                </>
              ) : (
                <>
                  <label className="field-label" htmlFor="playground-text-context">
                    Input
                  </label>
                  <textarea
                    id="playground-text-context"
                    className="text-area playground-text-context"
                    rows={6}
                    value={textContext}
                    onInput={(event) => setTextContext(event.currentTarget.value)}
                    placeholder="自由にプロンプトを書いて実行する"
                  />
                </>
              )}

              {provider === 'nanobanana' ? (
                <div className="playground-input-row">
                  <InputTile
                    title="Reference image"
                    artifact={nanobananaInput}
                    onSelect={() => openLocalImagePicker('nanobanana-reference')}
                    onRemove={nanobananaInput ? () => removeInputArtifact(nanobananaInput.id) : undefined}
                  />
                </div>
              ) : provider === 'klingai' ? (
              <div className="playground-input-row">
                <InputTile
                  title="Start frame"
                  artifact={klingStartInput}
                  onSelect={() => openLocalImagePicker('kling-start')}
                  onRemove={klingStartInput ? () => removeInputArtifact(klingStartInput.id) : undefined}
                />
                <InputTile
                  title="End frame"
                  artifact={klingEndInput}
                  onSelect={() => openLocalImagePicker('kling-end')}
                  onRemove={klingEndInput ? () => removeInputArtifact(klingEndInput.id) : undefined}
                />
              </div>
            ) : null}
            </div>
          </div>

          <div className="playground-composer-footer">
            <div className="playground-action-bar">
              <div className="playground-action-controls" ref={actionMenuRef}>
                {hasActionMenu ? (
                  <>
                    {isActionMenuOpen ? (
                      <div className="playground-action-panel stack-sm">
                        {providerActionMenu?.sections.map((section) => (
                          <div className="playground-option-group stack-sm" key={section.label}>
                            <span className="playground-inline-label">{section.label}</span>
                            <div className="choice-row">
                              {section.choices.map((choice) => (
                                <button
                                  key={choice.value}
                                  type="button"
                                  className={`choice-pill${choice.selected ? ' active' : ''}`}
                                  onClick={choice.onSelect}
                                >
                                  {choice.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}

                    <button
                      type="button"
                      className="playground-action-trigger"
                      onClick={() => setIsActionMenuOpen((current) => !current)}
                      aria-expanded={isActionMenuOpen}
                    >
                      <span className="playground-action-trigger-copy">
                        <SlidersHorizontal size={16} strokeWidth={2} />
                        <span>{providerActionMenu?.summary}</span>
                      </span>
                      {isActionMenuOpen ? (
                        <ChevronUp size={16} strokeWidth={2} />
                      ) : (
                        <ChevronDown size={16} strokeWidth={2} />
                      )}
                    </button>
                  </>
                ) : null}
              </div>

              <button type="submit" className="btn-primary playground-generate-button" disabled={loading}>
                {loading ? 'Generating...' : 'Generate'}
              </button>
            </div>

            {status ? <p className="form-helper">{status}</p> : null}
          </div>
        </form>

        <section className="playground-history stack-md">
          <div className="stack-md">
            {history.length === 0 ? (
              <div className="playground-history-empty">
                <p className="playground-history-empty-title">No history yet</p>
                <p className="playground-history-empty-copy">Generated results will appear here.</p>
              </div>
            ) : (
              history.map((item) => {
                const output = firstOutput(item);
                const textOutput = output?.kind === 'text' ? output.text_content ?? '' : '';
                const imageInputs = item.input_artifacts.filter((artifact) => artifact.kind === 'image' && artifact.url);
                const isExpanded = expandedHistoryId === item.id;
                return (
                  <article className="playground-history-item" key={item.id}>
                    <div className="playground-history-header">
                      <div>
                        <div className="playground-history-title-row">
                          <span className="version-badge">{historyKindLabel(item)}</span>
                          <h3 className="list-card-title">
                            {item.prompt_version ? `${item.prompt_title} / v${item.prompt_version}` : item.prompt_title}
                          </h3>
                        </div>
                        <p className="list-card-meta">
                          {statusLabel(item.status)} · {item.model} · {formatDate(item.created_at)}
                        </p>
                      </div>
                    </div>

                    {output?.kind === 'image' && output.url ? (
                      <div className="playground-history-preview">
                        <HistoryMediaCard
                          artifact={output}
                          label="Image preview"
                          showLabel={false}
                          menuOpen={activeHistoryMenu?.runId === item.id && activeHistoryMenu.artifactId === output.id}
                          onToggleMenu={() => setActiveHistoryMenu((current) => (
                            current?.runId === item.id && current.artifactId === output.id
                              ? null
                              : { runId: item.id, artifactId: output.id }
                          ))}
                          onCloseMenu={() => setActiveHistoryMenu(null)}
                          actions={historyMediaActions(output)}
                        />
                      </div>
                    ) : null}

                    {output?.kind === 'video' && output.url ? (
                      <div className="playground-history-preview">
                        <HistoryMediaCard
                          artifact={output}
                          label="Video preview"
                          showLabel={false}
                          menuOpen={activeHistoryMenu?.runId === item.id && activeHistoryMenu.artifactId === output.id}
                          onToggleMenu={() => setActiveHistoryMenu((current) => (
                            current?.runId === item.id && current.artifactId === output.id
                              ? null
                              : { runId: item.id, artifactId: output.id }
                          ))}
                          onCloseMenu={() => setActiveHistoryMenu(null)}
                          actions={historyMediaActions(output)}
                        />
                      </div>
                    ) : null}

                    {output?.kind === 'text' ? (
                      <div className="playground-history-preview">
                        <div className="playground-history-text-preview">
                          <pre className="playground-history-text">{textOutput}</pre>
                        </div>
                      </div>
                    ) : null}

                    <div className="playground-history-footer">
                      <button
                        type="button"
                        className="playground-history-toggle"
                        onClick={() => {
                          setExpandedHistoryId((current) => (current === item.id ? null : item.id));
                          setActiveHistoryMenu(null);
                        }}
                        aria-expanded={isExpanded}
                      >
                        <span>Input</span>
                        {isExpanded ? <ChevronUp size={16} strokeWidth={2} /> : <ChevronDown size={16} strokeWidth={2} />}
                      </button>
                    </div>

                    {isExpanded ? (
                      <div className="playground-history-body stack-sm">
                        {item.error_message ? (
                          <p className="form-helper form-helper-error">{item.error_message}</p>
                        ) : null}

                        {item.resolved_prompt ? (
                          <div className="playground-history-section stack-sm">
                            <pre className="playground-history-text">{item.resolved_prompt}</pre>
                          </div>
                        ) : null}

                        {imageInputs.length > 0 ? (
                          <div className="playground-history-input-grid">
                            {imageInputs.map((artifact) => (
                              <HistoryMediaCard
                                key={`${item.id}-${artifact.id}-${artifact.slot ?? 'input'}`}
                                artifact={artifact}
                                label={inputSlotLabel(artifact.slot)}
                                menuOpen={activeHistoryMenu?.runId === item.id && activeHistoryMenu.artifactId === artifact.id}
                                onToggleMenu={() => setActiveHistoryMenu((current) => (
                                  current?.runId === item.id && current.artifactId === artifact.id
                                    ? null
                                    : { runId: item.id, artifactId: artifact.id }
                                ))}
                                onCloseMenu={() => setActiveHistoryMenu(null)}
                                actions={historyMediaActions(artifact)}
                              />
                            ))}
                          </div>
                        ) : null}

                      </div>
                    ) : null}
                  </article>
                );
              })
            )}
          </div>
        </section>
      </div>

      {promptPickerOpen && selectedPickerCatalog ? (
        <div className="picker-backdrop" onClick={() => setPromptPickerOpen(false)}>
          <div className="picker-panel" onClick={(event) => event.stopPropagation()}>
            <div className="section-row">
              <div className="picker-title-row">
                <h2 className="section-title">{selectedPickerCatalog.name}</h2>
              </div>
              <div className="picker-actions">
                <button type="button" className="btn-secondary" onClick={() => setPromptPickerOpen(false)}>
                  Close
                </button>
              </div>
            </div>

            <div className="picker-results">
              {selectedPickerCatalog.options.length > 0 ? (
                <div className="token-grid">
                  {selectedPickerCatalog.options.map((option) => (
                    <button
                      type="button"
                      key={option.id}
                      className="token-choice"
                      onClick={() => {
                        if (!pickerNodeId) {
                          return;
                        }
                        replacePromptOption(pickerNodeId, option.id);
                        setPromptPickerOpen(false);
                      }}
                    >
                      <span className="token-choice-label">{option.label}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="empty-panel">
                  <p className="empty-panel-title">Item がありません</p>
                  <p className="muted-copy">この Catalog に Item を追加してから選択できます。</p>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => void handleLocalImageChange(event)}
      />
    </section>
  );
}

function pickerCatalogIdFromNode(catalogs: CatalogResponse[], optionId: string | null) {
  if (!optionId) {
    return null;
  }

  return catalogs.find((catalog) => catalog.options.some((option) => option.id === optionId)) ?? null;
}
