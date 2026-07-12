import type {
  PhaseSnapshotMessage,
  QrGrantMessage,
  ReloadMessage,
  ServerToClientMessage,
} from "@smartphonecracy/protocol";
import type { ConnectionStatus } from "../lib/connection.js";

/**
 * Display state as a pure reducer over server messages (plan §9:
 * "Receive a phase snapshot and render from server timestamps").
 * Keeping this pure makes phase/reconnect behavior unit-testable
 * without a browser or socket.
 */

export type DisplayState = {
  connection: ConnectionStatus;
  sessionId: string | null;
  phaseEpoch: number;
  phase: PhaseSnapshotMessage | null;
  presenceCount: number;
  qrGrant: QrGrantMessage | null;
  qrHidden: boolean;
  notice: { code: string; level: string; message: string } | null;
  reloadRequired: ReloadMessage | null;
};

export const initialDisplayState: DisplayState = {
  connection: "closed",
  sessionId: null,
  phaseEpoch: -1,
  phase: null,
  presenceCount: 0,
  qrGrant: null,
  qrHidden: false,
  notice: null,
  reloadRequired: null,
};

export type DisplayAction =
  | { type: "server-message"; message: ServerToClientMessage }
  | { type: "connection-status"; status: ConnectionStatus };

export function displayReducer(
  state: DisplayState,
  action: DisplayAction,
): DisplayState {
  if (action.type === "connection-status") {
    // On any disconnect the last QR grant is untrustworthy; the server
    // resends one after display_join.
    if (action.status === "reconnecting") {
      return { ...state, connection: action.status, qrGrant: null };
    }
    return { ...state, connection: action.status };
  }

  const m = action.message;
  switch (m.t) {
    case "snapshot":
    case "phase": {
      // Stale-epoch guard: a delayed frame from a previous phase must not
      // regress the display (plan §16). Epochs reset with new sessions.
      if (m.sessionId === state.sessionId && m.phaseEpoch < state.phaseEpoch) {
        return state;
      }
      return {
        ...state,
        sessionId: m.sessionId,
        phaseEpoch: m.phaseEpoch,
        phase: m.phase,
        notice: null,
      };
    }
    case "presence":
      return { ...state, presenceCount: m.count };
    case "qr_grant":
      return { ...state, qrGrant: m, qrHidden: false };
    case "qr_hidden":
      return { ...state, qrGrant: null, qrHidden: true };
    case "display_notice":
      return { ...state, notice: { code: m.code, level: m.level, message: m.message } };
    case "reload":
      return { ...state, reloadRequired: m };
    // Cursor batches and question status/resolution are consumed by the
    // canvas/question layers (STEP-015), not the app-level store.
    case "cursors":
    case "question_status":
    case "question_resolved":
    case "identity":
    case "join_rejected":
    case "status":
    case "pong":
      return state;
  }
}
