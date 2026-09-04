/**
 * The persistence state machine for the user's words — framework-free.
 *
 * Everything that opens, edits, saves or rescues a page lives here, behind
 * one atomic tuple: (file, content, baseMtime, baseContent) always travel
 * together, because assembling them from parts that update at different
 * moments is how one page's words landed in another page's file (8/21).
 *
 * The React layer subscribes to snapshots and renders; it never touches
 * the tuple. Page-flip animations may READ this store; they must never
 * delay, batch or cancel a flush.
 */

import { logDebug } from "../debuglog";
import { drafts, metaCache } from "../drafts";
import { countWords } from "../city/metrics";

export type DocStatus = "idle" | "loading" | "saving" | "saved" | "offline" | "error";
export type DocConflict = { remote: string; mtime: number | null };

export type DocSnapshot = {
  file: string | null;
  content: string;
  status: DocStatus;
  /** translation key — the view renders t(errorKey) */
  errorKey: string | null;
  conflict: DocConflict | null;
  dirty: boolean;
  /** bumps ONLY when a document is adopted (open, resolve, restore) —
   *  the editor accepts external content on version change and at no
   *  other time, so ordinary typing can never be interrupted */
  docVersion: number;
};

type WriteResult =
  | { ok: true; mtime: number | null; verified?: boolean }
  | { ok: false; reason: "conflict"; remote: { content: string; mtime: number | null } }
  | { ok: false; reason: "offline" };

/** the minimal vault surface — never the whole network client */
export type VaultDocClient = {
  readDoc(name: string): Promise<{ content: string; mtime: number | null }>;
  writeGuarded(
    name: string,
    content: string,
    baseMtime: number | null,
    baseContent?: string | null,
  ): Promise<WriteResult>;
};

export type DocCallbacks = {
  onSaved?: (file: string, isNew: boolean) => void;
  onWords?: (file: string, words: number) => void;
};

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Is this page the record rather than the draft?
 *
 * A past day you wrote is sealed — it stands as what that day was. A past
 * day you left dark is not sealed, because you can still fill it in.
 *
 * Both shapes name the same day and both must be recognised: pages written
 * on the day are "2026-08-25 Today.md", pages backfilled later are
 * "2026-08-25.md". Matching only the first shape left every backfilled page
 * editable forever, which put two kinds of past under two different rules
 * for no reason but a space.
 */
export function isSealed(file: string | null, today: string): boolean {
  if (!file) return false;
  if (!/^\d{4}-\d{2}-\d{2}[ .]/.test(file)) return false;
  return file.slice(0, 10) < today;
}

