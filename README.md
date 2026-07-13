# Smartphonecracy Runner

Smartphonecracy Runner is the runtime and visual authoring toolkit for a browser-based, multiplayer installation. Visitors scan a QR code, use their phones as cursors, and collectively navigate questions and video branches on a shared display.

The server is authoritative: it manages admission, room state, timed vote snapshots, branch resolution, recovery, persistence, and the operational admin API. Shows are versioned scenario graphs rather than hard-coded application flows.

## Applications

- `apps/server` — Fastify HTTP and WebSocket server, phase engine, admission, persistence, and admin API.
- `apps/display` — fullscreen React client for the installation screen.
- `apps/phone` — mobile React controller used by participants.
- `apps/admin` — protected operational interface.
- `apps/studio` — local visual editor for importing, authoring, validating, previewing, and exporting shows.

Shared runtime contracts live in `packages/protocol`, `packages/scenario`, `packages/shared`, and `packages/studio-adapter`.

## Requirements

- Node.js 22 or newer
- pnpm 9.12.2

## Setup

```bash
pnpm install
```

The checked-in development scenario and media manifest are used by default. No database is required for local development; persistence is enabled when `DATABASE_URL` and the related production configuration are supplied.

## Run locally

Build the three installation clients, then start the server:

```bash
pnpm --filter @smartphonecracy/display build
pnpm --filter @smartphonecracy/phone build
pnpm --filter @smartphonecracy/admin build
pnpm --filter @smartphonecracy/server dev
```

The server defaults to `http://localhost:3000` and exposes:

- `/display/` — installation display
- `/phone/` — participant controller
- `/admin/` — operations interface
- `/healthz` and `/readyz` — health and readiness checks

Development credentials in the server configuration are intentionally local-only defaults. Set strong `ADMIN_TOKEN`, `JOIN_GRANT_SECRET`, display credentials, and production URLs before deployment.

## Show Studio

Start the local authoring tool with:

```bash
pnpm --filter studio dev
```

Studio supports graph editing, typed transitions, media diagnostics, runtime validation, branch preview, local draft recovery, and versioned deployment exports. It does not publish directly to a running installation.

See [the Studio curator guide](docs/studio-guide.md) and [runtime compatibility notes](docs/studio-compat.md).

## Validate and test

```bash
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm validate-scenario
```

The end-to-end suite builds the installation clients and runs Playwright flows against real server processes. Some environments require permission to bind local ports.

To exercise the multiplayer server without browsers:

```bash
pnpm simulate-clients
```

## Content

- `content/scenarios/dev.json` — example development show
- `content/media-manifest.json` — development media inventory
- `content/media/` — locally served media assets

Scenarios and manifests are validated at startup and before Studio deployment export. Visual Studio layout metadata remains separate from runtime JSON.

## Deployment and operations

Production is designed for a single authoritative Fly.io server, Supabase Postgres for durable events and checkpoints, and externally hosted media. Deployment is manually gated and must happen while the venue is closed.

- [Deployment and rollback](docs/deployment.md)
- [Operations runbook](docs/operations.md)
- [Venue installation guide](docs/venue-installation.md)
- [Persistence model](docs/persistence.md)

The application and Show Studio v1 are implemented and tested. A real venue launch still requires production content and privacy approval, infrastructure provisioning, exact-hardware acceptance, and the final soak test.

## Project status

Implementation progress and verification records are tracked in [steps.md](steps.md). The only deferred Studio feature is the post-v1 multi-participant drag simulator; outcome shortcuts cover the same resolution branches in v1.

## License

No license has been declared yet. All rights are reserved unless a license file is added.
