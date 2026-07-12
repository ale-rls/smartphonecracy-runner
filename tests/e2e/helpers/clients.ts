import type { Page } from "@playwright/test";
import { issueJoinGrant } from "../../../apps/server/src/admission/tokens.js";
import {
  DISPLAY_TOKEN,
  INSTALLATION_ID,
  JOIN_GRANT_SECRET,
  ROOM_ID,
} from "./server.js";

export function displayUrl(baseUrl: string): string {
  const url = new URL(`${baseUrl}/display/`);
  url.searchParams.set("installation", INSTALLATION_ID);
  url.searchParams.set("room", ROOM_ID);
  url.searchParams.set("token", DISPLAY_TOKEN);
  return url.toString();
}

/** Mint a signed grant exactly like the server's QR loop would. */
export function phoneUrl(baseUrl: string, ttlMs = 120_000): string {
  const grant = issueJoinGrant({
    secret: JOIN_GRANT_SECRET,
    installationId: INSTALLATION_ID,
    roomId: ROOM_ID,
    ttlMs,
  });
  const url = new URL(`${baseUrl}/phone/`);
  url.searchParams.set("g", grant.token);
  url.searchParams.set("installation", INSTALLATION_ID);
  url.searchParams.set("room", ROOM_ID);
  return url.toString();
}

/** Drag on the phone trackpad — relative input, so any drag moves the cursor. */
export async function dragTrackpad(page: Page): Promise<void> {
  const trackpad = page.locator(".trackpad");
  const box = await trackpad.boundingBox();
  if (!box) throw new Error("trackpad not visible");
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  for (let step = 1; step <= 8; step += 1) {
    await page.mouse.move(startX + step * 12, startY - step * 8);
  }
  await page.mouse.up();
}
