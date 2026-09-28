import { useCallback, useEffect, useState } from "react";

export function FullscreenControl({ doc = document }: { doc?: Document }) {
  const [isFullscreen, setIsFullscreen] = useState(() => Boolean(doc.fullscreenElement));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(true);
  const supported = typeof doc.documentElement.requestFullscreen === "function"
    && typeof doc.exitFullscreen === "function";

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const showControl = () => {
      setActive(true);
      clearTimeout(timer);
      timer = setTimeout(() => setActive(false), 3_000);
    };
    const events = ["mousemove", "mousedown", "touchstart", "keydown"] as const;
    for (const event of events) doc.addEventListener(event, showControl);
    showControl();
    return () => {
      clearTimeout(timer);
      for (const event of events) doc.removeEventListener(event, showControl);
    };
  }, [doc]);

  useEffect(() => {
    const syncState = () => {
      setIsFullscreen(Boolean(doc.fullscreenElement));
      setPending(false);
    };
    const reportError = () => {
      setPending(false);
      setError("Fullscreen was blocked by the browser.");
    };
    doc.addEventListener("fullscreenchange", syncState);
    doc.addEventListener("fullscreenerror", reportError);
    return () => {
      doc.removeEventListener("fullscreenchange", syncState);
      doc.removeEventListener("fullscreenerror", reportError);
    };
  }, [doc]);

  const enterFullscreen = useCallback(async () => {
    if (!supported || pending) return;
    setPending(true);
    setError(null);
    try {
      await doc.documentElement.requestFullscreen();
    } catch {
      setError("Fullscreen was blocked by the browser.");
    } finally {
      setPending(false);
    }
  }, [doc, pending, supported]);

  if (isFullscreen || !active) return null;

  return <>
    <button
      type="button"
      className="fullscreen-control"
      disabled={!supported || pending}
      aria-pressed={isFullscreen}
      title={supported ? undefined : "Fullscreen is unavailable in this browser"}
      onClick={() => void enterFullscreen()}
    >
      Enter fullscreen
    </button>
    {error && <span className="fullscreen-error" role="status">{error}</span>}
  </>;
}
