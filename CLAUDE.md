# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This is **serafuku/misskey** — a fork of [Misskey](https://misskey-hub.net/), an open-source ActivityPub federated social media platform. Version `2025.10.2+serafuku.2`, branch `maidfuku`. Built with TypeScript throughout.

## Commands

### Development
```bash
pnpm dev                          # Start full dev environment (all packages in watch mode)
pnpm build                        # Production build: build-pre → -r build → build-assets
pnpm start                        # Start built backend (requires prior build)
pnpm migrate                      # Run database migrations
pnpm migrateandstart              # Migrate then start
```

### Per-package (using --filter)
```bash
pnpm --filter backend dev         # Backend watch mode (SWC)
pnpm --filter backend typecheck   # TypeScript type-check only
pnpm --filter frontend watch      # Frontend Vite dev server with HMR
pnpm --filter frontend typecheck  # vue-tsc type-check
```

### Lint & Test
```bash
pnpm lint                         # ESLint across all packages
pnpm test                         # All tests (Jest + Vitest)
pnpm jest                         # Backend Jest tests only
pnpm --filter frontend test       # Frontend Vitest only
pnpm e2e                          # Cypress E2E (starts test server automatically)
pnpm test-and-coverage            # All tests with coverage
```

### Cleanup
```bash
pnpm clean                        # Clean build artifacts
pnpm clean-all                    # Clean artifacts + node_modules
```

## Architecture

### Monorepo Structure (pnpm workspaces)

| Package | Description | Stack |
|---|---|---|
| `packages/backend` | Main API server + ActivityPub | NestJS 11, Fastify 5, TypeORM, PostgreSQL |
| `packages/frontend` | Primary SPA | Vue 3, Vite, Vitest |
| `packages/frontend-shared` | Shared components/utils | Shared between frontend and frontend-embed |
| `packages/frontend-embed` | Embeddable iframe frontend | Vite |
| `packages/sw` | Service worker | PWA support |
| `packages/misskey-js` | Official JS SDK | SDK/client library |
| `packages/misskey-reversi` | Reversi game module | - |
| `packages/misskey-bubble-game` | Bubble game module | - |
| `packages/icons-subsetter` | Icon optimization tool | - |

### Backend (`packages/backend/src/`)

NestJS with dependency injection throughout. Key top-level directories:

- `core/` — Core business logic services (notes, users, federation, timelines, notifications, etc.)
- `server/` — HTTP layer: REST API, ActivityPub endpoints, OAuth, file server, web UI
- `queue/` — BullMQ job processors for background work
- `models/` — TypeORM entity definitions and repository types
- `migration/` — Database migration files (TypeORM)
- `daemons/` — Long-running background services
- `aiscript/` — AIScript (Misskey's scripting language) host integration
- `boot/` — Application entry point and NestJS module setup

Backend uses **SWC** for fast transpilation and separate TypeScript for type-checking.

### Frontend (`packages/frontend/src/`)

Vue 3 Composition API. Key directories:

- `components/` — Reusable Vue components (prefixed `Mk`)
- `pages/` — Page-level components routed by the app
- `composables/` — Vue composables (shared reactive logic)
- `stores/` — State management (Pinia-style reactive stores)
- `aiscript/` — AIScript UI widget support

### ActivityPub Conventions

When modifying ActivityPub payloads:
- Extended properties **must** be prefixed with `_misskey_` (e.g., `_misskey_quote`)
- Declare all extended properties as **optional** in `packages/backend/src/core/activitypub/type.ts` (for compatibility with older instances)
- Register new properties in `packages/backend/src/core/activitypub/misc/contexts.ts`

### Key Infrastructure

- **Database:** PostgreSQL via TypeORM — migrations live in `packages/backend/migration/`
- **Cache:** Redis (ioredis)
- **Job Queue:** BullMQ
- **Search:** Meilisearch (optional)
- **Media:** Sharp + FFmpeg
- **Config:** `.config/default.yml` (copy from `compose_example.yml` for reference)
- **Test config:** `.github/misskey/test.yml` (copied to `.config/test.yml` for test runs)

### Build Pipeline

`pnpm dev` runs `scripts/dev.mjs` which orchestrates parallel watch processes for all packages. The frontend uses Vite HMR; the backend uses SWC in watch mode.

`pnpm build` pipeline: `build-pre` (generates metadata/config) → `pnpm -r build` (all packages) → `build-assets` (asset optimization).

## Code Style

- **Indentation:** Tabs, 2-space equivalent (enforced by `.editorconfig`)
- **Line endings:** LF
- **Charset:** UTF-8
- **Linter:** ESLint with `@misskey-dev/eslint-plugin`
- Always run `pnpm lint` before committing

## PR Conventions (from CONTRIBUTING.md)

- Prefix PR titles: `fix` / `refactor` / `feat` / `enhance` / `perf` / `chore`
- Update `CHANGELOG.md` for user-facing changes
- PRs targeting upstream misskey: branch to `develop`; serafuku-specific changes stay on `maidfuku`
