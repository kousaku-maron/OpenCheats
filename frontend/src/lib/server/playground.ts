import { and, desc, eq, inArray } from 'drizzle-orm';
import { experimental_generateVideo as generateVideo, generateImage, generateText } from 'ai';
import { artifacts, catalogs, catalogOptions, promptVersions, prompts, runs } from '../../../db/schema/app';
import { normalizePromptDocument, resolvePromptDocument } from '../prompt-document';
import {
  buildGenerationPrompt,
  getSupportedModel,
  getTaskTypeForModel,
  type CreateRunPayload,
  type RunInputSlot,
} from '../playground-logic';
import type { Database } from './db';
import { buildProvidersForUser } from './provider-credentials';

type RuntimeEnv = {
  CREDENTIAL_ENCRYPTION_SECRET: string;
  PLAYGROUND_BUCKET: {
    put(
      key: string,
      value: ArrayBuffer | ArrayBufferView,
      options?: { httpMetadata?: { contentType?: string } },
    ): Promise<unknown>;
    get(key: string): Promise<{
      arrayBuffer(): Promise<ArrayBuffer>;
      httpMetadata?: {
        contentType?: string;
      };
    } | null>;
  };
};

type ArtifactResponse = {
  id: string;
  kind: string;
  source_type: string;
  url: string | null;
  text_content: string | null;
  mime_type: string | null;
  created_at: Date;
  slot?: RunInputSlot | null;
};

export type HistoryItemResponse = {
  id: string;
  prompt_id: string | null;
  prompt_title: string;
  prompt_version: number | null;
  model: string;
  resolved_prompt: string;
  status: string;
  error_message: string | null;
  created_at: Date;
  updated_at: Date;
  input_artifacts: ArtifactResponse[];
  output_artifacts: ArtifactResponse[];
};

type ParsedModel = {
  provider: 'openai' | 'google' | 'nanobanana' | 'klingai';
  modelId: string;
};

type StoredRunInput = {
  slot: RunInputSlot;
  artifact_id: string;
};
type ResolvedRunInput = {
  slot: RunInputSlot;
  artifact: typeof artifacts.$inferSelect;
};

function parseModelIdentifier(value: string): ParsedModel {
  const [provider, ...rest] = value.split('/');
  const modelId = rest.join('/').trim();

  if (!modelId) {
    throw new Error('Model must use provider/model format');
  }

  if (provider === 'openai' || provider === 'google' || provider === 'nanobanana' || provider === 'klingai' || provider === 'kling') {
    return {
      provider: provider === 'kling' ? 'klingai' : provider,
      modelId,
    };
  }

  throw new Error(`Unsupported model provider: ${provider}`);
}