export function todayStamp() {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function timeStamp() {
  const now = new Date();
  return `${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

export function newNoteName() {
  const now = new Date();
  return `${todayStamp()} ${pad(now.getHours())}.${pad(now.getMinutes())}.md`;
}

export function todayName() {
  return `${todayStamp()} Today.md`;
}

export function legacyTonightName() {
  return `${todayStamp()} Tonight.md`;
}

const SAVE_DELAY = 4000;
const DRAFT_DELAY = 400;

export function createDocStore() {
  /* ---- the one tuple ---- */
  let doc: {
    file: string | null;
    content: string;
    baseMtime: number | null;
    baseContent: string | null;
  } = { file: null, content: "", baseMtime: null, baseContent: null };

  let seed = "";
  let dirty = false;
  let status: DocStatus = "idle";
  let errorKey: string | null = null;
  let conflict: DocConflict | null = null;
  let docVersion = 0;

  /* one write at a time: overlapping flushes carried the same stale base
     and raised a conflict against the user's own words */
  let saving = false;
  let pendingFlush = false;

  let saveTimer: number | null = null;
  let draftTimer: number | null = null;

  let client: VaultDocClient | null = null;
  let callbacks: DocCallbacks = {};

  /* every open claims an epoch; a slower, older open must never adopt
     over a newer one (clicking a past day used to lose to "open today") */
  let openSeq = 0;

  /* ---- subscription ---- */
  const listeners = new Set<() => void>();
  let snapshot: DocSnapshot = {
    file: null,
    content: "",
    status: "idle",
    errorKey: null,
    conflict: null,
    dirty: false,
    docVersion: 0,
  };

  function emit() {
    snapshot = { file: doc.file, content: doc.content, status, errorKey, conflict, dirty, docVersion };
    for (const fn of listeners) fn();
  }

  /* ---- internal helpers ---- */

  /** adopt a document — the ONLY door through which file/content enter */
  function putDoc(
    file: string | null,
    text: string,
    baseMtime: number | null,
    baseContent: string | null,
    isDirty: boolean,
  ) {
    doc = { file, content: text, baseMtime, baseContent };
    dirty = isDirty;
    docVersion += 1;
    if (isDirty) armSave(); // a resumed draft flushes on its own, like typing
    emit();
  }

  /** key: undefined = keep the current error, null = clear it */
  function setStatus(next: DocStatus, key?: string | null) {
    status = next;
    if (key !== undefined) errorKey = key;
    emit();
  }

  function clearTimers() {
    if (saveTimer !== null) {
      window.clearTimeout(saveTimer);
      saveTimer = null;
    }
    if (draftTimer !== null) {
      window.clearTimeout(draftTimer);
      draftTimer = null;
    }
  }

  function armSave() {
    if (saveTimer !== null) window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      saveTimer = null;
      void flush();
    }, SAVE_DELAY);
  }

  /* ---- the save path ---- */

  async function flush(): Promise<void> {
    if (!dirty || conflict) return;
    if (saving) {
      pendingFlush = true; // a write is in flight; follow it
      return;
    }
    saving = true;
    try {
      // one snapshot, taken together — file, text and base can never drift
      const d = doc;
      const content = d.content;
      const isEmptyDraft = content.trim() === seed.trim();
      if (!client) {
        if (!isEmptyDraft) setStatus("offline");
        return;
      }
      if (isEmptyDraft && d.baseMtime === null) return;
      const file = d.file ?? newNoteName();
      const wasNew = d.baseMtime === null;
      setStatus("saving");
      const result = await client.writeGuarded(file, content, d.baseMtime, d.baseContent);
      // a page opened while the write was in flight owns the doc now
      const stillHere = doc.file === d.file;
      if (result.ok) {
        if (stillHere) {
          doc = { file, content: doc.content, baseMtime: result.mtime, baseContent: content };
          dirty = doc.content !== content;
        }
        // the save landed: a queued draft snapshot must not re-park a
        // stale base behind it
        if (draftTimer !== null) {
          window.clearTimeout(draftTimer);
          draftTimer = null;
        }
        if (result.verified === false) {
          // unverified landing: the journal keeps our copy until a seen one
          logDebug("save", `${file}: kept draft (unverified write)`);
        } else void drafts.remove(file);
        void metaCache.put({ file, excerpt: firstLine(content), mtime: result.mtime ?? 0 });
        setStatus("saved");
        callbacks.onSaved?.(file, wasNew);
        return;
      }
      if (result.reason === "offline") {
        setStatus("offline");
        return;
      }
      const base = (d.baseContent ?? "").replace(/\s+$/, "");
      const theirs = result.remote.content.replace(/\s+$/, "");
      const ours = content.replace(/\s+$/, "");
      // the vault holds an earlier version of this very page — that is our
      // own previous write catching up, not somebody else's edit
      if (ours.startsWith(theirs)) {
        const retry = await client.writeGuarded(file, content, result.remote.mtime, result.remote.content);
        if (retry.ok) {
          if (doc.file === d.file) {
            doc = { ...doc, baseMtime: retry.mtime, baseContent: content };
            dirty = doc.content !== content;
          }
          void drafts.remove(file);
          setStatus("saved");
          callbacks.onSaved?.(file, false);
          return;
        }
      }
      if (base.length > 0 && theirs.startsWith(base) && ours.startsWith(base)) {
        const merged = theirs + ours.slice(base.length) + "\n";
        const retry = await client.writeGuarded(file, merged, result.remote.mtime, theirs);
        if (retry.ok) {
          if (doc.file === d.file) {
            putDoc(file, merged, retry.mtime, merged, false);
          }
          void drafts.remove(file);
          setStatus("saved");
          callbacks.onSaved?.(file, false);
          return;
        }
      }
      status = "idle";
      errorKey = null;
      conflict = { remote: result.remote.content, mtime: result.remote.mtime };
      emit();
    } finally {
      saving = false;
      if (pendingFlush) {
        pendingFlush = false;
        if (dirty) window.setTimeout(() => void flush(), 0);
      }
    }
  }

  /* ---- opening pages ---- */

  /** Today is one page per day: load it if it exists, otherwise start it. */
  async function openToday(): Promise<void> {
    const seq = ++openSeq;
    let file = todayName();
    // legacy: earlier days were called Tonight — keep appending to them
    if (client) {
      try {
        await client.readDoc(file);
      } catch {
        try {
          await client.readDoc(legacyTonightName());
          file = legacyTonightName();
        } catch {}
      }
    }
    const freshSeed = "";
    seed = freshSeed;
    conflict = null;
    emit();
    const draft = await drafts.get(file);
    if (seq !== openSeq) return; // someone opened something newer
    if (draft && draft.content.trim() !== draft.seed.trim()) {
      // the vault may have moved on (Obsidian edits, another device) —
      // show its latest and carry any unsent words forward, never hide it
      if (client) {
        try {
          const remote = await client.readDoc(file);
          if (seq !== openSeq) return;
          if (remote.mtime !== null && (draft.baseMtime === null || remote.mtime > draft.baseMtime)) {
            const delta = draft.content.startsWith(draft.seed)
              ? draft.content.slice(draft.seed.length)
              : draft.content;
            const carried = delta.trim().length > 0;
            const body = remote.content.trimEnd() + (carried ? `\n\n${delta.trim()}\n` : "\n");
            putDoc(file, body, remote.mtime, remote.content, carried);
            if (!carried) void drafts.remove(file);
            setStatus("idle");
            return;
          }
        } catch {}
      }
      seed = draft.seed || freshSeed;
      putDoc(file, draft.content, draft.baseMtime, null, true);
      setStatus(client ? "idle" : "offline");
      return;
    }
    if (client) {
      try {
        const remote = await client.readDoc(file);
        if (seq !== openSeq) return;
        putDoc(file, remote.content.trimEnd() + "\n", remote.mtime, remote.content, false);
        setStatus("idle");
        return;
      } catch (err) {
        // only an absent page earns a blank one; a dropped wire must
        // never present today's words as if they were never written
        if (seq !== openSeq) return;
        if (!(err instanceof Error && err.message === "HTTP 404")) {
          putDoc(file, "", null, null, false);
          setStatus("offline", "notes.error.open");
          return;
        }
      }
    }
    if (seq !== openSeq) return;
    putDoc(file, freshSeed, null, null, false);
    setStatus("idle");
  }

  async function open(name: string): Promise<void> {
    const seq = ++openSeq;
    setStatus("loading", null);
    conflict = null;
    emit();
    const draft = await drafts.get(name);
    if (seq !== openSeq) return;
    if (draft && draft.content.trim() !== draft.seed.trim()) {
      seed = draft.seed;
      putDoc(name, draft.content, draft.baseMtime, null, true);
      setStatus("idle");
      return;
    }
    if (!client) {
      // no vault to read from: say so instead of leaving the page
      // half-open with a spinner and last page's words on screen
      setStatus("offline", "notes.error.open");
      return;
    }
    const readOnce = async () => {
      const remote = await client!.readDoc(name);
      if (seq !== openSeq) return;
      seed = "";
      putDoc(name, remote.content, remote.mtime, remote.content, false);
      setStatus("idle");
    };
    try {
      await readOnce();
    } catch (first) {
      // a wikilink to a page that doesn't exist yet starts that page —
      // but ONLY on a real 404. Any other failure used to blank the
      // editor over a page that still had words in it.
      const missing = first instanceof Error && first.message === "HTTP 404";
      if (missing) {
        seed = "";
        putDoc(name, "", null, null, false);
        setStatus("idle");
        return;
      }
      // one breath, one retry — a sleeping wire often wakes on the second try
      await new Promise((r) => window.setTimeout(r, 900));
      if (seq !== openSeq) return;
      try {
        await readOnce();
      } catch (second) {
        logDebug("open", `${name}: ${String(second).slice(0, 80)}`);
        setStatus("error", "notes.error.open");
      }
    }
  }

  /** resume the freshest unsent draft; false = nothing to resume */
  async function resume(): Promise<boolean> {
    const seq = ++openSeq;
    const all = await drafts.all();
    if (seq !== openSeq) return true; // a newer open owns the stage; do not fall through to today
    const pending = all
      .filter((d) => d.content.trim() !== d.seed.trim())
      .sort((a, b) => b.updatedAt - a.updatedAt)[0];
    if (!pending) return false;
    seed = pending.seed;
    putDoc(pending.file, pending.content, pending.baseMtime, null, true);
    setStatus(client ? "idle" : "offline");
    return true;
  }

  function newPage() {
    const freshSeed = "";
    seed = freshSeed;
    conflict = null;
    // the name is claimed on the first keystroke, but the base must be
    // cleared NOW — inheriting the last page's base is how a fresh page
    // starts life carrying somebody else's identity
    putDoc(null, freshSeed, null, null, false);
    setStatus("idle");
  }

  /* ---- editing ---- */

  function edit(next: string) {
    let file = doc.file;
    if (!file) {
      file = newNoteName();
    }
    // the tuple always travels together — text belongs to this file
    doc = { ...doc, file, content: next };
    dirty = true;
    if (status === "saved") status = "idle";
    emit();
    callbacks.onWords?.(file, countWords(next));
    const parked = {
      file,
      content: next,
      seed,
      baseMtime: doc.baseMtime,
      updatedAt: Date.now(),
    };
    if (draftTimer !== null) window.clearTimeout(draftTimer);
    draftTimer = window.setTimeout(() => {
      draftTimer = null;
      if (parked.content.trim() === parked.seed.trim()) void drafts.remove(parked.file);
      else void drafts.put(parked);
    }, DRAFT_DELAY);
    armSave();
  }

  /* ---- conflict choices ----
     Taking theirs must never mean losing ours: the version set aside is
     kept as a tombstone draft, because a choice made in a hurry is still
     a choice made about words somebody wrote. */

  function resolveTheirs() {
    if (!conflict) return;
    const file = doc.file;
    const ours = doc.content;
    const c = conflict;
    if (file && ours.trim().length > 0 && ours.trim() !== c.remote.trim()) {
      void drafts
        .put({
          file: `${file.replace(/\.md$/, "")} (tata ${timeStamp().replace(":", ".")}).md`,
          content: ours,
          seed: "",
          baseMtime: null,
          updatedAt: Date.now(),
        })
        .then((kept) => {
          // the original journal entry dies only once the tombstone stands
          if (kept) void drafts.remove(file);
          else logDebug("draft", `tombstone failed for ${file}; keeping original`);
        });
    } else if (file) {
      void drafts.remove(file);
    }
    conflict = null;
    putDoc(file, c.remote.trimEnd() + "\n", c.mtime, c.remote, false);
    setStatus("idle");
  }

  async function resolveMine(): Promise<void> {
    if (!conflict || !client) return;
    const d = doc;
    const file = d.file ?? newNoteName();
    const content = d.content;
    const theirMtime = conflict.mtime;
    const theirContent = conflict.remote;
    conflict = null;
    setStatus("saving");
    const result = await client.writeGuarded(file, content, theirMtime, theirContent);
    const stillHere = doc.file === d.file;
    if (result.ok) {
      if (stillHere) {
        doc = { file, content, baseMtime: result.mtime, baseContent: content };
        dirty = false;
        docVersion += 1;
      }
      void drafts.remove(file);
      setStatus("saved");
      callbacks.onSaved?.(file, false);
    } else if (result.reason === "conflict") {
      status = "idle";
      conflict = { remote: result.remote.content, mtime: result.remote.mtime };
      emit();
    } else {
      setStatus("offline");
    }
  }

  async function resolveBoth(): Promise<void> {
    if (!conflict || !client) return;
    const d = doc;
    const original = d.file ?? newNoteName();
    const content = d.content;
    const copy = original.replace(/\.md$/, "") + ` (tata ${timeStamp().replace(":", ".")}).md`;
    setStatus("saving");
    try {
      const put = await client.writeGuarded(copy, content, null, null);
      if (!put.ok) {
        // a copy from the same minute already exists — never replace it
        setStatus("offline", "notes.error.save");
        return;
      }
      void drafts.remove(original);
      let mtime: number | null = null;
      try {
        const written = await client.readDoc(copy);
        mtime = written.mtime;
      } catch {}
      // if the reader moved on mid-rescue, leave their page alone
      if (doc.file === d.file) putDoc(copy, content, mtime, content, false);
      conflict = null;
      setStatus("saved");
      callbacks.onSaved?.(copy, true);
    } catch {
      setStatus("offline");
    }
  }

  /* ---- public surface ---- */

  return {
    subscribe(fn: () => void) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    getSnapshot: () => snapshot,
    setClient(next: VaultDocClient | null) {
      client = next;
    },
    /** the connection flow shares the panel's one status slot */
    setStatus,
    setCallbacks(next: DocCallbacks) {
      callbacks = next;
    },
    /** unsent words beyond the seed — the connect flow asks before
     *  deciding whether to keep the editor or jump to today */
    hasUnsentWords: () => dirty && doc.content.trim() !== seed.trim(),
    openToday,
    open,
    resume,
    newPage,
    edit,
    flush,
    resolveTheirs,
    resolveMine,
    resolveBoth,
    dispose() {
      clearTimers();
      listeners.clear();
    },
  };
}

export type DocStore = ReturnType<typeof createDocStore>;

function firstLine(text: string) {
  const line = text
    .split("\n")
    .map((l) => l.replace(/^[>#\s*-]+/, "").replace(/^\[[ x]\]\s*/, "").trim())
    .find((l) => l.length > 0 && !/^\d{2}:\d{2}/.test(l));
  return line ?? "";
}
