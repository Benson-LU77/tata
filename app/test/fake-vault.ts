/**
 * FakeObsidianClient — an in-memory vault with injectable faults, matching
 * the exact surface NotesPanel uses (health / list / readDoc / writeGuarded)
 * plus the guard semantics of the real writeGuarded, re-implemented here so
 * the characterization tests exercise the panel, not the network layer.
 *
 * Faults are configured per test:
 *   vault.failReads = true        → readDoc throws (a flaky link, NOT a 404)
 *   vault.offline = true          → every call throws
 *   vault.hideMtime = true        → readDoc reports mtime: null (old plugin)
 *   vault.set(name, text)         → third-party edit (bumps mtime)
 */

export type WriteResult =
  | { ok: true; mtime: number | null }
  | { ok: false; reason: "conflict"; remote: { content: string; mtime: number | null } }
  | { ok: false; reason: "offline" };

type Entry = { content: string; mtime: number };

export class FakeObsidianClient {
  files = new Map<string, Entry>();
  offline = false;
  failReads = false;
  hideMtime = false;
  /** ms each write hangs before landing — for in-flight race scenarios */
  delayWrites = 0;
  /** ms each read hangs — for open-race scenarios */
  delayReads = 0;
  writes: Array<{ name: string; content: string }> = [];
  private clock = 1000;

  /** third-party edit: what Obsidian-side typing looks like to the app */
  set(name: string, content: string) {
    this.files.set(name, { content, mtime: (this.clock += 7) });
  }

  contentOf(name: string) {
    return this.files.get(name)?.content;
  }

  async health() {
    if (this.offline) throw new Error("offline");
    return { ok: true, authenticated: true };
  }

  async list() {
    if (this.offline) throw new Error("offline");
    return [...this.files.keys()];
  }

  async readDoc(name: string): Promise<{ content: string; mtime: number | null }> {
    if (this.delayReads > 0) {
      await new Promise((r) => setTimeout(r, this.delayReads));
    }
    if (this.offline) throw new Error("offline");
    if (this.failReads) throw new Error("HTTP 500");
    const entry = this.files.get(name);
    if (!entry) throw new Error("HTTP 404");
    return { content: entry.content, mtime: this.hideMtime ? null : entry.mtime };
  }

  async writeGuarded(
    name: string,
    content: string,
    baseMtime: number | null,
    baseContent?: string | null,
  ): Promise<WriteResult> {
    if (this.delayWrites > 0) {
      await new Promise((r) => setTimeout(r, this.delayWrites));
    }
    if (this.offline) return { ok: false, reason: "offline" };
    const entry = this.files.get(name) ?? null;
    const remote = entry
      ? { content: entry.content, mtime: this.hideMtime ? null : entry.mtime }
      : null;
    if (remote && remote.content !== content) {
      // mirror of the real guard's rule ORDER (obsidian.ts writeGuarded):
      // content check first when unstamped, believed-new rule second
      if (remote.mtime === null) {
        if (baseContent == null || remote.content !== baseContent) {
          return { ok: false, reason: "conflict", remote };
        }
      } else if (baseMtime === null) {
        if (remote.content.trim() !== "") {
          return { ok: false, reason: "conflict", remote };
        }
      } else if (remote.mtime !== baseMtime) {
        return { ok: false, reason: "conflict", remote };
      }
    }
    this.writes.push({ name, content });
    this.files.set(name, { content, mtime: (this.clock += 7) });
    return { ok: true, mtime: this.hideMtime ? null : this.files.get(name)!.mtime };
  }
}

/** the singleton the mocked module hands to NotesPanel */
export const vault = new FakeObsidianClient();

export function resetVault() {
  vault.files.clear();
  vault.writes.length = 0;
  vault.offline = false;
  vault.failReads = false;
  vault.hideMtime = false;
  vault.delayWrites = 0;
  vault.delayReads = 0;
}