function fromBase64(base64: string) {
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

function toBase64(bytes: Uint8Array) {
  let binary = '';

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

function toDataUrl(base64: string, mediaType: string | undefined) {
  return `data:${mediaType ?? 'application/octet-stream'};base64,${base64}`;
}

function parseDataUrl(value: string) {
  const match = value.match(/^data:([^;,]+);base64,(.+)$/);
  if (!match) {
    throw new Error('Invalid uploaded image');
  }

  return {
    mimeType: match[1],
    base64: match[2],
  };
}

function toKlingVideoModelId(modelId: string, mode: 't2v' | 'i2v') {
  const normalizedBase = modelId
    .replace(/^kling-v(\d+)-(\d+)(?=-|$)/, 'kling-v$1.$2')
    .replace(/-(t2v|i2v|motion-control)$/, '');

  return `${normalizedBase}-${mode}`;
}

function toAspectRatio(value: string | undefined): `${number}:${number}` | undefined {
  if (!value) {
    return undefined;
  }

  return /^\d+:\d+$/.test(value) ? (value as `${number}:${number}`) : undefined;
}

function getFileExtension(kind: 'image' | 'video', mimeType: string) {
  if (kind === 'video') {
    return mimeType === 'video/webm' ? 'webm' : 'mp4';
  }

  if (mimeType === 'image/webp') {
    return 'webp';
  }

  if (mimeType === 'image/jpeg') {
    return 'jpg';
  }

  return 'png';
}

function generateObjectKey(userId: string, artifactId: string, kind: 'image' | 'video', mimeType: string) {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `u/${userId}/${kind}/${year}/${month}/${artifactId}.${getFileExtension(kind, mimeType)}`;
}

async function persistBinaryArtifact(
  db: Database,
  env: RuntimeEnv,
  {
    artifactId,
    userId,
    kind,
    sourceType,
    base64,
    mimeType,
    runId,
  }: {
    artifactId: string;
    userId: string;
    kind: 'image' | 'video';
    sourceType: 'generated' | 'upload';
    base64: string;
    mimeType: string;
    runId?: string;
  },
) {
  const objectKey = generateObjectKey(userId, artifactId, kind, mimeType);
  const bytes = fromBase64(base64);

  await env.PLAYGROUND_BUCKET.put(objectKey, bytes, {
    httpMetadata: {
      contentType: mimeType,
    },
  });

  const artifactRows = await db.insert(artifacts).values({
    id: artifactId,
    userId,
    kind,
    sourceType,
    objectKey,
    mimeType,
    createdByRunId: runId ?? null,
  }).returning();

  const artifact = artifactRows[0];
  if (!artifact) {
    throw new Error('Artifact could not be created');
  }

  return artifact;
}

async function getArtifactImageSource(
  env: RuntimeEnv,
  artifact: typeof artifacts.$inferSelect,
): Promise<string | null> {
  if (artifact.kind !== 'image') {
    return null;
  }

  if (!artifact.objectKey) {
    return null;
  }

  const object = await env.PLAYGROUND_BUCKET.get(artifact.objectKey);
  if (!object) {
    throw new Error(`Artifact object not found: ${artifact.id}`);
  }

  const arrayBuffer = await object.arrayBuffer();
  const base64 = toBase64(new Uint8Array(arrayBuffer));
  return toDataUrl(base64, artifact.mimeType ?? object.httpMetadata?.contentType ?? 'image/png');
}

function toArtifactResponse(row: typeof artifacts.$inferSelect): ArtifactResponse {
  return {
    id: row.id,
    kind: row.kind,
    source_type: row.sourceType,
    url: row.kind === 'text' ? null : `/api/artifacts/${row.id}/raw`,
    text_content: row.textContent,
    mime_type: row.mimeType,
    created_at: row.createdAt,
  };
}

function parseStoredRunInputs(settingsJson: Record<string, unknown> | null | undefined): StoredRunInput[] {
  if (!settingsJson || typeof settingsJson !== 'object') {
    return [];
  }

  const value = settingsJson.inputs;
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') {
      return [];
    }

    const slot = typeof entry.slot === 'string' ? entry.slot : null;
    const artifactId = typeof entry.artifact_id === 'string' ? entry.artifact_id : null;
    if (!slot || !artifactId || (slot !== 'reference' && slot !== 'start' && slot !== 'end')) {
      return [];
    }

    return [{ slot: slot as RunInputSlot, artifact_id: artifactId }];
  });
}

async function getCurrentPromptVersion(db: Database, userId: string, promptId: string) {
  const promptRows = await db
    .select()
    .from(prompts)
    .where(and(eq(prompts.id, promptId), eq(prompts.userId, userId)))
    .limit(1);

  const prompt = promptRows[0];
  if (!prompt) {
    return null;
  }

  const promptVersionRows = await db
    .select()
    .from(promptVersions)
    .where(and(eq(promptVersions.promptId, prompt.id), eq(promptVersions.version, prompt.currentVersion)))
    .limit(1);

  const promptVersion = promptVersionRows[0];
  if (!promptVersion) {
    return null;
  }

  return { prompt, promptVersion };
}

async function resolvePromptText(db: Database, userId: string, promptId: string) {
  const current = await getCurrentPromptVersion(db, userId, promptId);
  if (!current) {
    return null;
  }

  const catalogRows = await db
    .select({
      optionId: catalogOptions.id,
      label: catalogOptions.label,
      value: catalogOptions.value,
      isArchived: catalogOptions.isArchived,
    })
    .from(catalogOptions)
    .innerJoin(catalogs, eq(catalogs.id, catalogOptions.catalogId))
    .where(eq(catalogs.userId, userId));

  const optionIndex = new Map(
    catalogRows.map((row) => [
      row.optionId,
      {
        id: row.optionId,
        label: row.label,
        value: row.value,
        is_archived: row.isArchived,
      },
    ]),
  );

  const resolvedPrompt = resolvePromptDocument(current.prompt.document, optionIndex);
  return {
    prompt: current.prompt,
    promptVersion: current.promptVersion,
    resolvedPrompt,
  };
}

