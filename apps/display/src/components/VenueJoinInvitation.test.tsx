// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import QRCode from "qrcode";
import type { QrGrantMessage } from "@smartphonecracy/protocol";
import { ServerClock } from "../lib/serverClock.js";
import { VenueJoinInvitation } from "./VenueJoinInvitation.js";

vi.mock("qrcode", () => ({ default: { toCanvas: vi.fn().mockResolvedValue(undefined) } }));
const clock = new ServerClock();
let root: Root;
const grant: QrGrantMessage = { t: "qr_grant", v: 2, url: "https://phone.example/phone/", expiresAt: 121_000, placement: "corner" };
const render = async (value: QrGrantMessage | null, enabled = true) => {
  await act(async () => root.render(<VenueJoinInvitation enabled={enabled} grant={value} qrHidden={value === null} clock={clock} />));
};
const invitation = () => document.querySelector(".venue-join-invitation")!;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000);
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  document.body.innerHTML = '<div id="root"></div>';
  root = createRoot(document.getElementById("root")!);
});
afterEach(async () => {
  await act(async () => root.unmount());
  document.body.replaceChildren();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("venue joining invitation", () => {
  it("fades in the generated QR and CTA, retaining the canvas for fade-out when hidden", async () => {
    await render(null);
    expect(invitation().getAttribute("aria-hidden")).toBe("true");
    await render(grant);
    expect(QRCode.toCanvas).toHaveBeenCalledWith(expect.any(HTMLCanvasElement), grant.url, expect.objectContaining({ margin: 4 }));
    expect(invitation().textContent).toBe("Mach mit");
    expect(invitation().classList.contains("venue-join-invitation-visible")).toBe(true);
    const canvas = invitation().querySelector("canvas");
    await render(null);
    expect(invitation().classList.contains("venue-join-invitation-visible")).toBe(false);
    expect(invitation().querySelector("canvas")).toBe(canvas);
    await render(grant);
    expect(invitation().classList.contains("venue-join-invitation-visible")).toBe(true);
  });

  it("hides expired codes and does not show a second invitation in the lobby", async () => {
    await render(grant);
    await act(async () => vi.advanceTimersByTime(120_000));
    expect(invitation().getAttribute("aria-hidden")).toBe("true");
    await render({ ...grant, expiresAt: 300_000 }, false);
    expect(invitation().getAttribute("aria-hidden")).toBe("true");
    await render({ ...grant, expiresAt: 300_000, placement: "large" });
    expect(invitation().getAttribute("aria-hidden")).toBe("true");
  });

  it("does not fade in until QR generation finishes", async () => {
    let finish!: () => void;
    vi.mocked(QRCode.toCanvas).mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
    await render(grant);
    expect(invitation().getAttribute("aria-hidden")).toBe("true");
    await act(async () => finish());
    expect(invitation().getAttribute("aria-hidden")).toBe("false");
  });
});
