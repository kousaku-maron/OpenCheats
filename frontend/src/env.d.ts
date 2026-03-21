/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

interface Env {
  DATABASE_URL: string;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  CREDENTIAL_ENCRYPTION_SECRET: string;
  PLAYGROUND_BUCKET: R2Bucket;
}

declare namespace App {
  interface Locals {
    user: import("./lib/server/auth").User | null;
    session: import("./lib/server/auth").Session | null;
    runtime: {
      env: Env;
    };
    db: import("./lib/server/db").Database;
    auth: import("./lib/server/auth").Auth;
  }
}