async function buildResolvedPrompt(
  db: Database,
  userId: string,
  promptId: string | null,
  promptDocument: CreateRunPayload['prompt_document'],
) {
  if (!promptId) {
    return {
      promptInfo: null,
      resolvedPrompt: '',
    };
  }

  const promptInfo = await resolvePromptText(db, userId, promptId);
  if (!promptInfo) {
    return null;
  }

  if (!promptDocument) {
    return {
      promptInfo,
      resolvedPrompt: promptInfo.resolvedPrompt,
    };
  }

  const catalogRows = await db
    .select({
      optionId: catalogOptions.id,
      label: catalogOptions.label,
      value: catalogOptions.value,
      isArchived: catalogOptions.isArchived,
    })
    .from(catalogOptions)
    .innerJoin(catalogs, eq(catalogs.id, catalogOptions.catalogId))
    .where(eq(catalogs.userId, userId));

  const optionIndex = new Map(
    catalogRows.map((row) => [
      row.optionId,
      {
        id: row.optionId,
        label: row.label,
        value: row.value,
        is_archived: row.isArchived,
      },
    ]),
  );

  return {
    promptInfo,
    resolvedPrompt: resolvePromptDocument(normalizePromptDocument(promptDocument), optionIndex),
  };
}

async function getImagePrompt(
  provider: ParsedModel['provider'],
  composedPrompt: string,
  runInputs: ResolvedRunInput[],
  env: RuntimeEnv,
) {
  const artifactReferenceImages = (
    await Promise.all(
      runInputs
        .filter((input) => input.slot === 'reference' && input.artifact.kind === 'image')
        .map((input) => getArtifactImageSource(env, input.artifact)),
    )
  ).filter((artifact): artifact is string => Boolean(artifact));
  const referenceImages = artifactReferenceImages;

  if (referenceImages.length === 0) {
    return composedPrompt;
  }

  if (provider === 'openai' || provider === 'google' || provider === 'nanobanana') {
    return {
      text: composedPrompt,
      images: referenceImages,
    };
  }

  return composedPrompt;
}

async function getVideoPrompt(
  composedPrompt: string,
  runInputs: ResolvedRunInput[],
  env: RuntimeEnv,
) {
  const startInput = runInputs.find((input) => input.slot === 'start' && input.artifact.kind === 'image');
  const endInput = runInputs.find((input) => input.slot === 'end' && input.artifact.kind === 'image');
  const fallbackInput = runInputs.find((input) => input.artifact.kind === 'image');
  const imageArtifact = startInput?.artifact ?? fallbackInput?.artifact ?? null;
  const image = imageArtifact ? await getArtifactImageSource(env, imageArtifact) : null;
  const imageTail = endInput?.artifact ? await getArtifactImageSource(env, endInput.artifact) : null;

  const parsedTail = imageTail ? parseDataUrl(imageTail) : null;

  if (!image) {
    return {
      prompt: composedPrompt,
      imageTail: parsedTail?.base64 ?? null,
      mode: 't2v' as const,
    };
  }

  return {
    prompt: {
      image,
      text: composedPrompt,
    },
    imageTail: parsedTail?.base64 ?? null,
    mode: 'i2v' as const,
  };
}

