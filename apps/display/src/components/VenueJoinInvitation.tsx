import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import type { QrGrantMessage } from "@smartphonecracy/protocol";
import type { ServerClock } from "../lib/serverClock.js";
import { shouldShowGrant } from "../qr/shouldShowGrant.js";

/** The server times empty sessions; retain the canvas while its invitation fades out. */
export function VenueJoinInvitation({ enabled, grant, qrHidden, clock }: {
  enabled: boolean;
  grant: QrGrantMessage | null;
  qrHidden: boolean;
  clock: ServerClock;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [readyUrl, setReadyUrl] = useState<string | null>(null);
  const [now, setNow] = useState(() => clock.now());
  const url = grant?.placement === "corner" ? grant.url : null;

  useEffect(() => {
    const timer = setInterval(() => setNow(clock.now()), 250);
    return () => clearInterval(timer);
  }, [clock]);

  useEffect(() => {
    if (!url || !canvas.current) return;
    let cancelled = false;
    void QRCode.toCanvas(canvas.current, url, { width: 224, margin: 4, errorCorrectionLevel: "M" })
      .then(() => { if (!cancelled) setReadyUrl(url); })
      .catch((error: unknown) => {
        if (!cancelled) setReadyUrl(null);
        console.warn("display: failed to render joining invitation:", error);
      });
    return () => { cancelled = true; };
  }, [url]);

  const visible = enabled && url !== null && readyUrl === url
    && shouldShowGrant(grant, Math.max(now, clock.now()), qrHidden);
  return <div className={`venue-join-invitation${visible ? " venue-join-invitation-visible" : ""}`} aria-hidden={!visible}>
    <canvas ref={canvas} aria-label="QR-Code zum Mitmachen" />
    <div>Mach mit</div>
  </div>;
}
