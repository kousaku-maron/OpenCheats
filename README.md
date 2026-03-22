# OpenCheats

OpenCheats is a prompt workspace and iteration playground for generative AI.

It is built for the real workflow behind image and video generation: try something, inspect the result, change a few variables, try again, and gradually discover what works. Instead of treating prompts as disposable text, OpenCheats treats them as reusable assets with structure, versions, catalogs, run history, and attached outputs.

## What It Does

- Create and edit structured prompts
- Reuse catalog items inside prompts
- Save prompt versions
- Run prompts in a dedicated Playground
- Generate text, images, and videos from the same workspace
- Reuse generated images as the next input
- Keep a run history with inputs and outputs
- Store generated media in R2
- Let each user configure their own AI model keys

## Product Shape

OpenCheats is intentionally split into three areas:

- `Prompts`
  Create and refine reusable prompt templates.
- `Catalogs`
  Manage reusable items such as scenes, styles, characters, motions, and fixed phrases.
- `Playground`
  Execute prompts, inspect results, and reuse outputs as new inputs.

The main idea is simple:

1. Design a prompt structure.
2. Run it.
3. Inspect the result.
4. Reuse the result as input for the next run.
5. Keep the whole loop inside one workspace.

## Supported Models

Current model support is intentionally narrow.

- `OpenAI`
  - `gpt-5.4`
  - `gpt-5.4-mini`
  - `gpt-5.4-nano`
- `Nano Banana`
  - `gemini-3.1-flash-image-preview`
- `Kling`
  - `kling-v2-5-turbo`

Behavior:

- `OpenAI`: text generation
- `Nano Banana`: text-to-image / image-to-image
- `Kling`: text-to-video / image-to-video

## Stack

- Astro
- Preact
- Tailwind CSS v4
- Cloudflare Workers
- Cloudflare KV
- Cloudflare R2
- Neon Postgres
- Drizzle ORM
- better-auth
- AI SDK

## Repository Layout

- `frontend/`
  Astro app, API routes, UI, and Cloudflare Worker output
- `frontend/src/components/`
  UI components including `PromptEditor`, `CatalogForm`, `PlaygroundShell`, `ProviderSettingsForm`
- `frontend/src/pages/`
  App routes and API routes
- `frontend/src/lib/server/`
  Server-side logic for auth, DB, Playground runs, and provider credentials
- `frontend/db/schema/`
  Drizzle schemas
- `frontend/db/migrations/`
  SQL migrations

## Local Development

### Prerequisites

- Node.js 22+
- pnpm
- A Neon database
- A Cloudflare account
- Google OAuth credentials for login

### Install

```bash
pnpm install
cp frontend/.dev.vars.example frontend/.dev.vars
```

### Configure local env

Set these values in `frontend/.dev.vars`:

- `DATABASE_URL`
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `CREDENTIAL_ENCRYPTION_SECRET`

Notes:

- AI provider keys are not stored in `.dev.vars`.
- Users configure model keys from the app UI at `AI Models`.
- Those keys are encrypted before being stored in the database.

### Run migrations

```bash
pnpm --dir frontend db:migrate
```

### Start the app

```bash
pnpm --dir frontend dev
```

Open:

- `http://127.0.0.1:4321`

### Useful commands

```bash
pnpm --dir frontend typecheck
pnpm --dir frontend test:run
pnpm --dir frontend build
pnpm --dir frontend db:generate
pnpm --dir frontend db:studio
```

## Cloudflare Deployment

The app is deployed as a Cloudflare Worker.

### Required Cloudflare resources

- KV namespace
  - `SESSION`
- R2 bucket
  - `PLAYGROUND_BUCKET`

### Required production secrets / vars

- `DATABASE_URL`
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `CREDENTIAL_ENCRYPTION_SECRET`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`

### GitHub Actions

`main` is deployed by:

- [.github/workflows/deploy.yml](/Users/kurinokousaku/Workspace/maron/OpenCheats/.github/workflows/deploy.yml)

If you use an API token for deploys, it needs enough Cloudflare permissions for:

- Workers Scripts
- Workers KV
- Workers R2
- Account Settings read

## Data Model

The run loop is centered on these tables:

- `prompts`
- `prompt_versions`
- `catalogs`
- `catalog_options`
- `runs`
- `artifacts`
- `user_provider_credentials`

In practice:

- `runs` stores each execution
- `artifacts` stores generated media and uploaded input images
- `runs.settings_json.inputs` stores which images were used as inputs

## Notes

- Generated image/video artifacts are stored in R2.
- Uploaded input images used in Playground are also persisted as artifacts so they can appear in History.
- Provider credentials are stored per user and encrypted server-side.
- The project currently prioritizes iteration speed over broad provider coverage.

## Concept

The product concept lives here:

- [docs/concept.md](/Users/kurinokousaku/Workspace/maron/carbon-repo/Projects/OpenCheats/docs/concept.md)
