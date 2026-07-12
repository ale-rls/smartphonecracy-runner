import { useEffect, useMemo, useReducer } from "react";
import { DisplayConnection } from "./lib/connection.js";
import { applyKioskGuards, performReload } from "./lib/kiosk.js";
import { displayReducer, initialDisplayState } from "./state/store.js";
import { Countdown } from "./components/Countdown.js";

/**
 * Display application shell (plan §9), three rendering layers:
 *  1. video layer — one active <video> element
 *  2. UI layer — prompts, axes, countdowns, diagnostics
 *  3. cursor canvas — filled in by STEP-015
 * Media caching/Blob playback arrives in STEP-014; QR + heartbeat in
 * STEP-016. This shell renders phases from server snapshots only.
 */

declare const __BUILD_VERSION__: string | undefined;

const config = {
  url: `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`,
  clientVersion:
    typeof __BUILD_VERSION__ === "string" ? __BUILD_VERSION__ : "0.0.0-dev",
  installationId:
    new URLSearchParams(location.search).get("installation") ?? "inst-1",
  roomId: new URLSearchParams(location.search).get("room") ?? "room-1",
  displayToken: new URLSearchParams(location.search).get("token") ?? "",
};

export function App() {
  const [state, dispatch] = useReducer(displayReducer, initialDisplayState);

  const connection = useMemo(
    () =>
      new DisplayConnection({
        ...config,
        onMessage: (message) => dispatch({ type: "server-message", message }),
        onStatusChange: (status) => dispatch({ type: "connection-status", status }),
      }),
    [],
  );

  useEffect(() => {
    connection.start();
    const disposeKiosk = applyKioskGuards();
    return () => {
      connection.stop();
      disposeKiosk();
    };
  }, [connection]);

  useEffect(() => {
    if (state.reloadRequired) void performReload();
  }, [state.reloadRequired]);

  const phase = state.phase;

  return (
    <main className="display-root">
      {/* Layer 1: video */}
      <section className="layer layer-video">
        {phase?.kind === "video" && (
          // Plain src for now; STEP-014 swaps in cached Blob URLs.
          <video key={phase.id} src={`/media/${phase.src}`} autoPlay />
        )}
      </section>

      {/* Layer 2: UI */}
      <section className="layer layer-ui">
        {state.connection !== "open" && (
          <div className="reconnecting">reconnecting…</div>
        )}
        {phase === null || phase.kind === "idle" ? (
          <div className="idle">
            <h1>smartphonecracy</h1>
            {/* Attract loop + large QR rendered by STEP-016 */}
          </div>
        ) : null}
        {phase?.kind === "position-question" && (
          <div className="question">
            <h2>{phase.text}</h2>
            <div className="axis axis-x">
              <span>{phase.xAxis.minLabel}</span>
              <span>{phase.xAxis.maxLabel}</span>
            </div>
            <div className="axis axis-y">
              <span>{phase.yAxis.minLabel}</span>
              <span>{phase.yAxis.maxLabel}</span>
            </div>
            {phase.deadlineAt !== null && (
              <Countdown clock={connection.clock} deadlineAt={phase.deadlineAt} />
            )}
          </div>
        )}
        {state.notice && (
          <div className={`notice notice-${state.notice.level}`}>
            {state.notice.message}
          </div>
        )}
      </section>

      {/* Layer 3: cursor canvas (STEP-015) */}
      <section className="layer layer-cursors">
        <canvas id="cursor-canvas" />
      </section>
    </main>
  );
}
