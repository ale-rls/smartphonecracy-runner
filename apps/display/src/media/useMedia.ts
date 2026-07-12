import { useEffect, useMemo, useRef, useState } from "react";
import { mediaManifestSchema } from "@smartphonecracy/scenario";
import { MediaStore, type MediaSyncStatus } from "./mediaStore.js";

/**
 * Boot media synchronization for the display (plan §9): fetch and
 * verify the manifest, sync everything into Cache Storage, and expose
 * Blob URLs for the active video. The display is not "ready" until the
 * sync completes; failures surface as a visible retry state.
 */
export function useMedia(manifestUrl = "/media-manifest.json") {
  const [status, setStatus] = useState<MediaSyncStatus>({ state: "idle" });
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const activeSrc = useRef<string | null>(null);
  const store = useMemo(() => new MediaStore({ onStatus: setStatus }), []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // Manifest fetch shares the same retry loop semantics as media
      // downloads: keep trying, never declare ready without it.
      for (let attempt = 0; !cancelled; attempt += 1) {
        try {
          const response = await fetch(manifestUrl, { cache: "no-cache" });
          if (!response.ok) throw new Error(`manifest http ${response.status}`);
          const manifest = mediaManifestSchema.parse(await response.json());
          await store.sync(manifest);
          return;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const delayMs = Math.min(30_000, 1000 * 2 ** attempt);
          setStatus({ state: "retrying", attempt: attempt + 1, delayMs, lastError: message });
          await new Promise((r) => setTimeout(r, delayMs));
        }
      }
    })();
    return () => {
      cancelled = true;
      store.stop();
    };
  }, [store, manifestUrl]);

  /** Point the video layer at a cached src; revokes the previous URL. */
  const showVideo = async (src: string | null) => {
    activeSrc.current = src;
    if (src === null) {
      store.retainOnly(new Set());
      setVideoUrl(null);
      return;
    }
    const url = await store.getBlobUrl(src);
    // A phase may have changed while the blob was materializing.
    if (activeSrc.current !== src) return;
    store.retainOnly(new Set([src]));
    setVideoUrl(url);
  };

  return { status, videoUrl, showVideo, store };
}
