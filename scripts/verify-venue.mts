/** Local delivery smoke test. Build display/phone/admin first; requires Chromium. */
import assert from "node:assert/strict";
import { chromium, type Browser } from "@playwright/test";
import { buildServer } from "../apps/server/src/server.js";
import { buildVenuePlayer } from "../apps/server/src/venue-player.js";
import { loadConfig } from "../apps/server/src/config.js";

const config = loadConfig({
  NODE_ENV: "test", RUN_MODE: "venue", VENUE_MEDIA_LOCATION: "display", BUILD_VERSION: "0.0.0-dev",
  SCENARIO_PATH: "content/scenarios/venue.json",
  MEDIA_MANIFEST_PATH: "content/media-manifests/venue.json",
  MEDIA_DIR: "/nonexistent-hosted-server-media",
  PHONE_JOIN_BASE_URL: "http://localhost:3000/phone/",
});
const runtime = await buildServer({ config, verifyOperatorToken: async (token) => token === "venue-smoke-test" });
let browser: Browser | undefined;
let player: Awaited<ReturnType<typeof buildVenuePlayer>> | undefined;
try {
  assert.equal(runtime.readiness.ready, true, JSON.stringify(runtime.readiness));
  await runtime.app.listen({ host: "127.0.0.1", port: 0 });
  const address = runtime.app.server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  assert.equal((await runtime.app.inject({ url: "/media/anything.mp4" })).statusCode, 404);
  player = await buildVenuePlayer({ serverUrl: base,
    mediaDir: process.env.MEDIA_DIR ?? "/Volumes/SANDISK SSD/Smartphonocracy/Masters/runner-fullHD" });
  await player.listen({ host: "127.0.0.1", port: 0 });
  const playerAddress = player.server.address();
  assert.ok(playerAddress && typeof playerAddress !== "string");
  const playerBase = `http://127.0.0.1:${playerAddress.port}`;
  console.log("PASS: hosted coordinator is ready without video files; separate local player started");
  browser = await chromium.launch({ headless: true });
  const display = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const errors: string[] = [];
  display.on("pageerror", (error) => { errors.push(error.message); console.error("DISPLAY ERROR", error.message); });
  display.on("console", (message) => { if (message.type() === "error") console.error("DISPLAY CONSOLE", message.text()); });
  await display.goto(`${playerBase}/display/?installation=dev-installation&room=main&token=dev-display-token`);
  await display.waitForFunction(() => {
    const video = document.querySelector<HTMLVideoElement>('video[aria-label="Venue lobby film"]');
    return video && video.currentTime > 0.1;
  }, undefined, { timeout: 120000 });
  await display.getByRole("button", { name: "Enable sound" }).click();
  assert.equal(await display.locator(".qr-badge").count(), 0);
  await display.waitForFunction(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('canvas[aria-label="Tracked venue join code"]');
    return canvas && canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data.some((value) => value !== 0);
  });
  await display.screenshot({ path: "/private/tmp/venue-tracked-qr.png" });
  console.log("PASS: SSD lobby streams with tracked QR");
  const join = async (name: string) => {
    const page = await browser!.newPage();
    await page.goto(`${base}/phone/`);
    await page.locator("#participant-name").fill(name);
    await page.getByRole("button", { name: "Join", exact: true }).click();
    await page.locator(".trackpad").waitFor();
    await page.locator(".connection-dot.online").waitFor();
    return page;
  };
  await join("Venue test one");
  assert.equal(runtime.engine!.lifecycleState, "lobby");
  const remaining = runtime.engine!.getSnapshot().deadlineAt! - Date.now();
  assert.ok(remaining > 35_000 && remaining <= 45_000);
  const lobbyDeadline = runtime.engine!.getSnapshot().deadlineAt;
  await join("Venue test two");
  assert.equal(runtime.engine!.lifecycleState, "lobby");
  assert.equal(runtime.engine!.getSnapshot().deadlineAt, lobbyDeadline);
  await display.waitForFunction(() => {
    const video = document.querySelector<HTMLVideoElement>(".phase-video-slot-active video");
    return video && video.currentTime > 0.1;
  }, undefined, { timeout: 50_000 });
  assert.equal(runtime.engine!.currentPhaseId, "2-0-Athene");
  console.log("PASS: full lobby countdown despite second visitor, main-film playback");

  runtime.engine!.adminJump("title-apollo");
  await display.waitForFunction(() => {
    const video = document.querySelector<HTMLVideoElement>(".phase-video-slot-active video");
    return video && video.currentTime > 854 && video.currentTime < 865;
  });
  const reference = await display.locator(".phase-video-slot-active video").elementHandle();
  await display.waitForFunction(() => {
    const video = document.querySelector<HTMLVideoElement>(".phase-video-slot-active video");
    return video && video.currentTime >= 870;
  }, undefined, { timeout: 25_000 });
  assert.equal(runtime.engine!.currentPhaseId, "3-1-openapollo-rede");
  assert.equal(await reference!.evaluate((video) => video === document.querySelector(".phase-video-slot-active video")), true);
  console.log("PASS: natural title-to-speech transition preserves the decoder");

  runtime.engine!.adminJump("2-6-01-wo-befindest-du-dich");
  await display.waitForFunction(() => {
    const video = document.querySelector<HTMLVideoElement>(".phase-video-slot-active video");
    return video && video.currentTime > 530 && video.currentTime < 560;
  });
  assert.equal(await display.locator(".question-text").count(), 0);
  assert.equal(await display.locator('audio[aria-label="Extra video audio track"]').count(), 0);
  await display.screenshot({ path: "/private/tmp/smartphonocracy-venue-question.png" });
  await join("Late venue visitor");
  assert.equal(runtime.engine!.connectedParticipantCount, 3);
  assert.equal(await display.locator(".qr-badge").count(), 0);
  console.log("PASS: printed-code late joining, no on-screen QR or duplicate question text/voice");

  for (const [id, filename] of [
    ["apollo-wins", "4.1_OpenApollo"], ["dionysos-wins", "4.2_Dionysos69"],
    ["kassandra-wins", "4.3_Kassandra"], ["credits", "smartphonocracy-credits"],
  ]) {
    runtime.engine!.adminJump(id!);
    await display.waitForFunction((needle) => {
      const video = document.querySelector<HTMLVideoElement>(".phase-video-slot-active video");
      return video && video.src.includes(needle!) && video.currentTime > 0.1;
    }, filename);
    console.log(`PASS: ${id} decodes from SSD`);
  }
  await display.waitForFunction(() => {
    const video = document.querySelector<HTMLVideoElement>(".phase-video-slot-active video");
    return video && video.volume > 0 && video.volume < 0.9;
  }, undefined, { timeout: 75000 });
  assert.equal(runtime.engine!.currentPhaseId, "credits");
  await display.waitForFunction(() => !!document.querySelector(".venue-return-from-black"), undefined, { timeout: 5000 });
  assert.equal(runtime.engine!.currentPhaseId, "idle");
  console.log("PASS: credits audio fades after 70 seconds and session returns to lobby at 73 seconds");
  const admin = await browser.newPage();
  await admin.addInitScript(() => localStorage.setItem("admin-token", "venue-smoke-test"));
  await admin.goto(`${base}/admin/`);
  await admin.getByRole("heading", { name: "Automatic venue show" }).waitFor();
  assert.equal(await admin.getByRole("heading", { name: "Lobby schedule" }).count(), 0);
  assert.equal(await admin.getByRole("button", { name: "Restart show", exact: true }).count(), 1);
  console.log("PASS: existing admin controls adapt to venue mode");
  runtime.engine!.adminIdle();
  await display.waitForFunction(() => {
    const video = document.querySelector<HTMLVideoElement>('video[aria-label="Venue lobby film"]');
    return video && !video.paused && getComputedStyle(video).visibility === "visible";
  });
  assert.deepEqual(errors, []);
  console.log("PASS: return to lobby, no browser page errors");
} catch (error) {
  for (const context of browser?.contexts() ?? []) for (const page of context.pages()) console.error("PAGE", await page.locator("body").innerText().catch(() => "unavailable"));
  throw error;
} finally {
  await browser?.close();
  await player?.close();
  await runtime.app.close();
}
