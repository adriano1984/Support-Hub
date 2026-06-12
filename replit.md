# SuportyHub

Sistema de gerenciamento de chamados de helpdesk via WhatsApp, em português brasileiro.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080, served at `/api`)
- `pnpm --filter @workspace/helpdesk run dev` — run the frontend (port 21622, served at `/`)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5, SQLite via `node:sqlite` (built-in, no external DB needed)
- Auth: Custom JWT with `SESSION_SECRET` env var
- WhatsApp: `@whiskeysockets/baileys` 7.0.0-rc13
- Realtime: Server-Sent Events (SSE)
- Frontend: React 19, Vite, Tailwind CSS v4, shadcn/ui
- API codegen: Orval (from OpenAPI spec in `lib/api-spec/openapi.yaml`)

## Where things live

- `artifacts/api-server/src/` — Express API server
  - `lib/database.ts` — SQLite schema + seeding (single source of truth)
  - `lib/auth.ts` — JWT middleware
  - `lib/whatsapp.ts` — Baileys WhatsApp integration
  - `lib/sse.ts` — Server-Sent Events broadcaster
  - `routes/` — all API routes
  - `overlay/` — AI, SLA, formatting utilities
- `artifacts/helpdesk/src/` — React frontend
  - `pages/` — all page components
  - `contexts/AuthContext.tsx` — auth state
  - `hooks/useSSE.ts` — SSE real-time hook
  - `lib/api.ts` — `apiFetch` helper (used by most pages)
- `lib/api-spec/openapi.yaml` — OpenAPI contract (source of truth for Settings routes)
- `lib/api-client-react/` — generated React Query hooks (used by Settings pages)
- `lib/api-zod/` — generated Zod schemas (used by api-server routes validation)

## Architecture decisions

- Uses Node.js built-in SQLite (`node:sqlite`, requires `--experimental-sqlite` flag) — no external database needed.
- Most frontend pages use custom `apiFetch` directly; Settings pages (branches/departments/categories/messages/whatsapp) use generated React Query hooks from `@workspace/api-client-react`.
- WhatsApp pairing done via QR code in Settings → WhatsApp page; status streamed via SSE.
- Authentication is cookie-based JWT (HttpOnly cookie), NOT Bearer tokens.
- The `lib/db` package (Drizzle/PostgreSQL) exists in the workspace template but is NOT used by this project.

## Product

- Login page with role-based access (Admin, Gestor, Supervisor, Técnico, Atendente)
- Dashboard with ticket stats and charts
- Ticket list with filtering and search
- Ticket detail with WhatsApp chat history and internal notes
- WhatsApp QR code pairing and connection management
- Settings: branches, departments, categories, auto-messages, users, roles, canned responses
- Audit log, inventory, knowledge base pages

## User preferences

_Populate as you build._

## Gotchas

- API server requires `--experimental-sqlite` flag (already in `start` script).
- Default admin credentials: username `Admin`, password `96281800`.
- The `SESSION_SECRET` env var must be set (already configured in workspace secrets).
- `sharp` peer dependency for Baileys is optional (only needed for image resizing) — warning can be ignored.
- Run `pnpm --filter @workspace/api-spec run codegen` after changing `openapi.yaml` to regenerate the client hooks and Zod schemas.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