export async function listHistory(db: Database, userId: string): Promise<HistoryItemResponse[]> {
  const runRows = await db
    .select()
    .from(runs)
    .where(eq(runs.userId, userId))
    .orderBy(desc(runs.createdAt));

  if (runRows.length === 0) {
    return [];
  }

  const promptVersionIds = [...new Set(runRows.map((row) => row.promptVersionId).filter((value): value is string => Boolean(value)))];
  const runIds = runRows.map((row) => row.id);
  const runInputRefs = new Map(runRows.map((row) => [row.id, parseStoredRunInputs(row.settingsJson)] as const));
  const inputArtifactIds = [...new Set(
    Array.from(runInputRefs.values())
      .flat()
      .map((input) => input.artifact_id),
  )];

  const [promptVersionRows, inputArtifactRows, outputRows] = await Promise.all([
    promptVersionIds.length
      ? db.select().from(promptVersions).where(inArray(promptVersions.id, promptVersionIds))
      : Promise.resolve([]),
    inputArtifactIds.length
      ? db
          .select()
          .from(artifacts)
          .where(and(eq(artifacts.userId, userId), inArray(artifacts.id, inputArtifactIds)))
      : Promise.resolve([]),
    db
      .select()
      .from(artifacts)
      .where(and(inArray(artifacts.createdByRunId, runIds), eq(artifacts.userId, userId))),
  ]);

  const promptVersionMap = new Map(promptVersionRows.map((row) => [row.id, row] as const));
  const inputArtifactMap = new Map(inputArtifactRows.map((row) => [row.id, row] as const));
  const inputMap = new Map<string, ArtifactResponse[]>();
  for (const runRow of runRows) {
    const resolvedInputs = (runInputRefs.get(runRow.id) ?? [])
      .map((input) => {
        const artifact = inputArtifactMap.get(input.artifact_id);
        if (!artifact) {
          return null;
        }

        return {
          ...toArtifactResponse(artifact),
          slot: input.slot,
        };
      })
      .filter((value): value is NonNullable<typeof value> => value !== null);

    inputMap.set(runRow.id, resolvedInputs);
  }

  const outputMap = new Map<string, ArtifactResponse[]>();
  for (const row of outputRows) {
    const list = outputMap.get(row.createdByRunId ?? '') ?? [];
    list.push(toArtifactResponse(row));
    outputMap.set(row.createdByRunId ?? '', list);
  }

  return runRows.map((row) => {
    const promptVersion = row.promptVersionId ? promptVersionMap.get(row.promptVersionId) : undefined;
    return {
      id: row.id,
      prompt_id: promptVersion?.promptId ?? null,
      prompt_title: promptVersion?.title ?? 'Free Text',
      prompt_version: promptVersion?.version ?? null,
      model: row.model,
      resolved_prompt: row.resolvedPrompt,
      status: row.status,
      error_message: row.errorMessage,
      created_at: row.createdAt,
      updated_at: row.updatedAt,
      input_artifacts: inputMap.get(row.id) ?? [],
      output_artifacts: outputMap.get(row.id) ?? [],
    };
  });
}

