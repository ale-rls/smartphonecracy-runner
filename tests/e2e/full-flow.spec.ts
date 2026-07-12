import { expect, test } from "@playwright/test";
import { adminStatus, startServer, type E2eServer } from "./helpers/server.js";
import { displayUrl, dragTrackpad, phoneUrl } from "./helpers/clients.js";

/**
 * §16: display readiness gate, QR admission (signed grant), solo lobby
 * start, video fallback, both question kinds resolving, return to idle.
 * Runs against the real server process and the real built bundles.
 */
test.describe("full scenario flow", () => {
  let server: E2eServer;

  test.beforeEach(async () => {
    server = await startServer();
  });

  test.afterEach(async () => {
    await server.stop();
  });

  test("display boots ready and idles; phone joins; scenario runs to idle", async ({ browser }) => {
    const display = await browser.newPage();
    await display.goto(displayUrl(server.baseUrl));

    // Display must not sit in a media-retry state with intact media, and
    // must render the idle attract layer once ready.
    await expect(display.locator(".idle")).toBeVisible();
    await expect(display.locator(".media-status")).toBeHidden({ timeout: 20_000 });
    await expect.poll(async () => (await adminStatus(server.baseUrl)).displayConnected).toBe(true);

    // Large QR is shown while idle (plan §9).
    await expect(display.locator("canvas, img, svg").first()).toBeVisible();

    // Phone joins with a current signed grant → solo participant starts lobby.
    const phone = await browser.newPage();
    await phone.goto(phoneUrl(server.baseUrl));
    await expect(phone.locator(".trackpad")).toBeVisible();
    await expect.poll(async () => (await adminStatus(server.baseUrl)).lifecycle).toBe("lobby");

    // Lobby countdown (10 s default policy) → active, entry video phase.
    await expect
      .poll(async () => (await adminStatus(server.baseUrl)).lifecycle, { timeout: 20_000 })
      .toBe("active");
    expect((await adminStatus(server.baseUrl)).phaseId).toBe("intro-video");

    // Video advances via display video_ended or the server's
    // expectedDurationMs+5 s fallback (§16: a missing video_ended cannot
    // block the experience) — either path must land on question-fixed.
    await expect
      .poll(async () => (await adminStatus(server.baseUrl)).phaseId, { timeout: 20_000 })
      .toBe("question-fixed");
    await expect(display.locator(".question h2")).toHaveText(/public transit funding/);

    // Trackpad input while the question is live; live counts are enabled
    // in the scenario, so the overlay eventually shows a count.
    await dragTrackpad(phone);
    await expect(display.locator(".quadrant-count").first()).toBeVisible({ timeout: 10_000 });

    // Fixed resolution → quadrant question → quadrant-plurality → idle.
    await expect
      .poll(async () => (await adminStatus(server.baseUrl)).phaseId, { timeout: 20_000 })
      .toBe("question-quadrant");
    await expect(display.locator(".question h2")).toHaveText(/housing policy/);
    await dragTrackpad(phone);

    await expect
      .poll(async () => (await adminStatus(server.baseUrl)).lifecycle, { timeout: 30_000 })
      .toBe("idle");
    await expect(display.locator(".idle")).toBeVisible();

    await phone.close();
    await display.close();
  });

  test("expired grant is rejected with a visible state", async ({ browser }) => {
    const phone = await browser.newPage();
    // ttl -1 ms: already expired when the server verifies it.
    await phone.goto(phoneUrl(server.baseUrl, -1));
    await expect(phone.locator(".rejected")).toBeVisible();
    await expect(phone.locator(".rejected")).toContainText(/expired/i);
    await phone.close();
  });
});
