/**
 * Kiosk hardening basics (plan §9): hide the mouse cursor, disable
 * context menus, and try to keep the screen awake. Wake lock is a
 * best-effort layer only — the venue machine must also disable sleep at
 * the OS level (plan §13).
 */

export function applyKioskGuards(doc: Document = document): () => void {
  const onContextMenu = (e: Event) => e.preventDefault();
  doc.addEventListener("contextmenu", onContextMenu);
  doc.documentElement.style.cursor = "none";

  let wakeLock: { release: () => Promise<void> } | null = null;
  let disposed = false;

  const requestWakeLock = async () => {
    try {
      const nav = doc.defaultView?.navigator as
        | (Navigator & { wakeLock?: { request: (t: "screen") => Promise<never> } })
        | undefined;
      if (!nav?.wakeLock) return;
      wakeLock = await nav.wakeLock.request("screen");
    } catch {
      // Unsupported or denied: OS-level sleep settings are the real guard.
    }
  };

  const onVisibility = () => {
    if (doc.visibilityState === "visible" && !disposed) void requestWakeLock();
  };
  doc.addEventListener("visibilitychange", onVisibility);
  void requestWakeLock();

  return () => {
    disposed = true;
    doc.removeEventListener("contextmenu", onContextMenu);
    doc.removeEventListener("visibilitychange", onVisibility);
    doc.documentElement.style.cursor = "";
    void wakeLock?.release().catch(() => {});
  };
}

/**
 * Handle a server reload instruction (plan §7): refresh the app-shell
 * service worker registration, then reload. Injectable for tests.
 */
export async function performReload(
  win: Pick<Window, "location"> & {
    navigator?: {
      serviceWorker?: {
        getRegistrations: () => Promise<ReadonlyArray<{ update: () => Promise<unknown> }>>;
      };
    };
  } = window,
): Promise<void> {
  try {
    const registrations =
      (await win.navigator?.serviceWorker?.getRegistrations()) ?? [];
    await Promise.allSettled(registrations.map((r) => r.update()));
  } catch {
    // A failed SW update must never prevent the reload itself.
  }
  win.location.reload();
}
