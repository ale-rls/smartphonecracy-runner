# Show Studio curator guide

Show Studio is a local authoring tool. It cannot publish to, or change, a running installation. Deployment remains the existing engineer-reviewed repository and CI workflow.

## Create or import

Open the Studio with `pnpm --filter studio dev`. Choose **New show** for a minimal idle-only project, or import `scenario.json` and `media-manifest.json` together. A Studio backup can be imported by itself. Drafts autosave in this browser; the status in the toolbar reports saving, saved, or error.

Use the node palette to add phases, connect their typed handles, and select a node to edit its properties. The End node means “return to idle/attract”; the required runtime `idle` phase stays in the exported scenario without appearing as a duplicate canvas node. Quadrant outputs are q2 top-left, q1 top-right, q3 bottom-left, and q4 bottom-right; the exact center belongs to q4. Runtime IDs must be unique. Undo is available for inspector changes, including destructive phase-type and transition changes.

## Validate and preview

The Validation and media panel lists blocking errors, warnings, media references, and per-branch budgets. Fix every error. Review and explicitly acknowledge each required warning; acknowledgement is a deliberate sign-off, not a way to make an error exportable.

Preview starts at the configured entry phase. Advance video and question timers manually, force each fixed/quadrant/tie/empty outcome, and exercise stale, disconnected, and abandoned-solo cases. The frozen result shows counted and excluded votes, quadrant totals, winner, and resolved target.

## Export and hand off

**Export for deployment** is enabled only after validation and warning acknowledgement. It emits a versioned set containing `scenario.json`, `media-manifest.json`, `.studio.json`, `validation-report.json`, and `README.txt`. Keep all five files together. The report records the runtime schema, Studio build, media total, warnings, and branch-smoke results. An engineer reviews the package and puts the runtime files through the normal repository/CI deployment process.

Use **Backup** for a restorable working draft. Browser storage is convenient, not an archival system; export a backup at each curator handoff.

## Recovery and limitations

If the newest IndexedDB revision is corrupt, reopening a recent draft recovers the last valid revision. If recovery is unavailable, import the last exported backup. V1 has no collaborative editing, accounts, direct publishing, media transcoding, or remote control. Multi-participant cursor dragging is the only approved post-v1 preview exclusion; outcome shortcuts cover the same resolution branches in v1.

The checked-in example is `content/scenarios/dev.json` with `content/media-manifest.json`. It includes a video, a fixed question, a six-outcome quadrant question, shared targets, and an idle end.

## V1 acceptance record

All §18 requirements are covered by adapter/unit/e2e regression tests: fixture import and semantic round-trip; runtime-validator-gated export; UI authoring; fixed and six-way transitions with shared targets; unreachable/cycle diagnostics; all outcome presets; distinct-media and 2 GiB gates; reload-persistent drafts and corrupt-revision recovery; runtime/layout separation; and versioned reproducible exports. Studio has no production route or installation-control API, so publishing and active sessions remain outside it. The sole deferred item is multi-participant drag simulation (STEP-044); it is not an §18 acceptance-row omission.
