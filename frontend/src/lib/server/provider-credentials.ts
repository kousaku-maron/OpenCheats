import { and, eq } from 'drizzle-orm';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createKlingAI } from '@ai-sdk/klingai';
import { createOpenAI } from '@ai-sdk/openai';
import { userProviderCredentials } from '../../../db/schema/app';
import type { Database } from './db';

export const supportedProviders = ['openai', 'google', 'klingai'] as const;
export type SupportedProvider = (typeof supportedProviders)[number];

type RuntimeEnv = {
  CREDENTIAL_ENCRYPTION_SECRET: string;
};

export type ProviderCredentialSummary = {
  provider: SupportedProvider;
  configured: boolean;
  key_hint: string | null;
  updated_at: Date | null;
};

type DecryptedCredential = {
  provider: SupportedProvider;
  accessKey: string;
  secretKey: string | null;
};

function assertSupportedProvider(provider: string): SupportedProvider {
  if (supportedProviders.includes(provider as SupportedProvider)) {
    return provider as SupportedProvider;
  }

  throw new Error('Unsupported provider');
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function toBase64Url(value: string) {
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64ToBytes(value: string) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

async function deriveKey(secret: string) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return crypto.subtle.importKey('raw', hash, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

async function encryptValue(secret: string, value: string) {
  const key = await deriveKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(value),
  );
  return `${bytesToBase64(iv)}:${bytesToBase64(new Uint8Array(encrypted))}`;
}

async function decryptValue(secret: string, value: string) {
  const [ivBase64, payloadBase64] = value.split(':');
  if (!ivBase64 || !payloadBase64) {
    throw new Error('Invalid encrypted credential');
  }

  const key = await deriveKey(secret);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(ivBase64) },
    key,
    base64ToBytes(payloadBase64),
  );

  return new TextDecoder().decode(decrypted);
}

function toKeyHint(value: string) {
  const trimmed = value.trim();
  if (trimmed.length <= 8) {
    return trimmed || null;
  }

  return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
}

async function generateKlingAIAuthToken(accessKey: string, secretKey: string) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    iss: accessKey,
    exp: now + 1800,
    nbf: now - 5,
  };

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secretKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signingInput = `${toBase64Url(JSON.stringify(header))}.${toBase64Url(JSON.stringify(payload))}`;
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(signingInput));
  const signatureBase64 = toBase64Url(String.fromCharCode(...new Uint8Array(signature)));
  return `${signingInput}.${signatureBase64}`;
}

async function readProviderError(response: Response) {
  try {
    const json = await response.json();
    if (typeof json?.error?.message === 'string') {
      return json.error.message;
    }
    if (typeof json?.message === 'string') {
      return json.message;
    }
    if (typeof json?.error === 'string') {
      return json.error;
    }
  } catch {
    // Ignore JSON parse failures and fall back to status text.
  }

  return response.statusText || `HTTP ${response.status}`;
}

