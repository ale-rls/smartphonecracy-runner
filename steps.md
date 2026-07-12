# steps.md — shared execution plan

Single source of truth for the two-agent implementation effort.
Agents: **claude** (Claude Code, Fable 5) and **codex** (Codex CLI, GPT-5.6).
Protocol agreed between both agents on 2026-07-11 (Codex session `019f52da-e20d-7e90-9475-51ee60a4659b`).

## Protocol

**Claiming.** Before editing this file: create the lock dir `.steps.lock/` (mkdir is
atomic), write `owner` and ISO timestamp into `.steps.lock/info`, re-read steps.md,
make your change, remove the lock. If mkdir fails, WAIT and retry — never
proceed with the edit and never delete a lock you did not create (only a lock
older than 10 minutes may be broken — verify no active writer if feasible, and
record the break in the step's notes). Shell scripts must not chain
`rm -rf .steps.lock` unconditionally after a possibly-failed mkdir.

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

## HANDOFF — claude lane quota outage (2026-07-12)

The claude lane (including its Sonnet review subagents) is out of credits —
this is a CONFIRMED quota outage per the Review-tiering rule. Until claude
returns, codex operates solo:

- **Proceed at risk** past any review owed by claude. Mark such steps
  "proceeding at risk pending claude review" in notes and continue to
  dependent steps. Queue of reviews claude owes on return, in priority
  order: STEP-008 re-review (fable-critical), then anything else marked
  at-risk. When claude returns, review-triggered fixes take priority.
- **Execution order for the codex slice**: finish STEP-008 fixes → 009 →
  010 → 011 → 026 → 012 → 018 (fable-critical review, proceed at risk) →
  019 → 020 (greedy) → 021 → 022 (greedy) → 024. STEP-023/025 need
  claude/client coordination and the launch gate — leave for joint work.
- **Claude's slice is complete** (001–004, 013–017, 027 all done). Do not
  modify packages/protocol, packages/scenario, packages/shared, or
  apps/display, apps/phone except via a new step claimed per protocol.
- **Git commits**: the index.lock EPERM failures were almost certainly
  contention with concurrent claude sessions — with claude gone, retry
  commits with short backoff (3 attempts). If commit still fails, leave
  the working tree intact and record "UNCOMMITTED — needs commit" in the
  step's notes; never discard work.
- **Per invocation discipline** stays the same: one step per run, verify,
  record results, end with BACKLOG_STATUS: remaining|empty|blocked.

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
- status: done
- owner: codex
- tier: complex
- depends-on: STEP-005
- files: apps/server/src/admission/**, room registry
- acceptance: HMAC join grants (rotation/expiry per policy), participant leases (2 h, installation-scoped, same-lease socket replacement), 30-cap with room_full + lease reconnect at capacity, per-IP rate limit (memory only), identity/color assignment
- verify: `pnpm --filter server typecheck` → PASS; `pnpm --filter server exec vitest run src/admission/admission.test.ts` → PASS (8 tests); `pnpm -r typecheck` → PASS (7 workspaces), 2026-07-12. Full `pnpm --filter server test` remains environment-blocked here by its pre-existing localhost WebSocket test (`listen EPERM: operation not permitted 127.0.0.1`); user reports the full suite passes outside this sandbox.
- reviewer: claude
- notes: Changes requested by Fable were applied. X-Forwarded-For is now honored only when `TRUST_PROXY=true` is parsed into config and passed to admission; otherwise the socket peer address is used. The registry now counts held leases toward the cap, keeps disconnected leases for a 30-second heartbeat/disconnect grace, permits the existing lease to reconnect at capacity, and removes expired/grace-finished records. Rate limiter buckets sweep expired windows on every consume. Added focused tests for trust gating, grace/cap behavior, bucket pruning, crypto boundaries, replacement, and parser-backed socket admission. Ready for Fable re-review; crypto core remains unchanged and approved. APPROVED by fable re-review 2026-07-12 (57cfd82): all three findings fixed and verified; full suite 83 tests green.

### STEP-007: Phase engine
- status: done
- owner: codex
- tier: complex
- depends-on: STEP-005, STEP-006, STEP-003
- files: apps/server/src/engine/**
- acceptance: scenario-driven state machine; phase epochs reject stale input/events; lobby countdown, interactive-idle timeout, max-session cap; checkpoint hook on transitions; safe crash recovery → abort to idle (§6); display-disconnect policy (abort to idle after display timeout); no-participant grace-period return to idle; phones may join but cannot start a session without a connected healthy display
- verify: `pnpm --filter server exec vitest run src/engine/phase-engine.test.ts` → PASS (7 tests); `pnpm --filter server typecheck` → PASS; `pnpm --filter server test` → 18/19 tests pass, with the pre-existing real-localhost WebSocket test sandbox-blocked by `listen EPERM: operation not permitted 127.0.0.1`; `pnpm -r typecheck` → PASS (7 workspaces), 2026-07-12.
- reviewer: claude
- notes: Ready for claude review. Added deterministic PhaseEngine lifecycle with idle/lobby/active states, scenario phase snapshots, per-session phase epochs, lobby countdown, question/video deadlines, interactive-idle and max-session aborts, no-participant grace, display-disconnect timeout abort, transition/checkpoint hooks, crash recovery to idle, stale event rejection, authenticated single-display replacement, display heartbeat/video handling, phone input gating, and admission-registry-backed participant/display broadcasts. Admission now forwards parsed client messages and lifecycle callbacks to the engine. Engine timer is started/stopped with server runtime shutdown. Full suite localhost bind limitation is environment-only.
  CHANGES REQUESTED by claude review lane (sonnet) 2026-07-12. Verification re-run clean: `pnpm --filter @smartphonecracy/server typecheck` PASS; `pnpm --filter @smartphonecracy/server test` PASS 17/17 (admission 8, phase-engine 5, server 4 — no localhost EPERM issue in this sandbox); `pnpm -r test` PASS 99 tests / 7 suites; `pnpm -r typecheck` PASS 7 workspaces. Most of the acceptance line checks out: epoch-tagged stale-input/stale-display-event rejection, lobby countdown, max-session cap (works under cyclic graphs since it's a pure wall-clock check independent of phase structure), checkpoint hook fired on every transition (correctly left unwired to persistence pending STEP-018), display-disconnect→idle, no-participant grace→idle, and "cannot start without a connected healthy display" are all correctly implemented and covered by tests.
  BLOCKING DEFECT (confirmed by direct reproduction, not just inspection): the interactive-idle timeout does not exclude video-phase time as required ("video playback must NOT count toward this interactive-idle timeout"). In `apps/server/src/engine/phase-engine.ts`, `enterPhase()` only sets `lastInputAt` via `this.lastInputAt ??= now` (line ~389) — i.e. once per session, on first null — never on subsequent phase entries. `recordInput()` only updates it during `position-question` phases. So elapsed wall-clock time spent in an intervening `video` phase (during which input is intentionally not tracked) is never excluded from the idle budget of the position-question phase that follows: the stale `lastInputAt` from before the video is reused, and the video's duration silently eats into the 3-minute budget. Reproduced standalone (video 220s + 250ms into the next question phase, zero real inactivity within the question phase itself) → engine aborts to idle on the very next tick with checkpoint reason `interactive-idle-timeout`, i.e. the question phase never gets a chance to run once lobby+preceding video time exceeds `interactiveIdleTimeoutMs` (180s default). This is easy to hit with a normal-length intro video. None of the 5 existing tests in `phase-engine.test.ts` catch it because `completeVideo` is always invoked at the same `now` as session start in those tests (zero simulated video duration). Fix direction: reset/advance `lastInputAt` at the boundary into a tracked (lobby/position-question) phase from an untracked one, so elapsed time in video (or any other non-tracked phase kind) is excluded, while still deciding intentionally whether idle time should keep accruing across back-to-back tracked phases (e.g. lobby→question with no intervening video) — current code accidentally does the latter only because it never resets, not by design.
  Secondary, same-root-cause finding (non-blocking on its own, but likely resolved by the same fix): the interactive-idle check in `tick()` is only evaluated in the `if (this.lifecycle === "lobby") { ...; return; }` branch's absence — i.e. it's skipped entirely while `lifecycle === "lobby"` (the function returns after the lobby-deadline check, never reaching the interactive-idle block at line ~204). So "only during lobby/question phases" is not actually enforced during lobby; it's a no-op there today, currently masked because default `lobbyCountdownMs` (10s) is far shorter than `interactiveIdleTimeoutMs` (180s).
  Everything else (checkpoint/admission seams, single-display replacement/auth, crash-recovery-to-idle boundary correctly deferred pending STEP-018 checkpoint persistence) looks correct. Re-request review once the idle-timer scoping is fixed; recommend adding a regression test with non-zero simulated video duration before re-submitting.
  FIXED after review: `enterPhase()` now re-anchors the idle baseline on every `position-question` entry and clears it for video/idle phases, excluding video wall-clock time from interactive idle. `tick()` now enforces the interactive-idle timeout during lobby while retaining the lobby deadline transition behavior. Added regressions for a 220-second video before a question and for lobby inactivity. Ready for claude re-review; STEP-008 remains unclaimed.
  APPROVED by claude review lane (sonnet) 2026-07-12: re-reviewed fix commit 6aa724b; both findings resolved. Re-ran the original standalone repro against the fixed engine — 220s video then question phase survives (was: instant abort), and the idle budget is now anchored exactly at question entry (still active at +179s of genuine in-question inactivity, aborts with `interactive-idle-timeout` at +180.1s). Lobby-idle enforcement verified in code and by the new test; the post-`startSession` fall-through in the reworked lobby tick branch is safe (no double-transition: fresh idle anchor, zero session elapsed, future deadline). New regression tests encode realistic durations (220_000ms video vs 180_000ms idle timeout — not zero-time). Verification: `pnpm --filter @smartphonecracy/server typecheck` PASS; `pnpm --filter @smartphonecracy/server test` PASS 19/19 (engine 7, admission 8, server 4; no localhost EPERM in this sandbox). FYI, non-blocking: input during lobby cannot refresh the idle anchor (`recordInput` requires active+question), which only matters if a config sets `lobbyCountdownMs` > `interactiveIdleTimeoutMs`; unreachable with defaults and there is no trackpad surface during lobby.

### STEP-008: Vote engine + transition resolver
- status: review
- owner: codex
- tier: complex
- depends-on: STEP-007
- files: apps/server/src/votes/**, apps/server/src/engine/phase-engine.ts, apps/server/src/engine/phase-engine.test.ts, apps/server/src/admission/registry.ts
- acceptance: final-snapshot semantics (§8): statuses valid/never-moved/stale/disconnected; heartbeat-based staleness; fixed + quadrant-plurality resolution with tie/empty; countedStatuses filtering provably excludes; freezeMs hold; immutable snapshot enqueued before resolution
- verify: `pnpm --filter @smartphonecracy/server typecheck` → PASS; focused server suites (`src/admission/admission.test.ts`, `src/engine/phase-engine.test.ts`, `src/votes/vote-engine.test.ts`) → PASS (25 tests); `pnpm --filter protocol test` → PASS (30 tests); `pnpm --filter display test` → PASS (40 tests); `pnpm -r typecheck` → PASS (7 workspaces), 2026-07-12. Node 20.12.2 emitted the expected repo engine warning for >=22.
- reviewer: claude
- notes: Reclaimed by codex 2026-07-12 and fixed all three Fable findings: input refreshes heartbeat liveness; fixed transitions emit winner:"fixed" with real positional counts; dirty question-status updates flush at a fixed 250 ms cadence. Added regressions for liveness, fixed resolution, and throttling. STEP-027 protocol/display edits remain separately owned and uncommitted in the shared worktree; compatibility tests pass. Ready for Fable re-review; proceeding at risk pending claude review due confirmed quota outage. FYI for STEP-018: disconnected currently takes precedence over never-moved in statusOf.

### STEP-009: Input pipeline + cursor tick loop
- status: review
- owner: codex
- tier: complex
- depends-on: STEP-006, STEP-007
- files: apps/server/src/cursors/**, apps/server/src/engine/phase-engine.ts
- acceptance: input validation/clamping, latest-position store, fixed 20–30 Hz cursor batch tick to display, presence counts, ping/pong with serverTime
- verify: `pnpm --filter @smartphonecracy/server typecheck` → PASS; focused cursor/engine/admission suites → PASS (21 tests); `pnpm -r typecheck` → PASS (7 workspaces); full server suite → 31/32 PASS with only the pre-existing sandbox-blocked localhost WebSocket test (`listen EPERM 127.0.0.1`), 2026-07-12.
- reviewer: claude
- notes: Added defensive finite input validation/clamping, monotonic per-client sequence filtering, latest-position storage, full cursor batches at a fixed 25 Hz, membership-driven presence updates, immediate display presence sync, and replacement-safe participant cleanup. Existing admission parser/ping path supplies validated ping/pong with echoClientTime and serverTime. Ready for claude review; proceeding at risk pending claude review due confirmed quota outage. STEP-027 protocol/display edits remain separately owned and preserved.

### STEP-010: QR grant push loop
- status: done
- owner: codex
- tier: simple
- depends-on: STEP-006, STEP-007
- files: apps/server/src/admission/qr.ts, apps/server/src/admission/qr.test.ts, apps/server/src/admission/index.ts, apps/server/src/engine/phase-engine.ts, apps/server/src/engine/phase-engine.test.ts, apps/server/src/server.ts
- acceptance: qr_grant on display_join / qr_grant_request / every 60 s; large vs corner placement by phase; qr_hidden when admission closed; allowLateJoin=false ⇒ hidden after lobby
- verify: `pnpm --filter @smartphonecracy/server exec vitest run src/admission/qr.test.ts src/engine/phase-engine.test.ts` → PASS (15 tests); `pnpm --filter @smartphonecracy/server typecheck` → PASS; `pnpm -r typecheck` → PASS (7 workspaces); full server suite → 36/37 PASS with only the pre-existing sandbox-blocked localhost WebSocket test (`listen EPERM 127.0.0.1`), 2026-07-12.
- reviewer: none
- notes: Added a QR grant push loop with signed URL construction, 60-second rotation while a display is connected, large idle/lobby and corner active placement, and active-policy hiding. Authenticated display join, refresh requests, and lifecycle transitions now push current QR state; unauthenticated refresh requests are ignored. Discovered QR delivery required PhaseEngine/server integration and expanded the reservation after coordinating that STEP-011 was unclaimed.

### STEP-011: Video phase handling
- status: review
- owner: codex
- tier: complex
- depends-on: STEP-007
- files: apps/server/src/engine/video.ts, apps/server/src/engine/video.test.ts, apps/server/src/engine/phase-engine.ts, apps/server/src/engine/phase-engine.test.ts
- acceptance: video_ended accepted only from authenticated display with matching phase+epoch; expectedDurationMs+5 s fallback; idempotent (late video_ended cannot double-advance)
- verify: `pnpm --filter @smartphonecracy/server exec vitest run src/engine/video.test.ts src/engine/phase-engine.test.ts` → PASS (16 tests); `pnpm --filter @smartphonecracy/server typecheck` → PASS; full server suite → 41/42 PASS with only the pre-existing sandbox-blocked localhost WebSocket test (`listen EPERM 127.0.0.1`), 2026-07-12.
- reviewer: claude
- notes: Added a one-shot video-phase handler shared by authenticated display completion and the expectedDurationMs+5 s fallback, with stale identity rejection and cancellation on every phase transition. Engine tests cover unauthenticated rejection, matching phase/epoch, late-event idempotency, and the exact fallback boundary. Discovered integration overlap coordinated with the codex root: phase-engine.ts and focused engine tests were no longer actively reserved (STEP-008/009 review, STEP-010 done), so the STEP-011 reservation was expanded before editing them. Ready for claude review; proceeding at risk pending claude review due confirmed quota outage.

### STEP-012: Server integration tests over fake scenario
- status: review
- owner: codex
- tier: complex
- depends-on: STEP-004, STEP-006, STEP-007, STEP-008, STEP-009, STEP-010, STEP-011
- files: apps/server/test/integration/**
- acceptance: Phase 2 exit criteria — automated tests drive the entire fake scenario without a browser (join→lobby→video→questions→resolution→idle, incl. late join, disconnects, solo-abandon, recovery)
- verify: focused integration suite → PASS (3 tests); `pnpm --filter @smartphonecracy/server typecheck` → PASS; `pnpm -r typecheck` → PASS (7 workspaces); full server suite → 45/46 PASS with only the pre-existing sandbox-blocked localhost WebSocket test (`listen EPERM 127.0.0.1`), 2026-07-12.
- reviewer: claude
- notes: Added deterministic browserless integration coverage through the real admission parser/controller and PhaseEngine against content/scenarios/dev.json. Tests cover the complete join→lobby→video→fixed question→quadrant question→idle flow, late join snapshots, disconnect participation, solo-abandon grace, and crash recovery checkpoints. No production integration fixes were needed. Ready for claude review; proceeding at risk pending claude review due confirmed quota outage.

### STEP-013: Display client core
- status: done
- owner: claude
- tier: complex
- depends-on: STEP-002, STEP-004
- files: apps/display/**
- acceptance: three layers (§9); phase renderer from snapshots; server-time-corrected countdowns; reconnect w/ backoff + snapshot re-request; build-version reload handling; kiosk basics (hidden cursor, no context menu, wake lock attempt)
- verify: `pnpm --filter display test` → PASS (11 tests); `pnpm --filter display typecheck` → PASS; `pnpm --filter display build` → PASS (2026-07-12). Playwright smoke explicitly accepted as deferred to STEP-023 because no e2e harness exists yet.
- reviewer: codex
- notes: APPROVED by codex 2026-07-12. Reviewed reconnect/backoff ownership, display_join and ping/pong clock correction, median-offset ServerClock, per-session epoch guard semantics, reload flow, and kiosk guards. The three-layer renderer is appropriately scoped; plain media and minimal question rendering remain deferred to STEP-014/015. Playwright smoke is explicitly accepted as deferred to STEP-023, which owns the future e2e harness.

### STEP-014: Display media pipeline
- status: done
- owner: claude
- tier: complex
- depends-on: STEP-013
- files: apps/display/src/media/**
- acceptance: manifest fetch + byte/hash verify before ready; Cache Storage by content hash; Blob URLs only for active/next videos w/ revocation; visible retry state on failure; app-shell-only service worker; preload next during questions
- verify: pnpm --filter display test → PASS (18 tests incl. 7 media) + typecheck + vite build PASS (2026-07-12). Playwright media suite deferred to STEP-023 (accepted pattern).
- reviewer: codex
- notes: MediaStore (injectable caches/fetch/digest): boot sync keyed by content hash, byte+sha256 verify per download, stale-entry eviction, endless capped-backoff retry (never ready with missing media); Blob URLs memoized per src, retainOnly() revokes outside the active set; useMedia hook gates UI on ready + visible retry state; public/sw.js is app-shell only (never intercepts /media/), cache-first hashed assets, network-first HTML. Next-video preload wired but waits on STEP-026 (id→src map) — only the active video gets a Blob URL until then. FIXES 2026-07-12: cached entries now re-hashed at boot (corruption test added); showVideo race purges stray Blob URLs via retainOnly on stale resolve; pending video re-resolves when sync reaches ready; SW narrowed to /assets/ + navigations only. Back to review. FIX 2026-07-12b: stop() now revokes all live Blob URLs (test added). Back to review.
  CHANGES REQUESTED by codex review 2026-07-12: (1) `syncOnce()` trusts a cached response solely from its `content-length`; read and verify the cached body’s actual byte length and sha256 against the manifest before counting it as synced/allowing `ready`, with a same-size-corrupt-cache regression test. (2) Fix the `useMedia` race where a video phase arrives before media sync finishes: `showVideo()` can return null once and its phase-only effect never retries after `ready`; add a readiness-triggered retry/test. (3) If `getBlobUrl()` resolves after the phase changes, revoke/discard the newly created stale URL (and clean up on unmount/stop) so asynchronous phase changes cannot leak Blob URLs. (4) Narrow `sw.js` to actual app-shell HTML and `/assets/` requests; its current “everything else” network-first branch intercepts/caches non-shell GETs such as `/api` and the manifest, contrary to app-shell-only semantics. Keep next-video preloading explicitly deferred to STEP-026’s public id→src map dependency.
  Verification by codex: `pnpm --filter @smartphonecracy/display typecheck` PASS; `pnpm --filter @smartphonecracy/display test` PASS (18 tests, 2 files); `pnpm --filter @smartphonecracy/display build` PASS; `node --check apps/display/public/sw.js` PASS, 2026-07-12. Status remains `review` pending the requested fixes.
  CHANGES REQUESTED by codex re-review 2026-07-12: (1) Finding (3) is only partially fixed: `useMedia` now purges a stale async URL, but its effect cleanup calls `store.stop()` and `MediaStore.stop()` only sets `stopped`; it never revokes Blob URLs already held in `blobUrls`. Add stop/unmount cleanup (and a regression test) so a kiosk unmount/restart cannot leak active object URLs. (2) Re-review remains blocked until this is fixed.
  APPROVED by codex re-review 2026-07-12: `MediaStore.stop()` now calls `retainOnly(new Set())`, revoking every live Blob URL; the new regression test passes. Current committed HEAD verification: display tests PASS (40/40, including STEP-016 additions) and display typecheck PASS. The fix-era baseline was 28 tests; the higher current count is due to committed STEP-016 coverage.

### STEP-015: Display cursors + question rendering
- status: done
- owner: claude
- tier: complex
- depends-on: STEP-013
- files: apps/display/src/cursors/**, question UI
- acceptance: canvas cursor field w/ ~100 ms interpolation; axis cross + pinned quadrant labels; optional live counts (only when server sends them); join halo; freeze + winner/tie/empty highlight for freezeMs on corrected time
- verify: pnpm --filter display test → PASS (27 tests incl. 9 cursor/question) + typecheck + build PASS (2026-07-12). Playwright deferred to STEP-023 (accepted pattern).
- reviewer: codex
- notes: CursorField (pure): 100 ms render-delay interpolation between last two ticks, stale-tick rejection, absent-cursor removal, join-halo progress, freeze semantics (ingest ignored while frozen); CursorCanvas rAF w/ destination-out fade trails, crisp full-clear while frozen; QuadrantOverlay pins q1 TR/q2 TL/q3 BL/q4 BR, live counts only when server sends them, winner/tie/empty highlight; store: question_status/resolved gated to current session+epoch, cleared on phase advance; cursors bypass React (direct CursorField ingest). freezeUntil display-side hold ends when server advances phase (server owns freezeMs timing). FIX 2026-07-12: freeze now derives from the reducer's session/epoch-gated resolution state via effect (stale question_resolved can no longer freeze the field); onMessage freeze shortcut removed. Back to review.
  CHANGES REQUESTED by codex review 2026-07-12: `displayReducer` correctly gates `question_status`/`question_resolved`, but `App` calls `cursorField.setFrozen(true)` for every `question_resolved` before reducer validation. A delayed prior-session or prior-epoch resolution can therefore freeze the cursor field even though its question frame is rejected from UI state. Gate the freeze side effect using the current session+epoch (or route it through the same authoritative state transition), and add a stale-resolution regression test. Keep server-owned `freezeMs` semantics.
  Verification by codex: `pnpm --filter @smartphonecracy/display exec vitest run --reporter=verbose` PASS (27 tests / 3 files); `pnpm --filter @smartphonecracy/display typecheck` PASS; `pnpm --filter @smartphonecracy/display build` PASS, 2026-07-12. Status remains `review` pending the requested fix.
  APPROVED by codex re-review 2026-07-12: freeze now derives from reducer state whose resolution is gated by current session+epoch, and the pre-reducer `question_resolved` shortcut is deleted; stale resolutions therefore cannot freeze the field. Current committed HEAD verification: display tests PASS (40/40, including STEP-016 additions) and display typecheck PASS. The fix-era baseline was 28 tests; the higher current count is due to committed STEP-016 coverage.

### STEP-016: Display QR + heartbeat
- status: done
- owner: claude
- tier: simple
- depends-on: STEP-013
- files: apps/display/src/qr/**, heartbeat
- acceptance: renders latest qr_grant (large/corner), hides at expiresAt on corrected time; display_heartbeat loop; display_replaced notice handling
- verify: pnpm --filter @smartphonecracy/display typecheck && pnpm --filter @smartphonecracy/display test && pnpm --filter @smartphonecracy/display build → all PASS (40 tests incl. 12 new: 8 qr + 4 heartbeat) (2026-07-12)
- reviewer: none
- notes: QrBadge (src/components/QrBadge.tsx) renders the latest qr_grant via the `qrcode` npm package (added as a dependency; generated fully client-side, no network fetch — Vite resolves its `browser` package.json field, verified no Node-only APIs in the built bundle). Visibility is a pure `shouldShowGrant(grant, nowServerTime, qrHidden)` helper (src/qr/shouldShowGrant.ts) polled ~1x/s against connection.clock (corrected server time) plus reactive to qr_hidden; placement/sizing is a pure `placementClassName`/`qrSizePx` (src/qr/placement.ts) — server picks large (idle/lobby, centered) vs corner (small), the display's `corner` prop only picks which screen corner, default bottom-right. Heartbeat (src/lib/heartbeat.ts, `startHeartbeat`) sends display_heartbeat every 5s only while `isOpen()` is true, reading sessionId/phaseId/phaseEpoch fresh each tick via a getter backed by a React ref (never a stale closure), clientTime from an injectable `now`. Idle-session convention confirmed in apps/server/src/engine/phase-engine.ts: sessionId="idle" and phaseId="idle" are the literal placeholders the engine itself uses pre-session (phaseEpoch 0), matched exactly (IDLE_PLACEHOLDER="idle") for the pre-first-snapshot state, satisfying the protocol's nonEmpty-string schema and the server's `matches()` equality check. display_replaced already landed in state.notice (STEP-013); App.tsx now adds a `notice-prominent` class specifically for that code so it's visually distinct from routine notices. Note: App.tsx had a concurrent edit in flight from another lane (question_resolved freeze moved to a session/epoch-gated useEffect) when this step started; merged cleanly on top without reverting it.

### STEP-017: Phone client
- status: done
- owner: claude
- tier: complex
- depends-on: STEP-002
- files: apps/phone/**
- acceptance: QR join flow; expired-grant/room-full/rate-limited states; fullscreen relative trackpad (touch-action none, throttled 20–30 Hz); identity marker matching cursor; lease in localStorage; reconnect + identity restore; input ignored outside question phases; build-version mismatch reload handling (service-worker app-shell update + rejoin)
- verify: `pnpm --filter phone test` → PASS (11 tests); `pnpm --filter phone typecheck` → PASS; `pnpm --filter phone build` → PASS (2026-07-12). Playwright mobile emulation explicitly accepted as deferred to STEP-023 because no e2e harness exists yet.
- reviewer: codex
- notes: APPROVED by codex 2026-07-12. Reviewed installation-scoped lease persistence and private-mode fallback, `?g=` join/reconnect flow, rejection states, question-only input gating, per-session epoch guard, relative trackpad clamping, and 25 Hz throttle. Real iOS/Android sensitivity tuning remains a Phase 7 hardware pass. Playwright mobile emulation is explicitly accepted as deferred to STEP-023, which owns the future e2e harness.

### STEP-018: Persistence layer
- status: review
- owner: codex
- tier: complex
- depends-on: STEP-007, STEP-008
- files: infra/migrations/**, apps/server/src/persistence/**
- acceptance: §11 tables; write queue w/ retry buffer + shutdown flush; gameplay never blocks on DB; checkpoints on transitions; outcome_json completeness; recovery events; no raw movement traces; retention-policy fields AND testable retention-deletion behavior (participant-level records expire per §11 policy)
- verify: `pnpm --filter @smartphonecracy/server exec vitest run src/persistence/persistence.test.ts src/engine/phase-engine.test.ts src/votes/vote-engine.test.ts` → PASS (26 tests); `pnpm --filter @smartphonecracy/server typecheck` → PASS; `pnpm -r typecheck` → PASS (7 workspaces); `git diff --check` → PASS, 2026-07-12. Broader focused run including server.test.ts: 28/29 PASS; only localhost WebSocket bind test sandbox-blocked (`listen EPERM 127.0.0.1`).
- reviewer: claude
- notes: Implemented all §11 tables and indexes, scenario registration, transactional Postgres adapter, ordered non-blocking write queue with exponential retries and shutdown flush, transition/recovery checkpoint persistence, explicit recovery events, full immutable vote snapshots and reproducible outcome_json, 90-day-policy retention timestamps, and executable participant-data deletion. Schema deliberately has no raw cursor trace, grant, lease, or IP storage. Discovered required overlap: apps/server/src/server.ts for engine hook wiring and shutdown flush; no active step reserved that file at discovery time. Ready for Fable-critical claude review; proceeding at risk pending claude review due confirmed quota outage.

### STEP-019: Admin API + UI
- status: review
- owner: codex
- tier: complex
- depends-on: STEP-007, STEP-009, STEP-018
- files: apps/server/src/admin/**, apps/server/src/config.ts, apps/server/src/server.ts, apps/server/src/engine/phase-engine.ts, apps/server/src/persistence/**, apps/admin/**
- acceptance: §12 — status (health, heartbeat age, counts, session/phase), controls (start, idle, skip, restart), recent errors, CSV/JSON export; token-protected; audit-logged
- verify: `pnpm --filter @smartphonecracy/server exec vitest run src/admin/admin.test.ts src/persistence/persistence.test.ts src/engine/phase-engine.test.ts` → PASS (22 tests); `pnpm --filter @smartphonecracy/admin test` → PASS (1 smoke test); `pnpm --filter @smartphonecracy/admin build` → PASS; `pnpm -r typecheck` → PASS (7 workspaces); `git diff --check` → PASS, 2026-07-12. Full server suite 54/55 PASS; only the known sandbox localhost bind test fails with `listen EPERM 127.0.0.1`.
- reviewer: claude
- notes: Added strong bearer-token protection (production rejects the development token), operational health/display-heartbeat/count/session/phase status, safe start/idle/skip/restart engine controls, recent error capture, JSON/CSV session exports, durable admin-action/error audit writes, and a polling operations UI with controls and downloads. Reservation expanded before edits to config/server wiring, engine controls, and persistence seams; no active step reserved those files. Ready for claude review; proceeding at risk pending claude review due confirmed quota outage.

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

### STEP-026: Public video phase map API
- status: done
- owner: codex
- tier: simple
- depends-on: STEP-005
- files: apps/server/** (public phases API route)
- acceptance: `GET /api/phases` returns a sanitized public map of video phase IDs to media `src` values for display preloading, without exposing private configuration or scenario internals
- verify: `pnpm --filter @smartphonecracy/server exec vitest run src/server.test.ts -t "public video phase|invalid scenario"` → PASS (2 tests; 3 unrelated skipped); `pnpm --filter @smartphonecracy/server typecheck` → PASS, 2026-07-12. Node 20.12.2 emitted the expected repo engine warning for >=22.
- reviewer: none
- notes: Added `GET /api/phases` as an exact video phase ID→media src map; no durations, graph edges, scenario metadata, secrets, or non-video phases are exposed. Invalid scenario readiness fails closed with 503 `scenario_unavailable`. Self-verified as a simple step.

### STEP-027: winner:"fixed" protocol + display support
- status: done
- owner: claude
- tier: simple
- depends-on: STEP-002
- files: packages/protocol/src/messages.ts, apps/display/src/components/QuadrantOverlay.tsx (+tests)
- acceptance: question_resolved winner enum gains "fixed"; display renders no winner/empty highlight and no outcome state for winner:"fixed" (counts still shown if present); discovered during STEP-008 fable review
- verify: pnpm --filter protocol test → PASS (30) + pnpm --filter display test → PASS (40) + typechecks + display build PASS (2026-07-12)
- reviewer: none
- notes: unblocks STEP-008 finding (2). Commit was delayed: the original commit attempt ran from a wrong working directory during the claude-lane wind-down and silently failed; code was verified green before that. Committed during handoff cleanup.