export async function createRun(
  db: Database,
  userId: string,
  env: RuntimeEnv,
  payload: CreateRunPayload,
): Promise<HistoryItemResponse> {
  const parsedModel = parseModelIdentifier(payload.model);
  const supportedModel = getSupportedModel(payload.model);
  const taskType = getTaskTypeForModel(payload.model);
  const requestedInputs = supportedModel?.allowsImageInputs ? payload.inputs : [];
  const providers = await buildProvidersForUser(db, userId, env);

  const promptResolution = await buildResolvedPrompt(db, userId, payload.prompt_id, payload.prompt_document);
  if (!promptResolution) {
    throw new Error('Prompt not found');
  }
  const promptInfo = promptResolution.promptInfo;
  const composedPrompt = buildGenerationPrompt(promptResolution.resolvedPrompt, payload.text_context);

  const historyArtifactIds = requestedInputs
    .map((input) => input.artifact_id)
    .filter((value): value is string => Boolean(value));
  const historyArtifacts = historyArtifactIds.length
    ? await db
        .select()
        .from(artifacts)
        .where(and(eq(artifacts.userId, userId), inArray(artifacts.id, historyArtifactIds)))
    : [];
  const historyArtifactMap = new Map(historyArtifacts.map((artifact) => [artifact.id, artifact] as const));

  if (historyArtifactIds.some((artifactId) => !historyArtifactMap.has(artifactId))) {
    throw new Error('Some input images could not be found');
  }

  const uploadedArtifacts = new Map<string, typeof artifacts.$inferSelect>();
  for (const input of requestedInputs) {
    if (!input.data_url) {
      continue;
    }

    const parsedInput = parseDataUrl(input.data_url);
    const artifact = await persistBinaryArtifact(db, env, {
      artifactId: crypto.randomUUID(),
      userId,
      kind: 'image',
      sourceType: 'upload',
      base64: parsedInput.base64,
      mimeType: input.mime_type ?? parsedInput.mimeType,
    });
    uploadedArtifacts.set(`${input.slot}:${input.data_url}`, artifact);
  }

  const resolvedInputs: ResolvedRunInput[] = requestedInputs.flatMap((input) => {
    if (input.artifact_id) {
      const artifact = historyArtifactMap.get(input.artifact_id);
      return artifact ? [{ slot: input.slot, artifact }] : [];
    }

    if (input.data_url) {
      const artifact = uploadedArtifacts.get(`${input.slot}:${input.data_url}`);
      return artifact ? [{ slot: input.slot, artifact }] : [];
    }

    return [];
  });

  const settingsJson: Record<string, unknown> = {
    ...payload.settings,
    inputs: resolvedInputs.map((input) => ({
      slot: input.slot,
      artifact_id: input.artifact.id,
    })),
  };

  const runRows = await db
    .insert(runs)
    .values({
      userId,
      promptVersionId: promptInfo?.promptVersion.id ?? null,
      model: payload.model,
      resolvedPrompt: composedPrompt,
      settingsJson,
      status: 'running',
    })
    .returning();

  const run = runRows[0];
  if (!run) {
    throw new Error('Run could not be created');
  }

  try {
    if (taskType === 'text') {
      if (!providers.openai) {
        throw new Error('OpenAI key is not configured. Set it in AI Models.');
      }

      const result = await generateText({
        model: providers.openai(parsedModel.modelId),
        prompt: composedPrompt,
      });

      await db.insert(artifacts).values({
        userId,
        kind: 'text',
        sourceType: 'generated',
        textContent: result.text,
        createdByRunId: run.id,
      });
    } else if (taskType === 'image') {
      if (!providers.google) {
        throw new Error('Gemini key is not configured. Set it in AI Models.');
      }

      const result = await generateImage({
        model: providers.google.image(parsedModel.modelId),
        prompt: await getImagePrompt(parsedModel.provider, composedPrompt, resolvedInputs, env),
        aspectRatio: toAspectRatio(payload.settings.aspect_ratio),
      });

      await Promise.all(
        result.images.map((image) =>
          persistBinaryArtifact(db, env, {
            artifactId: crypto.randomUUID(),
            userId,
            runId: run.id,
            kind: 'image',
            sourceType: 'generated',
            base64: image.base64,
            mimeType: image.mediaType ?? 'image/png',
          }),
        ),
      );
    } else {
      if (!providers.klingai) {
        throw new Error('KlingAI key is not configured. Set it in AI Models.');
      }
      const klingProvider = providers.klingai;

      const videoPrompt = await getVideoPrompt(composedPrompt, resolvedInputs, env);
      const klingMode = payload.settings.kling_mode ?? 'std';
      if (videoPrompt.imageTail && klingMode !== 'pro') {
        throw new Error('End frame requires 1080p resolution.');
      }

      const outputCount = payload.settings.output_count ?? 1;
      const results = await Promise.all(
        Array.from({ length: outputCount }, () =>
          generateVideo({
            model: klingProvider.video(toKlingVideoModelId(parsedModel.modelId, videoPrompt.mode)),
            prompt: videoPrompt.prompt,
            aspectRatio: videoPrompt.mode === 't2v' ? toAspectRatio(payload.settings.aspect_ratio) : undefined,
            duration: payload.settings.duration_seconds,
            providerOptions: {
              klingai: {
                mode: klingMode,
                ...(videoPrompt.imageTail ? { imageTail: videoPrompt.imageTail } : {}),
              },
            },
          }),
        ),
      );

      await Promise.all(
        results.flatMap((result) =>
          result.videos.map((video) =>
            persistBinaryArtifact(db, env, {
              artifactId: crypto.randomUUID(),
              userId,
              runId: run.id,
              kind: 'video',
              sourceType: 'generated',
              base64: video.base64,
              mimeType: 'video/mp4',
            }),
          ),
        ),
      );
    }

    await db
      .update(runs)
      .set({
        status: 'succeeded',
        updatedAt: new Date(),
      })
      .where(eq(runs.id, run.id));
  } catch (error) {
    await db
      .update(runs)
      .set({
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : 'Run execution failed',
        updatedAt: new Date(),
      })
      .where(eq(runs.id, run.id));
  }

  const history = await listHistory(db, userId);
  const created = history.find((item) => item.id === run.id);
  if (!created) {
    throw new Error('Run could not be loaded');
  }

  return created;
}
