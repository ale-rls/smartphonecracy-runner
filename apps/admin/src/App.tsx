import { useCallback, useEffect, useState } from "react";

type Status = {
  healthy: boolean; ready: boolean; uptimeMs: number; displayConnected: boolean;
  displayHeartbeatAgeMs: number | null; connectedParticipants: number;
  sessionId: string | null; lifecycle: string | null; phaseId: string | null; phaseEpoch: number | null;
};

async function api(path: string, token: string, init?: RequestInit) {
  const response = await fetch(`/api/admin/${path}`, {
    ...init,
    headers: { ...init?.headers, Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(response.status === 401 ? "Invalid admin token" : `Request failed (${response.status})`);
  return response;
}

export function App() {
  const [token, setToken] = useState(() => sessionStorage.getItem("admin-token") ?? "");
  const [status, setStatus] = useState<Status | null>(null);
  const [errors, setErrors] = useState<unknown[]>([]);
  const [message, setMessage] = useState("");
  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      sessionStorage.setItem("admin-token", token);
      setStatus(await (await api("status", token)).json() as Status);
      setErrors((await (await api("errors", token)).json() as { errors: unknown[] }).errors);
      setMessage("");
    } catch (error) { setMessage((error as Error).message); }
  }, [token]);
  useEffect(() => { void refresh(); const timer = setInterval(() => void refresh(), 2_000); return () => clearInterval(timer); }, [refresh]);
  const control = async (action: string) => {
    try { await api(action, token, { method: "POST" }); await refresh(); }
    catch (error) { setMessage((error as Error).message); }
  };
  const download = async (format: "json" | "csv") => {
    if (!status?.sessionId || status.sessionId === "idle") return;
    try {
      const response = await api(`sessions/${encodeURIComponent(status.sessionId)}/export?format=${format}`, token);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob); const link = document.createElement("a");
      link.href = url; link.download = `${status.sessionId}.${format}`; link.click(); URL.revokeObjectURL(url);
    } catch (error) { setMessage((error as Error).message); }
  };
  return <main>
    <h1>Smartphonecracy operations</h1>
    <label>Admin token <input type="password" value={token} onChange={(event) => setToken(event.target.value)} /></label>
    <button onClick={() => void refresh()}>Connect</button>
    {message && <p role="alert">{message}</p>}
    {status && <>
      <section aria-label="status">
        <h2>Status</h2>
        <dl>
          <dt>Server</dt><dd>{status.healthy && status.ready ? "ready" : "not ready"}</dd>
          <dt>Display</dt><dd>{status.displayConnected ? `connected · heartbeat ${status.displayHeartbeatAgeMs ?? 0} ms ago` : "disconnected"}</dd>
          <dt>Participants</dt><dd>{status.connectedParticipants}</dd>
          <dt>Session</dt><dd>{status.sessionId ?? "—"}</dd>
          <dt>Phase</dt><dd>{status.phaseId ?? "—"} · epoch {status.phaseEpoch ?? "—"}</dd>
        </dl>
      </section>
      <section aria-label="controls"><h2>Controls</h2>{["start", "idle", "skip", "restart"].map((action) => <button key={action} onClick={() => void control(action)}>{action}</button>)}</section>
      <section aria-label="exports"><h2>Session export</h2><button onClick={() => void download("csv")}>CSV</button><button onClick={() => void download("json")}>JSON</button></section>
      <section aria-label="errors"><h2>Recent errors</h2><pre>{errors.length ? JSON.stringify(errors, null, 2) : "No recent errors"}</pre></section>
    </>}
  </main>;
}
