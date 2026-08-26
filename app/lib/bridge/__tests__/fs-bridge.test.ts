/**
 * The shared filesystem guard, proven over an in-memory store — every
 * rule the REST road learned from real incidents, inherited here once.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { buildFsBridge, type FileStore } from "../fs-bridge";

function memStore() {
  const files = new Map<string, { text: string; mtime: number }>();
  let clock = 1000;
  const store: FileStore = {
    async list() {
      return [...files.keys()];
    },
    async read(name) {
      return files.get(name) ?? null;
    },
    async write(name, text) {
      files.set(name, { text, mtime: (clock += 7) });
    },
  };
  return { store, files, touch: (n: string, t: string) => files.set(n, { text: t, mtime: (clock += 7) }) };
}

describe("the filesystem guard", () => {
  let mem: ReturnType<typeof memStore>;
  beforeEach(() => {
    mem = memStore();
  });

  it("writes a genuinely new file", async () => {
    const b = buildFsBridge(mem.store);
    const r = await b.writeGuarded("a.md", "第一夜。\n", null, null);
    expect(r.ok).toBe(true);
    expect(mem.files.get("a.md")?.text).toBe("第一夜。\n");
  });

  it("never replaces a moved file: conflict, not overwrite", async () => {
    mem.touch("a.md", "原本的字。\n");
    const loaded = await mem.store.read("a.md");
    mem.touch("a.md", "Obsidian 改過的字。\n"); // third party moved it
    const b = buildFsBridge(mem.store);
    const r = await b.writeGuarded("a.md", "我這邊的字。\n", loaded!.mtime, loaded!.text);
    expect(r.ok).toBe(false);
    if (!r.ok && r.reason === "conflict") {
      expect(r.remote.content).toContain("Obsidian 改過的字。");
    }
    expect(mem.files.get("a.md")?.text).toContain("Obsidian 改過的字。");
  });

  it("a believed-new page never clobbers an existing one", async () => {
    mem.touch("a.md", "已經有字了。\n");
    const b = buildFsBridge(mem.store);
    const r = await b.writeGuarded("a.md", "毫不知情的新頁。\n", null, null);
    expect(r.ok).toBe(false);
    expect(mem.files.get("a.md")?.text).toContain("已經有字了。");
  });

  it("an ordinary continuation saves and verifies", async () => {
    mem.touch("a.md", "第一段。\n");
    const loaded = await mem.store.read("a.md");
    const b = buildFsBridge(mem.store);
    const r = await b.writeGuarded("a.md", "第一段。\n第二段。\n", loaded!.mtime, loaded!.text);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.verified).toBe(true);
  });

  it("readDoc signals absence the way the whole app expects", async () => {
    const b = buildFsBridge(mem.store);
    await expect(b.readDoc("ghost.md")).rejects.toThrow("HTTP 404");
  });
});
