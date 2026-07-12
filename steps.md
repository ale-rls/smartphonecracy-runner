# steps.md — shared execution plan

Single source of truth for the two-agent implementation effort.
Agents: **claude** (Claude Code, Fable 5) and **codex** (Codex CLI, GPT-5.6).
Protocol agreed between both agents on 2026-07-11 (Codex session `019f52da-e20d-7e90-9475-51ee60a4659b`).

## Protocol

**Claiming.** Before editing this file: create the lock dir `.steps.lock/` (mkdir is
atomic), write `owner` and ISO timestamp into `.steps.lock/info`, re-read steps.md,
make your change, remove the lock. A lock older than 10 minutes may be broken —
verify no active writer if feasible, and record the break in the step's notes.

**Ownership.** Claim a step (set `owner` + `in-progress`) before touching code.
One implementation owner per active step. Never edit files reserved by another
agent's in-progress step. Expected-file lists are reservations, not guarantees —
on newly discovered overlap, stop and coordinate before editing.

**Statuses.** `todo → in-progress → review → done`, plus `blocked`.
Complex steps require cross-review: the *other* agent reviews and flips
`review → done`. Reviewers request changes via `notes`; they never edit the
owner's files directly. Simple steps may go straight to `done` after
self-verification (`reviewer: none`), but verification results are mandatory
for every step. Blocked steps must name the exact blocker and what unblocks it.

**Model tiering (execution hint).** `tier: simple` steps run on cheaper models —
claude routes them to Sonnet 5 subagents; codex runs them with a lighter/
lower-effort config. `tier: complex` steps run on the frontier models.
Neither agent blocks on tiering if the cheaper path is unavailable.

**Review tiering (amended 2026-07-12, codex ACK).** Reviews owed by claude run
on a Sonnet 5 subagent by default. Fable (frontier claude) reviews only
STEP-006 (grant/lease crypto), STEP-008 (vote resolution correctness), and
STEP-018 (persistence integrity/privacy) — or any step whose Sonnet reviewer
flags uncertainty instead of approving. Codex reviews claude's steps as before.
If a step sits in `review` solely because the reviewing lane has a *confirmed*
quota outage, the owner may proceed to dependent steps at risk (note
"proceeding at risk pending review"); when credits return, review-triggered
fixes take priority over new steps.

**Division.** Feature slices first: when several steps touch the same files or
concepts, one agent owns the whole slice. Everything else is a greedy queue —
pull the next unblocked `todo` you're not colliding with.

**Commits (once git is initialized).** One completed step per commit, staged by
explicit paths (never `git add .`), message prefixed with the step ID
(`STEP-012: …`). Never reset or rewrite the other agent's work.

**Plan changes.** Work discovered mid-step becomes a *new* step — never silently
expand the current one. Full test suite runs once after all steps are done.

**Decomposition.** When the implementation plan lands, whichever agent is invoked
first decomposes it into steps below (with tiers and `depends-on`); the other
agent reviews the decomposition before any implementation starts.

## Resume / watchdog

Credit or usage-limit outages are expected. Resumption is stateless-safe because
this file is the durable state — so retries always start a **fresh session**
(no `resume --last`; agreed with codex 2026-07-11: "last" is fragile across
repos/lanes, and fresh sessions that re-read steps.md are safer).

`scripts/resume-work.sh claude|codex` is the watchdog, one independent lane per
agent so one side being out of credits never stalls the other. Per invocation
the agent must: re-read steps.md → recover its own unexpired claim or claim the
next unblocked step → do **at most one step** → update status/verification under
the lock → end its final message with the sentinel
`BACKLOG_STATUS: remaining|empty|blocked`.

Watchdog classification (coarse — no stable exit codes are documented on either CLI):
- clean exit + `remaining` → run again immediately; `empty`/`blocked` → lane done.
- quota/rate-limit text match → sleep until parsed reset time if available,
  else exponential backoff (60 s → 30 min cap), then retry.
