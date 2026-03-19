import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createAuth } from './lib/server/auth';
import { createDb } from './lib/server/db';

function loadDevVars() {
  const devVarsPath = resolve(process.cwd(), '.dev.vars');
  if (!existsSync(devVarsPath)) {
    return;
  }

  const content = readFileSync(devVarsPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const equalIndex = trimmed.indexOf('=');
    if (equalIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, equalIndex).trim();
    const value = trimmed.slice(equalIndex + 1).trim();
    if (!key || process.env[key]) {
      continue;
    }

    process.env[key] = value;
  }
}

loadDevVars();

const env = {
  DATABASE_URL:
    process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:5432/postgres',
  BETTER_AUTH_SECRET:
    process.env.BETTER_AUTH_SECRET ?? 'dev-only-secret-dev-only-secret',
  BETTER_AUTH_URL: process.env.BETTER_AUTH_URL ?? 'http://127.0.0.1:4321',
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ?? 'dummy-google-client-id',
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ?? 'dummy-google-client-secret',
};

const db = createDb(env.DATABASE_URL);

export const auth = createAuth(env, db);
export default auth;
