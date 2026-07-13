import type { StudioProject } from "@smartphonecracy/studio-adapter";
import type { Draft } from "../model.js";

export const LOCAL_MEDIA_MANIFEST_ENDPOINT = "/__studio/local-media-manifest";

export type MediaManifest = StudioProject["manifest"];

const isManifest = (value: unknown): value is MediaManifest => {
  if (!value || typeof value !== "object" || !("files" in value) || !Array.isArray(value.files)) return false;
  return value.files.every((file) => file && typeof file === "object"
    && "src" in file && typeof file.src === "string" && file.src.length > 0
    && "bytes" in file && Number.isInteger(file.bytes) && (file.bytes as number) > 0
    && "hash" in file && typeof file.hash === "string" && file.hash.length > 0);
};

export async function loadLocalMediaManifest(fetcher: typeof fetch = fetch): Promise<MediaManifest | undefined> {
  try {
    const response = await fetcher(LOCAL_MEDIA_MANIFEST_ENDPOINT, { cache: "no-store" });
    if (!response.ok) return undefined;
    const value: unknown = await response.json();
    return isManifest(value) ? value : undefined;
  } catch {
    // A production/static Studio has no local filesystem endpoint; manual
    // runtime and backup imports continue to work there.
    return undefined;
  }
}

export function refreshDraftLocalMedia(draft: Draft, manifest: MediaManifest): Draft {
  const previousLocal = new Set(draft.localMediaSources ?? []);
  const currentLocal = new Set(manifest.files.map((file) => file.src));
  const importedOnly = draft.project.manifest.files.filter((file) =>
    !previousLocal.has(file.src) && !currentLocal.has(file.src));
  const files = [...importedOnly, ...structuredClone(manifest.files)]
    .sort((left, right) => left.src.localeCompare(right.src));
  return {
    ...draft,
    localMediaSources: [...currentLocal].sort(),
    project: {
      ...draft.project,
      manifest: { files },
    },
  };
}
