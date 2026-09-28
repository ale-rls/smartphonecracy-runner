import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import type { QrGrantMessage } from "@smartphonecracy/protocol";
import type { ServerClock } from "../lib/serverClock.js";
import { shouldShowGrant } from "../qr/shouldShowGrant.js";
import { drawTrackedQr } from "../idle/tracking.js";
import { VENUE_MARKER_TRACKS } from "../idle/venueMarkerTrack.generated.js";
import { TRACKED_QR_ERROR_CORRECTION_LEVEL, TRACKED_QR_MARGIN_MODULES } from "../idle/qrPresentation.js";

export function VenueLobbyVideo({ src, visible, soundEnabled, grant, qrHidden, clock }: {
  src: string; visible: boolean; soundEnabled: boolean;
  grant: QrGrantMessage | null; qrHidden: boolean; clock: ServerClock;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const overlay = useRef<HTMLCanvasElement>(null);
  const [qr, setQr] = useState<HTMLCanvasElement | null>(null);
  const track = VENUE_MARKER_TRACKS[src];
  useEffect(() => {
    if (visible) void ref.current?.play()?.catch(() => undefined);
    else ref.current?.pause();
  }, [visible, src, soundEnabled]);
  useEffect(() => {
    let cancelled = false;
    setQr(null);
    if (grant) {
      const canvas = document.createElement("canvas");
      void QRCode.toCanvas(canvas, grant.url, { width: 512,
        margin: TRACKED_QR_MARGIN_MODULES, errorCorrectionLevel: TRACKED_QR_ERROR_CORRECTION_LEVEL,
      }).then(() => { if (!cancelled) setQr(canvas); }).catch(console.warn);
    }
    return () => { cancelled = true; };
  }, [grant]);
  useEffect(() => {
    const canvas = overlay.current;
    const video = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !video || !ctx || !track) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!visible) return;
    let id = 0;
    const useVideoFrames = typeof video.requestVideoFrameCallback === "function";
    const draw = (mediaTime: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (visible && qr && shouldShowGrant(grant, clock.now(), qrHidden)) {
        drawTrackedQr(ctx, qr, mediaTime, track);
      }
      id = useVideoFrames
        ? video.requestVideoFrameCallback((_now, metadata) => draw(metadata.mediaTime))
        : requestAnimationFrame(() => draw(video.currentTime));
    };
    draw(video.currentTime);
    return () => {
      if (useVideoFrames) video.cancelVideoFrameCallback(id);
      else cancelAnimationFrame(id);
    };
  }, [track, visible, qr, grant, clock, qrHidden]);
  return <>
    <video ref={ref} src={`/media/${encodeURIComponent(src)}`} autoPlay loop playsInline
      muted={!soundEnabled} style={{ objectFit: "contain", visibility: visible ? "visible" : "hidden" }}
      aria-label="Venue lobby film" />
    {track && <canvas ref={overlay} width={track.width} height={track.height}
      aria-label="Tracked venue join code" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", pointerEvents: "none", visibility: visible ? "visible" : "hidden" }} />}
  </>;
}
