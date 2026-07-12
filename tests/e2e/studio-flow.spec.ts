import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { REPO_ROOT } from "./helpers/server.js";
import { startStudio, type StudioServer } from "./helpers/studio.js";

const fixture = (path: string) => readFile(`${REPO_ROOT}/${path}`);

test.describe("Show Studio v1", () => {
  let studio: StudioServer;
  test.beforeEach(async () => { studio = await startStudio(); });
  test.afterEach(async () => { if (studio) await studio.stop(); });

  test("imports, edits, validates, previews, and exports a gated package", async ({ page }) => {
    await page.goto(studio.baseUrl);
    await page.getByLabel("Import show or backup").setInputFiles([
      { name: "scenario.json", mimeType: "application/json", buffer: await fixture("content/scenarios/dev.json") },
      { name: "media-manifest.json", mimeType: "application/json", buffer: await fixture("content/media-manifest.json") },
    ]);
    await expect(page.getByLabel("Show name")).toHaveValue("Imported show");
    await page.getByLabel("Show name").fill("Curator regression");
    for (const checkbox of await page.getByLabel("Acknowledge").all()) await checkbox.check();
    await expect(page.getByRole("button", { name: "Export for deployment" })).toBeEnabled();

    await page.getByRole("button", { name: "Preview" }).click();
    await expect(page.getByLabel("Show preview")).toBeVisible();
    await page.getByRole("button", { name: "Next phase" }).click();
    await page.getByRole("button", { name: "Resolve fixed" }).click();
    await expect(page.getByText(/Winner:/)).toBeVisible();
    await page.getByRole("button", { name: "Close preview" }).click();

    const downloads: string[] = [];
    page.on("download", (download) => downloads.push(download.suggestedFilename()));
    await page.getByRole("button", { name: "Export for deployment" }).click();
    await expect.poll(() => downloads.length).toBe(5);
    expect(downloads.some((name) => name.includes("validation-report.json"))).toBe(true);
    expect(downloads.some((name) => name.endsWith("README.txt"))).toBe(true);
    expect(new Set(downloads.map((name) => name.match(/^(.*)-(?:scenario|media-manifest|\.studio|validation-report|README)/)?.[1])).size).toBe(1);
  });

  test("supports keyboard entry and renders a large graph within the interaction budget", async ({ page }) => {
    await page.goto(studio.baseUrl);
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "New show" })).toBeFocused();

    const phases = Array.from({ length: 150 }, (_, index) => ({
      id: `video-${index}`, kind: "video", src: "media/intro.mp4", expectedDurationMs: 1000,
      next: index === 149 ? "idle" : `video-${index + 1}`,
    }));
    const scenario = { version: "large-1", entryPhaseId: "video-0", cyclesAllowed: false, phases: [...phases, { id: "idle", kind: "idle" }] };
    const started = Date.now();
    await page.getByLabel("Import show or backup").setInputFiles([
      { name: "scenario.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(scenario)) },
      { name: "media-manifest.json", mimeType: "application/json", buffer: await fixture("content/media-manifest.json") },
    ]);
    await expect(page.getByLabel("Show name")).toBeVisible({ timeout: 10_000 });
    expect(Date.now() - started).toBeLessThan(10_000);
    await expect(page.locator(".react-flow__node")).toHaveCount(153);
  });
});
