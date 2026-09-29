// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EndedPhoneSession } from "./lib/connection.js";
import { App } from "./App.js";

const callbacks = vi.hoisted(() => ({ ended: null as ((session: EndedPhoneSession) => void) | null }));
vi.mock("./lib/connection.js", () => ({
  PhoneConnection: class {
    constructor(options: { onSessionEnded: (session: EndedPhoneSession) => void }) {
      callbacks.ended = options.onSessionEnded;
    }
    start() {}
    stop() {}
  },
}));
vi.mock("./lib/lease.js", () => ({ loadLease: () => "lease" }));
let root: Root;
const navigate = vi.fn();
const save = vi.fn();

beforeEach(async () => {
  vi.useFakeTimers();
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("location", { assign: navigate });
  vi.stubGlobal("fetch", vi.fn((url: string, options?: RequestInit) => url === "/api/join-config"
    ? Promise.resolve({ ok: true, json: async () => ({ installationId: "installation", roomId: "room" }) })
    : save(url, options)));
  localStorage.setItem("participant-name", "Visitor");
  document.body.innerHTML = '<div id="root"></div>';
  root = createRoot(document.getElementById("root")!);
  await act(async () => root.render(<App />));
  await act(async () => callbacks.ended!({ sessionId: "show", clientId: "visitor", participantLease: "lease" }));
});

afterEach(async () => {
  await act(async () => root.unmount());
  localStorage.clear();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("end-of-show website redirect", () => {
  it.each([true, false])("waits for the saved choice (%s) and confirmation before redirecting", async (granted) => {
    let resolve!: (response: { ok: boolean }) => void;
    save.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    const button = [...document.querySelectorAll("button")].find((node) => node.textContent === (granted ? "JA" : "NEIN"))!;
    await act(async () => button.click());
    expect(JSON.parse(save.mock.calls[0]![1].body)).toMatchObject({ granted, sessionId: "show", participantLease: "lease" });
    await act(async () => vi.advanceTimersByTime(3_000));
    expect(navigate).not.toHaveBeenCalled();
    await act(async () => resolve({ ok: true }));
    expect(document.querySelector(".consent-result")?.textContent).toContain(granted ? "Danke" : "gelöscht");
    await act(async () => vi.advanceTimersByTime(1_999));
    expect(navigate).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTime(1));
    expect(navigate).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith("https://www.interrobang-performance.com/");
  });

  it("keeps a failed submission on the choice screen for retry", async () => {
    save.mockResolvedValueOnce({ ok: false, status: 503 });
    await act(async () => [...document.querySelectorAll("button")].find((node) => node.textContent === "JA")!.click());
    await act(async () => vi.advanceTimersByTime(2_000));
    expect(navigate).not.toHaveBeenCalled();
    expect(document.querySelector('[role="alert"]')?.textContent).toContain("503");
  });

  it("redirects after the existing no-answer timeout and deletion message", async () => {
    await act(async () => vi.advanceTimersByTime(60_000));
    expect(document.querySelector(".consent-actions")).not.toBeNull();
    expect(navigate).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTime(60_000));
    expect(document.querySelector(".consent-result")?.textContent).toContain("gelöscht");
    await act(async () => vi.advanceTimersByTime(2_000));
    expect(navigate).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith("https://www.interrobang-performance.com/");
    expect(save).not.toHaveBeenCalled();
  });
});
