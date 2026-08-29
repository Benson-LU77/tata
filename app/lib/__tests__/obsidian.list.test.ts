/**
 * A vault we cannot see is not an empty vault.
 *
 * list() is the whole connection test: the panel calls itself connected
 * when list does not throw. So answering [] for a folder that is not
 * there empties the city, keeps the badge lit, and makes every page look
 * absent — and an absent page is one the guard will write straight over.
 * A renamed folder must not cost anybody their words.
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { ObsidianClient } from "../obsidian";

const config = { url: "http://127.0.0.1:27123", key: "k", folder: "" };

/** answers each vault path from a table; anything unlisted is a 404 */
function serve(tree: Record<string, string[]>) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const at = url.slice(url.indexOf("/vault/") + "/vault/".length).replace(/\/$/, "");
    const files = tree[decodeURIComponent(at)];
    if (!files) return { status: 404, ok: false } as Response;
    return {
      status: 200,
      ok: true,
      json: async () => ({ files }),
    } as unknown as Response;
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("obsidian list", () => {
  it("throws when the configured folder is not there", async () => {
    vi.stubGlobal("fetch", serve({})); // nothing at the root
    await expect(new ObsidianClient(config).list()).rejects.toThrow();
  });

  it("throws for a configured subfolder that was renamed away", async () => {
    vi.stubGlobal("fetch", serve({ "": ["Journal/"] }));
    const client = new ObsidianClient({ ...config, folder: "Diary" });
    await expect(client.list()).rejects.toThrow();
  });

  it("still reports an empty folder as empty", async () => {
    vi.stubGlobal("fetch", serve({ "": [] }));
    await expect(new ObsidianClient(config).list()).resolves.toEqual([]);
  });

  it("keeps walking when a subfolder disappears mid-walk", async () => {
    // the root lists a folder that 404s when opened — that one is empty,
    // but the pages beside it must still come back
    vi.stubGlobal("fetch", serve({ "": ["a.md", "Gone/"] }));
    await expect(new ObsidianClient(config).list()).resolves.toEqual(["a.md"]);
  });

  it("gathers pages from nested folders", async () => {
    vi.stubGlobal(
      "fetch",
      serve({ "": ["b.md", "Journal/"], Journal: ["2026/"], "Journal/2026": ["c.md"] }),
    );
    const names = await new ObsidianClient(config).list();
    expect(names).toContain("b.md");
    expect(names).toContain("Journal/2026/c.md");
  });
});
