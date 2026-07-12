# Show Studio runtime compatibility

The checked-in `@smartphonecracy/scenario` schemas and validators are the
authoritative import/export contract. The Studio adapter imports those schemas;
it does not maintain a second runtime schema.

## Implemented compatibility matrix

| Runtime area | Implemented shape | Adapter behavior |
| --- | --- | --- |
| Scenario version | Non-empty string | Preserved; no Studio-specific version coercion |
| Entry and cycles | `entryPhaseId` plus scenario-level `cyclesAllowed` | Preserved and graph-validated |
| Idle | `{ kind: "idle", id: "idle" }` | Preserved |
| Video transition | `next` is a phase-ID string | Preserved; no hypothetical transition object |
| Position-question transition | Discriminated `fixed` or `quadrant-plurality` object | Preserved and graph-validated |
| Media manifest | `{ files: [{ src, bytes, hash }] }` | Preserved; durations belong to video phases, not the manifest |
| Unknown runtime fields | Not interpreted by the current canonical schema | Raw-carried and restored on export; phase and manifest-file extensions follow stable `id`/`src` identities through collection edits |

## Unknown fields and versioning

Imports are parsed by the canonical Zod schemas. Known fields become the
editable canonical model. Fields stripped by those schemas are retained in a
separate `runtimeExtensions` sidecar and merged back at the same location on
compile. Reorderable top-level phase and manifest-file arrays are keyed by their
validator-enforced unique `id` and `src`; index alignment is used only inside
collections without a stable runtime identity. Known edited values win over sidecar values. Studio-only layout and
viewport data therefore cannot leak into runtime JSON, while a no-edit
import/export does not silently destroy fields written by a newer runtime.

An incompatible change to a known field still fails canonical parsing; it is
not disguised as an extension. `compileStudioGraph()` reparses both artifacts
and finishes with the existing graph/media-reference validator. Invalid runtime
output is rejected. A future runtime schema version should first update
`@smartphonecracy/scenario`; the adapter then adopts it through that dependency
and adds a compatibility fixture before Studio exposes the new fields for edit.
