import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { scanLocalMedia } from "./local-media.js";

describe("local media manifest scanner", () => {
  it("recursively inventories local media with stable paths, sizes, hashes, and ordering", async () => {
    const directory = await mkdtemp(join(tmpdir(), "studio-media-"));
    await mkdir(join(directory, "nested"));
    await writeFile(join(directory, "z.mp4"), "z");
    await writeFile(join(directory, "nested", "a.mp4"), "abc");
    await writeFile(join(directory, ".DS_Store"), "ignored");

    await expect(scanLocalMedia(directory)).resolves.toEqual({ files: [
      {
        src: "nested/a.mp4",
        bytes: 3,
        hash: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
      },
      {
        src: "z.mp4",
        bytes: 1,
        hash: "594e519ae499312b29433b7dd8a97ff068defcba9755b6d5d00e84c524d67b06",
      },
    ] });
  });
});