- any other failure → log and **stop the lane**. Never mark a step `blocked`
  from retry exhaustion; `blocked` means a confirmed task blocker only.
- per-lane process lock (`.watchdog/<lane>.lock`) prevents overlapping cron/
  launchd runs; logs are kept per run under `.watchdog/logs/<lane>/`.

Codex lane invocation: `codex exec --cd <repo> --sandbox workspace-write --json
--output-last-message <run>/final.txt "<prompt>"` (plus `--skip-git-repo-check`
until git is initialized). Claude lane: `claude -p --permission-mode acceptEdits "<prompt>"`.

## Step template

```
### STEP-NNN: <short title>
- status: todo | in-progress | review | done | blocked
- owner: claude | codex | —
- tier: simple | complex
- depends-on: STEP-NNN, … | —
- files: <expected files to touch>
- acceptance: <criteria that define done>
- verify: <command> → <result once run>
- reviewer: claude | codex | none
- notes: <handoffs, blockers, review requests>
```

## Slices

Source plan: `smartphonecracy-installation-implementation-plan.md` (v1, 2026-07-11).
Feature slices (decomposition reviewed by codex 2026-07-11, CHANGES REQUIRED amendments applied; slices accepted unchanged):
- **claude**: foundation packages (001–004), display client (013–016), phone client (017)
- **codex**: server core (005–012), persistence + admin (018–019), deployment (021, 024)
- greedy queue for the rest (020, 022, 023, 025) once dependencies clear.

## Backlog

### STEP-000: Phase 0 director decisions
- status: blocked
- owner: —
- tier: —
- depends-on: —
- files: content/scenarios/production.json (later)
- acceptance: director confirms policy values (§15 Phase 0): timings, axis wording, quadrant/boundary convention, counted statuses, empty targets, content graph, media inventory ≤ 2 GiB, privacy package
- verify: n/a (user/director input)
- reviewer: none
- notes: BLOCKER: needs the user/director. Four separable deliverable groups: (a) director decisions (timings, axes, quadrant convention, counted statuses, empty targets), (b) content production (graph, media inventory ≤ 2 GiB), (c) hardware procurement (venue-spec mini PC), (d) privacy package approval. Engineering proceeds against the fake dev scenario; production.json lands here later.

### STEP-001: Monorepo scaffold
- status: done
- owner: claude
- tier: complex
- depends-on: —
- files: package.json, pnpm-workspace.yaml, tsconfig*, apps/*/ (stubs), packages/*/ (stubs), .gitignore, vitest config
- acceptance: pnpm install + typecheck + empty vitest run pass across all workspaces; repo layout matches plan §3
- verify: pnpm -r typecheck && pnpm -r test → PASS (7 workspaces, node 22.17 / pnpm 9.12.2, 2026-07-11); pnpm --filter '@smartphonecracy/*' build → PASS (2026-07-11)
- reviewer: codex
- notes: APPROVED by codex 2026-07-11. Layout, workspace manifests, TypeScript configs, React/Vite stubs, Fastify/ws stub, and shared quadrantOf boundary-convention utility/tests match the plan. Keep quadrantOf in shared; STEP-003/008 should consume it rather than duplicate server-side logic.

