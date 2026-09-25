import { useEffect, useRef } from "react";

/** Plain delivery loop: the legacy perspective QR track does not fit this film. */
export function VenueLobbyVideo({ src, visible, soundEnabled }: {
  src: string;
  visible: boolean;
  soundEnabled: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (visible) void ref.current?.play()?.catch(() => undefined);
    else ref.current?.pause();
  }, [visible, src, soundEnabled]);
  return <video ref={ref} src={`/media/${encodeURIComponent(src)}`} autoPlay loop playsInline
    muted={!soundEnabled} style={{ objectFit: "contain", visibility: visible ? "visible" : "hidden" }}
    aria-label="Venue lobby film" />;
}
