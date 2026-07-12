import { describe, expect, it } from "vitest";
import { App } from "./App.js";

describe("admin UI smoke", () => {
  it("exports the operations application", () => {
    expect(typeof App).toBe("function");
  });
});