### STEP-002: packages/protocol — message types + Zod schemas
- status: done
- owner: claude
- tier: complex
- depends-on: STEP-001, STEP-003
- files: packages/protocol/**
- acceptance: every §7 message (phone→server, display→server, server→clients/display/phone) has a type + Zod schema + discriminated-union parser; invalid messages fail with useful errors
- verify: pnpm --filter protocol test → PASS (30 tests) + typecheck PASS (2026-07-11)
- reviewer: codex
- notes: APPROVED by codex 2026-07-11. All §7 message envelopes, inferred types, and direction-specific discriminated unions match the plan. Parsers are throw-free for malformed JSON/messages and return useful first-issue paths; encoding, Uint8Array input, protocol-version rejection, optional live counts, and coordinate clamping are covered. Cursor shape ({clientId,x,y,color}) is a sound minimal contract for STEP-009/display. Independent review verification: `pnpm --filter protocol test && pnpm --filter protocol typecheck` → PASS (30 tests; Node 20.12.2 emitted the expected repo engine warning for >=22).

### STEP-003: packages/scenario — schema, graph + media validators
- status: done
- owner: claude
- tier: complex
- depends-on: STEP-001
- files: packages/scenario/**
- acceptance: rejects all invalid cases in §5 (missing IDs/media, bad durations/axes, incomplete quadrant maps, bad counted statuses, broken targets); reports unreachable phases; cycles allowed only when marked; media manifest byte-size check with 2 GiB ceiling; quadrant boundary convention (x=0.5→right, y=0.5→bottom, center→q4) implemented here as shared utility
- verify: pnpm --filter scenario test → PASS (17 tests) + typecheck PASS (2026-07-11)
- reviewer: codex
- notes: APPROVED by codex 2026-07-11. Structural Zod checks, graph validation, injectable media stat/2 GiB enforcement, exports, and tests match plan §5. Scenario-level cyclesAllowed is accepted for v1; STEP-007 must still enforce maxSessionDurationMs. quadrantOf is correctly consumed from shared; no additional server-facing exports are required. STEP-002 should consume the exported Phase/PhaseSnapshot types and schemas.

### STEP-004: Fake dev scenario + validate-scenario script
- status: done
- owner: claude
- tier: simple
- depends-on: STEP-003
- files: content/scenarios/dev.json, content/media-manifest.json, scripts/validate-scenario.ts
- acceptance: fake scenario (1 video, 2 questions incl. one quadrant-plurality) validates; script exits nonzero with readable errors on a broken copy
- verify: `pnpm validate-scenario content/scenarios/dev.json` → exit 0, "OK: scenario valid" (2026-07-11); broken copy (question-fixed next.target rewritten to a nonexistent "ghost-phase") → exit 1, `[ERROR] phase "question-fixed" next.target points to unknown phase "ghost-phase"` plus an expected `[WARN]` unreachable-phase for "question-quadrant" (its only inbound edge was the broken one), then `FAIL: scenario validation found errors`
- reviewer: none
- notes: delegated to Sonnet 5 subagent per tiering protocol (claude supervises). dev.json: idle + intro-video (1 video phase, media in content/media/intro.mp4 + content/media-manifest.json) + question-fixed (fixed next → question-quadrant) + question-quadrant (quadrant-plurality, full q1-q4 map + tie + empty all → idle, countedStatuses ["valid","stale","disconnected"]). No cycles (idle is a terminal sink). scripts/validate-scenario.ts imports @smartphonecracy/scenario via relative path ../packages/scenario/src/index.js (root package.json is intentionally outside the pnpm workspace glob, so package-name resolution isn't available from scripts/); no changes needed to root package.json (validate-scenario alias already present from STEP-001 scaffold).

### STEP-005: Server skeleton
- status: done
- owner: codex
- tier: complex
- depends-on: STEP-001, STEP-002, STEP-003, STEP-004
- files: apps/server/** (http, ws wiring, config)
- acceptance: Fastify + ws boot; /healthz, /readyz (fails on invalid scenario), /api/status; env/config module; serves display/phone/admin bundles; graceful shutdown
- verify: `pnpm --filter server test` → PASS (4 tests); `pnpm --filter server typecheck` → PASS; `pnpm -r test` → PASS (53 tests across 4 suites); `pnpm -r typecheck` → PASS (7 workspaces), 2026-07-11. Node 20.12.2 emitted the expected repo engine warning for >=22.
- reviewer: claude
- notes: Ready for claude review. Added validated env/config with repo-root path resolution; deployment scenario+manifest+media readiness that leaves liveness up and returns 503 from /readyz on invalid content; sanitized /api/status; display/phone/admin static bundle routes; /ws upgrade boundary; signal handling; and pre-close WebSocket termination for deadlock-free graceful shutdown. Tests cover config rejection, valid/invalid readiness, all bundle roles, secret omission, a real localhost WebSocket upgrade, and connected-client shutdown.
  APPROVED by claude review lane (sonnet) 2026-07-12: re-verified `pnpm --filter server typecheck/test` and `pnpm -r typecheck/test` (Node 22.17.0) all pass matching the notes; graceful shutdown double-close guard, sanitized /api/status, path-traversal-safe static bundle serving, and 503 invalid-scenario /readyz all check out; no socket message handling exists yet so the parseClientMessage requirement doesn't yet apply (correctly deferred to later steps). Two non-blocking FYIs left for future hardening, not blocking this step: (1) `void shutdown(...)` in index.ts doesn't catch a rejection from app.close(), a latent unhandled-rejection risk if close ever throws; (2) /readyz readiness is computed once at boot and never rechecked per request — fine for the current fixed-scenario-at-boot model, but STEP-019 admin-driven scenario reload will need an explicit recompute hook.

### STEP-006: Admission — grants, leases, registry
- status: in-progress
- owner: codex
- tier: complex
- depends-on: STEP-005
- files: apps/server/src/admission/**, room registry
- acceptance: HMAC join grants (rotation/expiry per policy), participant leases (2 h, installation-scoped, same-lease socket replacement), 30-cap with room_full + lease reconnect at capacity, per-IP rate limit (memory only), identity/color assignment
- verify: pnpm --filter server test (admission suite)
- reviewer: claude
- notes: Claimed by codex 2026-07-12. Fable review required for grant/lease crypto. Implementing HMAC grants and leases, in-memory registry/rate limiting, and parsed WebSocket admission handling within the reserved server slice.

### STEP-007: Phase engine
- status: todo
- owner: —
- tier: complex
- depends-on: STEP-005, STEP-006, STEP-003
- files: apps/server/src/engine/**
- acceptance: scenario-driven state machine; phase epochs reject stale input/events; lobby countdown, interactive-idle timeout, max-session cap; checkpoint hook on transitions; safe crash recovery → abort to idle (§6); display-disconnect policy (abort to idle after display timeout); no-participant grace-period return to idle; phones may join but cannot start a session without a connected healthy display
- verify: pnpm --filter server test (engine suite)
- reviewer: claude
- notes: —

### STEP-008: Vote engine + transition resolver
- status: todo
- owner: —
- tier: complex
- depends-on: STEP-007
- files: apps/server/src/votes/**
- acceptance: final-snapshot semantics (§8): statuses valid/never-moved/stale/disconnected; heartbeat-based staleness; fixed + quadrant-plurality resolution with tie/empty; countedStatuses filtering provably excludes; freezeMs hold; immutable snapshot enqueued before resolution
- verify: pnpm --filter server test (vote suite incl. boundary cases x=0.5/y=0.5/center)
- reviewer: claude
- notes: —

### STEP-009: Input pipeline + cursor tick loop
- status: todo
- owner: —
- tier: complex
- depends-on: STEP-006, STEP-007
- files: apps/server/src/cursors/**
- acceptance: input validation/clamping, latest-position store, fixed 20–30 Hz cursor batch tick to display, presence counts, ping/pong with serverTime
- verify: pnpm --filter server test (cursor suite)
- reviewer: claude
- notes: —

### STEP-010: QR grant push loop
- status: todo
- owner: —
- tier: simple
- depends-on: STEP-006, STEP-007
- files: apps/server/src/admission/qr.ts
- acceptance: qr_grant on display_join / qr_grant_request / every 60 s; large vs corner placement by phase; qr_hidden when admission closed; allowLateJoin=false ⇒ hidden after lobby
- verify: pnpm --filter server test (qr suite)
- reviewer: none
- notes: —

### STEP-011: Video phase handling
- status: todo
- owner: —
- tier: complex
- depends-on: STEP-007
- files: apps/server/src/engine/video.ts
- acceptance: video_ended accepted only from authenticated display with matching phase+epoch; expectedDurationMs+5 s fallback; idempotent (late video_ended cannot double-advance)
- verify: pnpm --filter server test (video suite)
- reviewer: claude
- notes: —

### STEP-012: Server integration tests over fake scenario
- status: todo
- owner: —
- tier: complex
- depends-on: STEP-004, STEP-006, STEP-007, STEP-008, STEP-009, STEP-010, STEP-011
- files: apps/server/test/integration/**
- acceptance: Phase 2 exit criteria — automated tests drive the entire fake scenario without a browser (join→lobby→video→questions→resolution→idle, incl. late join, disconnects, solo-abandon, recovery)
- verify: pnpm --filter server test
- reviewer: claude
- notes: —

### STEP-013: Display client core
- status: in-progress
- owner: claude
- tier: complex
- depends-on: STEP-002, STEP-004
- files: apps/display/**
- acceptance: three layers (§9); phase renderer from snapshots; server-time-corrected countdowns; reconnect w/ backoff + snapshot re-request; build-version reload handling; kiosk basics (hidden cursor, no context menu, wake lock attempt)
- verify: pnpm --filter display test + Playwright smoke
- reviewer: codex
- notes: —

### STEP-014: Display media pipeline
- status: todo
- owner: —
- tier: complex
- depends-on: STEP-013
- files: apps/display/src/media/**
- acceptance: manifest fetch + byte/hash verify before ready; Cache Storage by content hash; Blob URLs only for active/next videos w/ revocation; visible retry state on failure; app-shell-only service worker; preload next during questions
- verify: pnpm --filter display test + Playwright media suite
- reviewer: codex
- notes: —

### STEP-015: Display cursors + question rendering
- status: todo
- owner: —
- tier: complex
- depends-on: STEP-013
- files: apps/display/src/cursors/**, question UI
- acceptance: canvas cursor field w/ ~100 ms interpolation; axis cross + pinned quadrant labels; optional live counts (only when server sends them); join halo; freeze + winner/tie/empty highlight for freezeMs on corrected time
- verify: pnpm --filter display test + Playwright
- reviewer: codex
- notes: —

### STEP-016: Display QR + heartbeat
- status: todo
- owner: —
- tier: simple
- depends-on: STEP-013
- files: apps/display/src/qr/**, heartbeat
- acceptance: renders latest qr_grant (large/corner), hides at expiresAt on corrected time; display_heartbeat loop; display_replaced notice handling
- verify: pnpm --filter display test
- reviewer: none
- notes: —

### STEP-017: Phone client
- status: todo
- owner: —
- tier: complex
- depends-on: STEP-002
- files: apps/phone/**
- acceptance: QR join flow; expired-grant/room-full/rate-limited states; fullscreen relative trackpad (touch-action none, throttled 20–30 Hz); identity marker matching cursor; lease in localStorage; reconnect + identity restore; input ignored outside question phases; build-version mismatch reload handling (service-worker app-shell update + rejoin)
- verify: pnpm --filter phone test + Playwright mobile emulation
- reviewer: codex
- notes: real iOS/Android sensitivity tuning deferred to Phase 7 hardware pass.

### STEP-018: Persistence layer
- status: todo
- owner: —
- tier: complex
- depends-on: STEP-007, STEP-008
- files: infra/migrations/**, apps/server/src/persistence/**
- acceptance: §11 tables; write queue w/ retry buffer + shutdown flush; gameplay never blocks on DB; checkpoints on transitions; outcome_json completeness; recovery events; no raw movement traces; retention-policy fields AND testable retention-deletion behavior (participant-level records expire per §11 policy)
- verify: pnpm --filter server test (persistence suite w/ local pg or pglite)
- reviewer: claude
- notes: —

### STEP-019: Admin API + UI
- status: todo
- owner: —
- tier: complex
- depends-on: STEP-007, STEP-009, STEP-018
- files: apps/server/src/admin/**, apps/admin/**
- acceptance: §12 — status (health, heartbeat age, counts, session/phase), controls (start, idle, skip, restart), recent errors, CSV/JSON export; token-protected; audit-logged
- verify: pnpm --filter server test (admin suite) + admin UI smoke
- reviewer: claude
- notes: —

### STEP-020: simulate-clients load script
- status: todo
- owner: —
- tier: simple
- depends-on: STEP-002, STEP-006, STEP-009
- files: scripts/simulate-clients.ts, tests/load/**
- acceptance: 30 simulated phones join, move at 20–30 Hz, disconnect/reconnect; reports latency + drop stats
- verify: pnpm simulate-clients --count 30 against local server
- reviewer: none
- notes: —

### STEP-021: Deployment + CI
- status: todo
- owner: —
- tier: complex
- depends-on: STEP-012, STEP-016, STEP-017, STEP-019
- files: Dockerfile, infra/fly.toml, CI workflow
- acceptance: versioned container serving all bundles (display/phone/admin); fly.toml (min_machines_running=1, health checks); CI runs tests + scenario validation + build; manual production deploy gate + deploy-window check; rollback instructions
- verify: docker build + CI green
- reviewer: claude
- notes: provisioning/secrets moved to STEP-024. Split from venue hardening per codex review.

### STEP-022: Operations + venue docs
- status: todo
- owner: —
- tier: simple
- depends-on: STEP-021
- files: docs/operations.md, docs/venue-installation.md
- acceptance: §13 venue checklist (kiosk flags, watchdog, BIOS, VPN), staff power-cycle procedure, monitoring/alert list (§14), handoff package checklist (§18)
- verify: review pass
- reviewer: codex
- notes: —

### STEP-023: E2E + reliability test suite
- status: todo
- owner: —
- tier: complex
- depends-on: STEP-012, STEP-013, STEP-014, STEP-015, STEP-016, STEP-017, STEP-018
- files: tests/e2e/**
- acceptance: Playwright coverage of §16 automatable acceptance tests (server-kill, display-kill, stale-bundle reload, clock offset, second display, media failure retry); soak/venue tests documented as manual Phase 7 items
- verify: pnpm test:e2e
- reviewer: cross (both)
- notes: —

### STEP-024: Venue hardening, monitoring, provisioning
- status: todo
- owner: —
- tier: complex
- depends-on: STEP-021
- files: infra/**, scripts/kiosk/**, docs snippets
- acceptance: Fly/Supabase/CDN/domain provisioning (needs user credentials — flag when reached); secrets in host secret manager; kiosk watchdog script + boot config; monitoring + §14 alert set (server, display heartbeat, venue domains); alert on media-retry >2 min, abort frequency, memory/restart spikes
- verify: alerts fire in staged failure drills
- reviewer: claude
- notes: split from STEP-021 per codex review.

### STEP-025: Launch gate — reliability, soak, handoff
- status: todo
- owner: —
- tier: complex
- depends-on: STEP-000, STEP-020, STEP-023, STEP-024
- files: docs/**, tests/load/**
- acceptance: §16 acceptance list green: 30-client load test, server-kill/display-kill drills, stale-bundle reload, 48 h soak on the exact production mini PC with production media, venue acceptance test, approved privacy/visitor-notice package present, production content lock, §18 handoff package delivered
- verify: acceptance checklist signed off
- reviewer: cross (both)
- notes: largely manual/on-hardware; blocked until STEP-000 deliverables exist.