async function testOpenAIKey(accessKey: string) {
  const response = await fetch('https://api.openai.com/v1/models', {
    headers: {
      Authorization: `Bearer ${accessKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(`OpenAI connection failed: ${await readProviderError(response)}`);
  }
}

async function testGoogleKey(accessKey: string) {
  const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1', {
    headers: {
      'x-goog-api-key': accessKey,
    },
  });

  if (!response.ok) {
    throw new Error(`Gemini connection failed: ${await readProviderError(response)}`);
  }
}

async function testKlingAIKey(accessKey: string, secretKey: string | null) {
  if (!secretKey) {
    throw new Error('Secret key is required');
  }

  const token = await generateKlingAIAuthToken(accessKey, secretKey);
  const response = await fetch('https://api-singapore.klingai.com/v1/videos/text2video', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });

  if (response.ok) {
    return;
  }

  if (response.status >= 400 && response.status < 500 && response.status !== 401 && response.status !== 403) {
    return;
  }

  throw new Error(`KlingAI connection failed: ${await readProviderError(response)}`);
}

export async function listProviderCredentialSummaries(
  db: Database,
  userId: string,
): Promise<ProviderCredentialSummary[]> {
  const rows = await db
    .select()
    .from(userProviderCredentials)
    .where(eq(userProviderCredentials.userId, userId));

  const map = new Map(rows.map((row) => [row.provider, row] as const));
  return supportedProviders.map((provider) => {
    const row = map.get(provider);
    return {
      provider,
      configured: Boolean(row),
      key_hint: row?.keyHint ?? null,
      updated_at: row?.updatedAt ?? null,
    };
  });
}

export async function upsertProviderCredential(
  db: Database,
  userId: string,
  env: RuntimeEnv,
  input: {
    provider: string;
    accessKey: string;
    secretKey?: string | null;
  },
) {
  const provider = assertSupportedProvider(input.provider);
  const accessKey = input.accessKey.trim();
  const secretKey = input.secretKey?.trim() || null;

  if (!accessKey) {
    throw new Error('Access key is required');
  }

  if (provider === 'klingai' && !secretKey) {
    throw new Error('Secret key is required');
  }

  const encryptedAccessKey = await encryptValue(env.CREDENTIAL_ENCRYPTION_SECRET, accessKey);
  const encryptedSecretKey = secretKey
    ? await encryptValue(env.CREDENTIAL_ENCRYPTION_SECRET, secretKey)
    : null;

  await db
    .insert(userProviderCredentials)
    .values({
      userId,
      provider,
      encryptedAccessKey,
      encryptedSecretKey,
      keyHint: toKeyHint(accessKey),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [userProviderCredentials.userId, userProviderCredentials.provider],
      set: {
        encryptedAccessKey,
        encryptedSecretKey,
        keyHint: toKeyHint(accessKey),
        updatedAt: new Date(),
      },
    });
}

export async function testProviderCredential(input: {
  provider: string;
  accessKey: string;
  secretKey?: string | null;
}) {
  const provider = assertSupportedProvider(input.provider);
  const accessKey = input.accessKey.trim();
  const secretKey = input.secretKey?.trim() || null;

  if (!accessKey) {
    throw new Error('Access key is required');
  }

  if (provider === 'klingai' && !secretKey) {
    throw new Error('Secret key is required');
  }

  switch (provider) {
    case 'openai':
      await testOpenAIKey(accessKey);
      return;
    case 'google':
      await testGoogleKey(accessKey);
      return;
    case 'klingai':
      await testKlingAIKey(accessKey, secretKey);
      return;
  }
}

export async function deleteProviderCredential(
  db: Database,
  userId: string,
  provider: string,
) {
  const normalizedProvider = assertSupportedProvider(provider);
  await db
    .delete(userProviderCredentials)
    .where(
      and(
        eq(userProviderCredentials.userId, userId),
        eq(userProviderCredentials.provider, normalizedProvider),
      ),
    );
}

export async function getDecryptedProviderCredential(
  db: Database,
  userId: string,
  env: RuntimeEnv,
  provider: SupportedProvider,
): Promise<DecryptedCredential | null> {
  const rows = await db
    .select()
    .from(userProviderCredentials)
    .where(
      and(
        eq(userProviderCredentials.userId, userId),
        eq(userProviderCredentials.provider, provider),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) {
    return null;
  }

  return {
    provider,
    accessKey: await decryptValue(env.CREDENTIAL_ENCRYPTION_SECRET, row.encryptedAccessKey),
    secretKey: row.encryptedSecretKey
      ? await decryptValue(env.CREDENTIAL_ENCRYPTION_SECRET, row.encryptedSecretKey)
      : null,
  };
}

export async function buildProvidersForUser(
  db: Database,
  userId: string,
  env: RuntimeEnv,
) {
  const [openaiCredential, googleCredential, klingCredential] = await Promise.all([
    getDecryptedProviderCredential(db, userId, env, 'openai'),
    getDecryptedProviderCredential(db, userId, env, 'google'),
    getDecryptedProviderCredential(db, userId, env, 'klingai'),
  ]);

  return {
    openai: openaiCredential ? createOpenAI({ apiKey: openaiCredential.accessKey }) : null,
    google: googleCredential ? createGoogleGenerativeAI({ apiKey: googleCredential.accessKey }) : null,
    klingai: klingCredential
      ? createKlingAI({
          accessKey: klingCredential.accessKey,
          secretKey: klingCredential.secretKey ?? undefined,
        })
      : null,
  };
}
