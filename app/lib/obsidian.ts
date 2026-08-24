export type ObsidianConfig = {
  url: string;
  key: string;
  folder: string;
};

export type NoteDoc = {
  content: string;
  mtime: number | null;
  tags: string[];
};

export type WriteResult =
  | { ok: true; mtime: number | null }
  | { ok: false; reason: "conflict"; remote: NoteDoc }
  | { ok: false; reason: "offline" };

export const DEFAULT_OBSIDIAN_URL = "http://127.0.0.1:27123";

const STORAGE_KEY = "yeyufm.obsidian";

export function loadConfig(): ObsidianConfig | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ObsidianConfig>;
    if (!parsed.url || !parsed.key) return null;
    return { url: parsed.url, key: parsed.key, folder: parsed.folder ?? "" };
  } catch {
    return null;
  }
}

export function saveConfig(config: ObsidianConfig) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {}
}

function encodePath(path: string) {
  return path
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");
}

export class ObsidianClient {
  constructor(private config: ObsidianConfig) {}

  private base() {
    return this.config.url.replace(/\/+$/, "");
  }

  private folder() {
    return this.config.folder.replace(/^\/+|\/+$/g, "");
  }

  private headers(extra: Record<string, string> = {}) {
    const key = this.config.key.replace(/^Bearer\s+/i, "").trim();
    return { Authorization: `Bearer ${key}`, ...extra };
  }

  private notePath(name: string) {
    const folder = this.folder();
    return encodePath(folder ? `${folder}/${name}` : name);
  }

  async list(): Promise<string[]> {
    // folders recurse (depth 3) — a vault organised as Journal/2026/…
    // must not read as an empty city
    const folder = this.folder();
    const walk = async (prefix: string, depth: number): Promise<string[]> => {
      const path = prefix ? `/vault/${encodePath(prefix)}/` : "/vault/";
      const res = await fetch(this.base() + path, { headers: this.headers() });
      if (res.status === 404) return [];
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { files?: string[] };
      const out: string[] = [];
      for (const file of data.files ?? []) {
        if (file.endsWith("/")) {
          if (depth > 0) {
            const sub = await walk(prefix ? `${prefix}/${file.slice(0, -1)}` : file.slice(0, -1), depth - 1);
            // names stay relative to the configured folder
            out.push(...sub.map((f) => `${file}${f}`));
          }
        } else if (file.endsWith(".md")) {
          out.push(file);
        }
      }
      return out;
    };
    const files = await walk(folder, 3);
    return files.sort((a, b) => b.localeCompare(a));
  }

  async read(name: string): Promise<string> {
    const res = await fetch(this.base() + "/vault/" + this.notePath(name), {
      headers: this.headers({ Accept: "text/markdown" }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  }

  /** Read content + vault mtime in one round trip; falls back to plain text on old plugins. */
  async readDoc(name: string): Promise<NoteDoc> {
    const res = await fetch(this.base() + "/vault/" + this.notePath(name), {
      headers: this.headers({ Accept: "application/vnd.olrapi.note+json" }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const type = res.headers.get("content-type") ?? "";
    if (type.includes("json")) {
      const data = (await res.json()) as {
        content?: string;
        tags?: string[];
        stat?: { mtime?: number };
      };
      return {
        content: data.content ?? "",
        mtime: data.stat?.mtime ?? null,
        tags: data.tags ?? [],
      };
    }
    return { content: await res.text(), mtime: null, tags: [] };
  }

  /**
   * Replace a file Tata itself owns (tata.json — never a page you wrote).
   * Its protection lives in decideVaultWrite: unread, unreadable or
   * corrupt saves are refused, and a newer vault copy is merged first.
   */
  async writeOwn(name: string, content: string): Promise<void> {
    return this.write(name, content);
  }

  /** The only unguarded write. Private on purpose: every caller that
   *  touches YOUR words goes through writeGuarded, whose "a file with
   *  words in it is never replaced" rule is the one global invariant. */
  private async write(name: string, content: string): Promise<void> {
    const res = await fetch(this.base() + "/vault/" + this.notePath(name), {
      method: "PUT",
      headers: this.headers({ "Content-Type": "text/markdown" }),
      body: content,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  }

  /**
   * Guarded full-file write. The plugin's PUT ignores If-Match (verified
   * against v5.0.2), so before writing we re-read the vault copy and compare
   * its mtime with the one our edit is based on. If Obsidian moved the file
   * forward we surface the remote copy instead of silently overwriting it.
   */
  async writeGuarded(
    name: string,
    content: string,
    baseMtime: number | null,
    baseContent?: string | null,
  ): Promise<WriteResult> {
    let remote: NoteDoc | null = null;
    try {
      remote = await this.readDoc(name);
    } catch (error) {
      if (error instanceof Error && error.message === "HTTP 404") {
        remote = null; // new file — nothing to clobber
      } else {
        return { ok: false, reason: "offline" };
      }
    }
    if (remote && remote.content !== content) {
      // The plugin does not always stamp mtime (non-JSON responses have
      // none). Then baseMtime is null for EVERY page, so the content
      // check must come first — ordering it after the believed-new rule
      // made an unstamped vault raise a conflict on every ordinary edit.
      if (remote.mtime === null) {
        if (baseContent == null || remote.content !== baseContent) {
          return { ok: false, reason: "conflict", remote };
        }
      } else if (baseMtime === null) {
        // A file we believe is new but that already holds words is never
        // ours to replace — this is the one that ate pages when a failed
        // read blanked the editor and armed a null base.
        if (remote.content.trim() !== "") {
          return { ok: false, reason: "conflict", remote };
        }
      } else if (remote.mtime !== baseMtime) {
        return { ok: false, reason: "conflict", remote };
      }
    }
    try {
      await this.write(name, content);
    } catch {
      return { ok: false, reason: "offline" };
    }
    try {
      const after = await this.readDoc(name);
      return { ok: true, mtime: after.mtime };
    } catch {
      return { ok: true, mtime: null };
    }
  }

  /** Open this note in the Obsidian app — the door to everything we don't build. */
  async openInObsidian(name: string): Promise<void> {
    const res = await fetch(this.base() + "/open/" + this.notePath(name), {
      method: "POST",
      headers: this.headers(),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  }

  /** Server info; `authenticated` tells a bad key apart from a dead server. */
  async health(): Promise<{ ok: boolean; authenticated: boolean; version: string }> {
    const res = await fetch(this.base() + "/", { headers: this.headers() });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as {
      status?: string;
      authenticated?: boolean;
      versions?: { self?: string };
    };
    return {
      ok: data.status === "OK",
      authenticated: data.authenticated === true,
      version: data.versions?.self ?? "",
    };
  }

  /** Full-text search via the plugin, filtered to our folder. Returns file names with a snippet. */
  async search(query: string, signal?: AbortSignal): Promise<{ name: string; snippet: string }[]> {
    const folder = this.folder();
    const res = await fetch(
      this.base() + "/search/simple/?query=" + encodeURIComponent(query) + "&contextLength=90",
      { method: "POST", headers: this.headers(), signal },
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as {
      filename: string;
      matches?: { context?: string }[];
    }[];
    const prefix = folder ? folder + "/" : "";
    return data
      .filter((item) => item.filename.startsWith(prefix) && item.filename.endsWith(".md"))
      .map((item) => ({
        name: item.filename.slice(prefix.length),
        snippet: (item.matches?.[0]?.context ?? "").replace(/\s+/g, " ").trim(),
      }));
  }
}
