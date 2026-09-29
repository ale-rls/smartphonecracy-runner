import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { scenarioSchema } from "@smartphonecracy/scenario";

describe("venue final vote", () => {
  it("uses the exact candidate names and routes each to the matching winner", () => {
    const scenario = scenarioSchema.parse(JSON.parse(readFileSync(new URL("../../../content/scenarios/venue.json", import.meta.url), "utf8")));
    const vote = scenario.phases.find((phase) => phase.kind === "video-position-question" && phase.field.type === "polygon-zones");
    if (vote?.kind !== "video-position-question" || vote.field.type !== "polygon-zones" || vote.next.type !== "quadrant-plurality") {
      throw new Error("Venue final vote is missing");
    }
    const targets = new Map(Object.entries(vote.next.map));
    expect(Object.fromEntries(vote.field.zones.map((zone) => [zone.label, targets.get(zone.id)])))
      .toEqual({ OpenApollo: "apollo-wins", Dionysos69: "dionysos-wins", Kassandra: "kassandra-wins" });
  });
});

it("uses the approved installation credits and gives the ending ten extra seconds", () => {
  const scenario = scenarioSchema.parse(JSON.parse(readFileSync(new URL("../../../content/scenarios/venue.json", import.meta.url), "utf8")));
  expect(scenario.phases.find((phase) => phase.id === "credits")).toMatchObject({
    src: "smartphonocracy-credits.mp4", expectedDurationMs: 73_000, fadeOutMs: 3_000, next: "idle",
  });
  const asset = readFileSync(new URL("../../display/src/assets/smartphonocracy-credits-installation.mp4", import.meta.url));
  const manifest = JSON.parse(readFileSync(new URL("../../../content/media-manifests/venue.json", import.meta.url), "utf8"));
  expect(manifest.files.find((file: { src: string }) => file.src === "smartphonocracy-credits.mp4")).toEqual({
    src: "smartphonocracy-credits.mp4", bytes: asset.length, hash: createHash("sha256").update(asset).digest("hex"),
  });
});
