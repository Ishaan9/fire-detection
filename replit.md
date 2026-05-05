# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **AI**: Gemini via Replit AI Integrations (`@workspace/integrations-gemini-ai`)

## Applications

### FireWatch — Fire Detector (`artifacts/fire-detector`)
A minimalist fire detection tool for chemical plant surveillance videos.
- User uploads a video (MP4, MOV, AVI, WEBM)
- Backend extracts frames using ffmpeg (1 frame/second)
- Gemini AI analyzes frames in batches of 8 to detect fire
- Results streamed in real-time via SSE
- Returns timestamp (formatted) of first fire occurrence

### API Server (`artifacts/api-server`)
Express 5 backend serving:
- `GET /api/healthz` — Health check
- `POST /api/fire-detection/analyze` — Video upload + SSE stream for fire detection

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## Key Files

- `lib/api-spec/openapi.yaml` — OpenAPI contract (single source of truth)
- `lib/integrations-gemini-ai/` — Gemini AI integration library
- `artifacts/api-server/src/routes/fire-detection.ts` — Video analysis route
- `artifacts/api-server/build.mjs` — esbuild config (note: `@google/*` removed from externals so @google/genai bundles correctly)

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
