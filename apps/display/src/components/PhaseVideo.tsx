import { useCallback, useEffect, useRef } from "react";
import {
  PROTOCOL_VERSION,
  type DisplayToServerMessage,
  type PhaseSnapshotMessage,
} from "@smartphonecracy/protocol";
import type { ServerClock } from "../lib/serverClock.js";
import { useVideoPlaybackDiagnostics } from "../media/useVideoPlaybackDiagnostics.js";

type VideoPhase = Extract<
  PhaseSnapshotMessage,
  { kind: "video" | "video-position-question" }
>;

export type PhaseVideoProps = {
  clock?: ServerClock;
  sessionId: string | null;
  phase: VideoPhase;
  phaseEpoch: number;
  src: string;
  extraAudioSrc?: string;
  soundEnabled: boolean;
  onVideoElement?: (video: HTMLVideoElement | null) => void;
  onExtraAudioElement?: (audio: HTMLAudioElement | null) => void;
  onFirstFrame?: () => void;
  send: (message: DisplayToServerMessage) => void;
};

export function PhaseVideo({
  clock,
  sessionId,
  phase,
  phaseEpoch,
  src,
  extraAudioSrc,
  soundEnabled,
  onVideoElement,
  onExtraAudioElement,
  onFirstFrame,
  send,
}: PhaseVideoProps) {
  const tailTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const extraAudioRef = useRef<HTMLAudioElement | null>(null);
  const firstFrameReported = useRef(false);
  const firstFrameCallback = useRef<{ video: HTMLVideoElement; id: number } | null>(null);
  const firstFrameAnimation = useRef<number | null>(null);
  const diagnostics = useVideoPlaybackDiagnostics({
    sessionId,
    phaseId: phase.id,
    phaseEpoch,
    mediaId: phase.src,
    videoUrl: src,
    send,
  });
  const setVideoRef = useCallback((video: HTMLVideoElement | null) => {
    videoRef.current = video;
    diagnostics.ref.current = video;
    onVideoElement?.(video);
  }, [diagnostics.ref, onVideoElement]);
  const setExtraAudioRef = useCallback((audio: HTMLAudioElement | null) => {
    extraAudioRef.current = audio;
    onExtraAudioElement?.(audio);
  }, [onExtraAudioElement]);

  const completePhase = useCallback(() => {
    if (sessionId === null) return;
    send({
      t: "video_ended",
      v: PROTOCOL_VERSION,
      sessionId,
      phaseId: phase.id,
      phaseEpoch,
      mediaId: phase.src,
    });
  }, [phase.id, phase.src, phaseEpoch, send, sessionId]);
  useEffect(() => () => {
    if (tailTimer.current !== null) clearTimeout(tailTimer.current);
  }, [completePhase]);
  useEffect(() => {
    firstFrameReported.current = false;
    return () => {
      const callback = firstFrameCallback.current;
      if (callback !== null) {
        callback.video.cancelVideoFrameCallback(callback.id);
      }
      if (firstFrameAnimation.current !== null) {
        cancelAnimationFrame(firstFrameAnimation.current);
      }
      firstFrameCallback.current = null;
      firstFrameAnimation.current = null;
    };
  }, [phaseEpoch, src]);
  const timelineStart = phase.timeline === undefined ? null : phase.startedAt - phase.timeline.startMs;
  const synchronizeTimeline = useCallback(() => {
    const video = videoRef.current;
    if (timelineStart === null || clock === undefined || video === null || video.readyState < 1) return;
    const target = Math.max(0, (clock.now() - timelineStart) / 1000);
    // Rejoin, operator jumps and decoder stalls must not leave overlays ahead
    // of the picture. Ordinary cue boundaries do not seek or restart playback.
    if (target < video.duration && Math.abs(video.currentTime - target) > 0.5) video.currentTime = target;
  }, [clock, timelineStart]);
  useEffect(() => {
    if (timelineStart === null) return;
    synchronizeTimeline();
    const timer = setInterval(synchronizeTimeline, 500);
    return () => clearInterval(timer);
  }, [timelineStart, synchronizeTimeline]);
  const handleEnded = () => {
    extraAudioRef.current?.pause();
    const tailDurationMs = phase.tailDurationMs ?? 0;
    if (tailDurationMs === 0) {
      completePhase();
      return;
    }
    if (tailTimer.current !== null) clearTimeout(tailTimer.current);
    // An ended HTML video remains painted on its final decoded frame while
    // this timer reuses the same visual-tail timing as image + MP3 phases.
    tailTimer.current = setTimeout(() => {
      tailTimer.current = null;
      completePhase();
    }, tailDurationMs);
  };

  const handlePlaying = () => {
    diagnostics.onPlaying();
    const video = videoRef.current;
    if (video !== null && !firstFrameReported.current && onFirstFrame !== undefined) {
      firstFrameReported.current = true;
      if (typeof video.requestVideoFrameCallback === "function") {
        const id = video.requestVideoFrameCallback(() => {
          firstFrameCallback.current = null;
          onFirstFrame();
        });
        firstFrameCallback.current = { video, id };
      } else {
        // `playing` can precede the compositor's paint. Waiting one animation
        // frame keeps the readiness fallback from revealing a black element.
        firstFrameAnimation.current = requestAnimationFrame(() => {
          firstFrameAnimation.current = null;
          onFirstFrame();
        });
      }
    }
    const audio = extraAudioRef.current;
    if (video === null || audio === null) return;
    if (Math.abs(audio.currentTime - video.currentTime) > 0.25) audio.currentTime = video.currentTime;
    const play = audio.play();
    void play?.catch(() => undefined);
  };

  const handleStalled = () => {
    extraAudioRef.current?.pause();
    diagnostics.onStalled();
  };

  return <>
    <video
      ref={setVideoRef}
      src={src}
      style={{ objectFit: phase.fit ?? "cover" }}
      onLoadedMetadata={synchronizeTimeline}
      autoPlay
      muted={!soundEnabled}
      playsInline
      onEnded={handleEnded}
      onPlaying={handlePlaying}
      onStalled={handleStalled}
      onError={diagnostics.onError}
    />
    {extraAudioSrc !== undefined && <audio
      ref={setExtraAudioRef}
      src={extraAudioSrc}
      autoPlay
      muted={!soundEnabled}
      aria-label="Extra video audio track"
    />}
  </>;
}
