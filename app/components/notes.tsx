"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_OBSIDIAN_URL,
  ObsidianClient,
  loadConfig,
  saveConfig,
} from "../lib/obsidian";
import type { ObsidianConfig } from "../lib/obsidian";
import { drafts, metaCache, migrateLegacyDraft } from "../lib/drafts";
import { countWords } from "../lib/city/metrics";
import { floorsOf } from "../lib/city/plan";
import { wordWatts } from "../lib/game/watts";
import { MarkdownEditor } from "./editor";
import type { EditorApi } from "./editor";

type View = "setup" | "edit";
type Status = "idle" | "loading" | "saving" | "saved" | "offline" | "error";

type Conflict = { remote: string; mtime: number | null };

const isSafari =
  typeof navigator !== "undefined" &&
  /safari/i.test(navigator.userAgent) &&
  !/chrome|chromium|crios|android|edg/i.test(navigator.userAgent);

/* an iPhone/iPad can never reach the Mac's 127.0.0.1 — be honest about it */
const isIOS =
  typeof navigator !== "undefined" &&
  (/iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

/* Safari refuses plain http to 127.0.0.1 from an https page — the plugin's
   https port is the road that actually opens */
const SAFARI_OBSIDIAN_URL = "https://127.0.0.1:27124";

type FontSize = "s" | "m" | "l";
const SIZE_KEY = "yeyufm.notesize";
const SIZE_ORDER: FontSize[] = ["s", "m", "l"];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function todayStamp() {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function timeStamp() {
  const now = new Date();
  return `${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

function newNoteName() {
  const now = new Date();
  return `${todayStamp()} ${pad(now.getHours())}.${pad(now.getMinutes())}.md`;
}

function todayName() {
  return `${todayStamp()} Today.md`;
}

function legacyTonightName() {
  return `${todayStamp()} Tonight.md`;
}

function prettyName(file: string) {
  const daily = file.match(/^(\d{4})-(\d{2})-(\d{2}) (Today|Tonight)\.md$/);
  if (daily) return `${MONTHS[Number(daily[2]) - 1]} ${Number(daily[3])} · Today`;
  const m = file.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2})\.(\d{2})\.md$/);
  if (!m) return file.replace(/\.md$/, "");
  return `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])} · ${m[4]}:${m[5]}`;
}

function firstLine(text: string) {
  const line = text
    .split("\n")
    .map((l) => l.replace(/^[>#\s*-]+/, "").replace(/^\[[ x]\]\s*/, "").trim())
    .find((l) => l.length > 0 && !/^\d{2}:\d{2}/.test(l));
  return line ?? "";
}

export function NotesPanel({
  open,
  onClose,
  requestOpen,
  requestToday,
  lang,
  backlinks,
  onOpenTag,
  requestSetup,
  recent,
  pages,
  onConnected,
  cityLive,
  onWords,
  onSaved,
  onActiveFile,
  t,
}: {
  open: boolean;
  onClose: () => void;
  /** ask the panel to open a specific vault file (click on a building) */
  requestOpen: { file: string; n: number } | null;
  /** bumped when the user explicitly asks for today's page */
  requestToday?: number;
  /** UI language, forwarded to the editor's command menu */
  lang?: "en" | "zh";
  /** files that link to the active page */
  backlinks?: string[];
  /** a #tag was clicked in the editor */
  onOpenTag?: (tag: string) => void;
  /** ask the panel to show the Obsidian setup view */
  requestSetup?: number;
  /** recently touched pages, newest first */
  recent?: string[];
  /** every vault page, for [[wikilink]] autocomplete */
  pages?: string[];
  /** fired after a successful connect so the city adopts the client too */
  onConnected?: () => void;
  /** the page-level sync state — when the city reconnects, so do we */
  cityLive?: boolean;
  /** live word count while typing — feeds the city */
  onWords: (file: string, words: number) => void;
  /** a save landed in the vault; isNew = the structure just settled */
  onSaved: (file: string, isNew: boolean) => void;
  onActiveFile: (file: string | null) => void;
  t: (key: string) => string;
}) {
  const [view, setView] = useState<View>("edit");
  const [connected, setConnected] = useState(false);
  const [url, setUrl] = useState(isSafari && !isIOS ? SAFARI_OBSIDIAN_URL : DEFAULT_OBSIDIAN_URL);
  const [key, setKey] = useState("");
  const [folder, setFolder] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [fontSize, setFontSize] = useState<FontSize>("m");
  const [conflict, setConflict] = useState<Conflict | null>(null);

  const clientRef = useRef<ObsidianClient | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const draftTimerRef = useRef<number | null>(null);
  const dirtyRef = useRef(false);
  const seedRef = useRef("");
  const baseMtimeRef = useRef<number | null>(null);
  const baseContentRef = useRef<string | null>(null);
  const openedRef = useRef(false);
  const requestSeenRef = useRef(0);
  const editorRef = useRef<EditorApi | null>(null);

  useEffect(() => {
    onActiveFile(open ? activeFile : null);
  }, [activeFile, open, onActiveFile]);

  const [templates, setTemplates] = useState<{ name: string; content: string }[]>([]);
  useEffect(() => {
    const client = clientRef.current;
    if (!connected || !client) return;
    let dead = false;
    void (async () => {
      try {
        const names = (await client.list()).filter((f) => /^Templates\//i.test(f));
        const out: { name: string; content: string }[] = [];
        for (const f of names.slice(0, 12)) {
          try {
            const doc = await client.readDoc(f);
            out.push({
              name: f.replace(/^Templates\//i, "").replace(/\.md$/i, ""),
              content: doc.content.trimEnd() + "\n",
            });
          } catch {}
        }
        if (!dead) setTemplates(out);
      } catch {}
    })();
    return () => {
      dead = true;
    };
  }, [connected]);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const apply = () =>
      document.documentElement.style.setProperty("--vvh", `${Math.round(vv.height)}px`);
    apply();
    vv.addEventListener("resize", apply);
    return () => {
      vv.removeEventListener("resize", apply);
      document.documentElement.style.removeProperty("--vvh");
    };
  }, []);

  const setupSeenRef = useRef(0);
  useEffect(() => {
    if (!requestSetup || requestSetup === setupSeenRef.current) return;
    setupSeenRef.current = requestSetup;
    setView("setup");
  }, [requestSetup]);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(SIZE_KEY) as FontSize | null;
      if (saved === "s" || saved === "m" || saved === "l") {
        window.setTimeout(() => setFontSize(saved), 0);
      }
    } catch {}
  }, []);

  const cycleFontSize = useCallback(() => {
    setFontSize((current) => {
      const next = SIZE_ORDER[(SIZE_ORDER.indexOf(current) + 1) % SIZE_ORDER.length];
      try {
        window.localStorage.setItem(SIZE_KEY, next);
      } catch {}
      return next;
    });
  }, []);

  const makeClient = useCallback((config: ObsidianConfig) => {
    clientRef.current = new ObsidianClient(config);
    return clientRef.current;
  }, []);

  const checkConnection = useCallback(async (client: ObsidianClient, quiet = false) => {
    if (!quiet) {
      setStatus("loading");
      setError(null);
    }
    try {
      await client.list();
      setStatus("idle");
      setError(null);
      setConnected(true);
      return true;
    } catch {
      if (quiet) {
        setConnected(false);
        return false;
      }
      setStatus("error");
      setConnected(false);
      let message = t("notes.error.connect");
      try {
        const h = await client.health();
        if (h.ok && !h.authenticated) {
          message = t("notes.error.keymismatch");
        }
      } catch {
        if (isSafari) {
          message = t("notes.error.safari");
        }
      }
      setError(message);
      return false;
    }
  }, [t]);

  /* every open re-checks the connection — a PWA quit/relaunch or an
     Obsidian restart otherwise leaves us silently "connected" */
  useEffect(() => {
    if (!open || !clientRef.current || view === "setup") return;
    void checkConnection(clientRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /* the city reconnected — follow it out of the offline state */
  useEffect(() => {
    if (!open || !cityLive || connected || !clientRef.current) return;
    void checkConnection(clientRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, cityLive, connected]);

  /* while the panel is open and the link is down, quietly retry every 8 s
     on our own — and push any waiting words the moment it heals */
  const flushRef = useRef<(() => Promise<void>) | null>(null);
  useEffect(() => {
    if (!open || connected || view === "setup" || isIOS) return;
    const id = window.setInterval(() => {
      const client = clientRef.current;
      if (!client || document.hidden) return;
      void checkConnection(client, true).then((ok) => {
        if (ok && dirtyRef.current) void flushRef.current?.();
      });
    }, 8000);
    return () => window.clearInterval(id);
  }, [open, connected, view, checkConnection]);

  /* Today is one page per day: load it if it exists, otherwise start it. */
  const openTonight = useCallback(async () => {
    const client = clientRef.current;
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
    const seed = `> ${timeStamp()}\n\n`;
    seedRef.current = seed;
    setActiveFile(file);
    setConflict(null);
    setView("edit");
    const draft = await drafts.get(file);
    if (draft && draft.content.trim() !== draft.seed.trim()) {
      // the vault may have moved on (Obsidian edits, another device) —
      // show its latest and carry any unsent words forward, never hide it
      if (client) {
        try {
          const doc = await client.readDoc(file);
          if (doc.mtime !== null && (draft.baseMtime === null || doc.mtime > draft.baseMtime)) {
            const delta = draft.content.startsWith(draft.seed)
              ? draft.content.slice(draft.seed.length)
              : draft.content;
            const carried = delta.trim().length > 0;
            const body = doc.content.trimEnd() + (carried ? `\n\n${delta.trim()}\n` : "\n");
            setContent(body);
            baseMtimeRef.current = doc.mtime;
            baseContentRef.current = doc.content;
            dirtyRef.current = carried;
            if (!carried) void drafts.remove(file);
            setStatus("idle");
            window.setTimeout(() => editorRef.current?.cursorToEnd(), 250);
            return;
          }
        } catch {}
      }
      seedRef.current = draft.seed || seed;
      setContent(draft.content);
      baseMtimeRef.current = draft.baseMtime;
      baseContentRef.current = null;
      dirtyRef.current = true;
      setStatus(client ? "idle" : "offline");
      window.setTimeout(() => editorRef.current?.cursorToEnd(), 250);
      return;
    }
    if (client) {
      try {
        const doc = await client.readDoc(file);
        setContent(doc.content.trimEnd() + "\n");
        baseMtimeRef.current = doc.mtime;
        baseContentRef.current = doc.content;
        dirtyRef.current = false;
        setStatus("idle");
        window.setTimeout(() => editorRef.current?.cursorToEnd(), 250);
        return;
      } catch {}
    }
    setContent(seed);
    baseMtimeRef.current = null;
    baseContentRef.current = null;
    dirtyRef.current = false;
    setStatus("idle");
    window.setTimeout(() => editorRef.current?.cursorToEnd(), 250);
  }, []);

  const todaySeenRef = useRef(0);
  useEffect(() => {
    if (!requestToday || requestToday === todaySeenRef.current) return;
    todaySeenRef.current = requestToday;
    void openTonight();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestToday]);

  const openNote = useCallback(async (name: string) => {
    const client = clientRef.current;
    setStatus("loading");
    setError(null);
    setConflict(null);
    setView("edit");
    const draft = await drafts.get(name);
    if (draft && draft.content.trim() !== draft.seed.trim()) {
      seedRef.current = draft.seed;
      setActiveFile(name);
      setContent(draft.content);
      baseMtimeRef.current = draft.baseMtime;
      baseContentRef.current = null;
      dirtyRef.current = true;
      setStatus("idle");
      return;
    }
    if (!client) return;
    try {
      const doc = await client.readDoc(name);
      seedRef.current = "";
      setActiveFile(name);
      setContent(doc.content);
      baseMtimeRef.current = doc.mtime;
      baseContentRef.current = doc.content;
      dirtyRef.current = false;
      setStatus("idle");
    } catch (first) {
      // a wikilink to a page that doesn't exist yet starts that page —
      // but only when the link is truly absent, not when the wire dropped
      const ok = await checkConnection(client, true);
      if (ok) {
        seedRef.current = "";
        setActiveFile(name);
        setContent("");
        baseMtimeRef.current = null;
        baseContentRef.current = null;
        dirtyRef.current = false;
        setStatus("idle");
        return;
      }
      void first;
      setStatus("error");
      setError(t("notes.error.open"));
    }
  }, [t, checkConnection]);

  /* first open: resume the freshest unsent draft, else tonight */
  useEffect(() => {
    if (!open) {
      openedRef.current = false;
      return;
    }
    if (openedRef.current) return;
    openedRef.current = true;
    let cancelled = false;
    void (async () => {
      await migrateLegacyDraft(newNoteName);
      const all = await drafts.all();
      if (cancelled) return;
      const pending = all
        .filter((d) => d.content.trim() !== d.seed.trim())
        .sort((a, b) => b.updatedAt - a.updatedAt)[0];
      const config = loadConfig();
      if (config) {
        setUrl(config.url);
        setKey(config.key);
        setFolder(config.folder);
        const client = makeClient(config);
        setConnected(true);
        void checkConnection(client);
      }
      if (pending) {
        seedRef.current = pending.seed;
        setActiveFile(pending.file);
        setContent(pending.content);
        baseMtimeRef.current = pending.baseMtime;
        baseContentRef.current = null;
        dirtyRef.current = true;
        setStatus(config ? "idle" : "offline");
        setView("edit");
        window.setTimeout(() => editorRef.current?.cursorToEnd(), 250);
      } else {
        void openTonight();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, makeClient, checkConnection, openTonight]);

  /* open a specific building */
  useEffect(() => {
    if (!requestOpen || requestOpen.n === requestSeenRef.current) return;
    requestSeenRef.current = requestOpen.n;
    void openNote(requestOpen.file);
  }, [requestOpen, openNote]);

  const connect = useCallback(() => {
    const config: ObsidianConfig = {
      url: url.trim() || (isSafari && !isIOS ? SAFARI_OBSIDIAN_URL : DEFAULT_OBSIDIAN_URL),
      key: key.trim(),
      folder: folder.trim(),
    };
    if (!config.key) {
      setError(t("notes.error.nokey"));
      return;
    }
    saveConfig(config);
    const client = makeClient(config);
    void checkConnection(client).then((ok) => {
      if (!ok) return;
      onConnected?.();
      if (dirtyRef.current && content.trim() !== seedRef.current.trim()) {
        setView("edit");
      } else {
        void openTonight();
      }
    });
  }, [url, key, folder, content, makeClient, checkConnection, onConnected, openTonight, t]);

  const flushSave = useCallback(async () => {
    const client = clientRef.current;
    if (!dirtyRef.current || conflict) return;
    const isEmptyDraft = content.trim() === seedRef.current.trim();
    if (!client) {
      if (!isEmptyDraft) setStatus("offline");
      return;
    }
    if (isEmptyDraft && baseMtimeRef.current === null) return;
    const file = activeFile ?? newNoteName();
    const wasNew = baseMtimeRef.current === null;
    setStatus("saving");
    const result = await client.writeGuarded(file, content, baseMtimeRef.current);
    if (result.ok) {
      if (activeFile === null) setActiveFile(file);
      baseMtimeRef.current = result.mtime;
      baseContentRef.current = content;
      dirtyRef.current = false;
      void drafts.remove(file);
      void metaCache.put({ file, excerpt: firstLine(content), mtime: result.mtime ?? 0 });
      setStatus("saved");
      onSaved(file, wasNew);
      return;
    }
    if (result.reason === "offline") {
      setStatus("offline");
      return;
    }
    const base = (baseContentRef.current ?? "").replace(/\s+$/, "");
    const theirs = result.remote.content.replace(/\s+$/, "");
    const ours = content.replace(/\s+$/, "");
    if (base.length > 0 && theirs.startsWith(base) && ours.startsWith(base)) {
      const merged = theirs + ours.slice(base.length) + "\n";
      const retry = await client.writeGuarded(file, merged, result.remote.mtime);
      if (retry.ok) {
        setContent(merged);
        baseMtimeRef.current = retry.mtime;
        baseContentRef.current = merged;
        dirtyRef.current = false;
        void drafts.remove(file);
        setStatus("saved");
        onSaved(file, false);
        return;
      }
    }
    setStatus("idle");
    setConflict({ remote: result.remote.content, mtime: result.remote.mtime });
  }, [activeFile, content, conflict, onSaved]);

  /* Conflict choices — the draft journal keeps our words safe throughout. */
  const resolveTheirs = useCallback(() => {
    if (!conflict) return;
    const file = activeFile;
    setContent(conflict.remote.trimEnd() + "\n");
    baseMtimeRef.current = conflict.mtime;
    baseContentRef.current = conflict.remote;
    dirtyRef.current = false;
    if (file) void drafts.remove(file);
    setConflict(null);
    setStatus("idle");
    window.setTimeout(() => editorRef.current?.cursorToEnd(), 100);
  }, [conflict, activeFile]);

  const resolveMine = useCallback(async () => {
    const client = clientRef.current;
    if (!conflict || !client) return;
    const file = activeFile ?? newNoteName();
    const theirMtime = conflict.mtime;
    setConflict(null);
    setStatus("saving");
    const result = await client.writeGuarded(file, content, theirMtime);
    if (result.ok) {
      if (activeFile === null) setActiveFile(file);
      baseMtimeRef.current = result.mtime;
      baseContentRef.current = content;
      dirtyRef.current = false;
      void drafts.remove(file);
      setStatus("saved");
      onSaved(file, false);
    } else if (result.reason === "conflict") {
      setStatus("idle");
      setConflict({ remote: result.remote.content, mtime: result.remote.mtime });
    } else {
      setStatus("offline");
    }
  }, [conflict, activeFile, content, onSaved]);

  const resolveBoth = useCallback(async () => {
    const client = clientRef.current;
    if (!conflict || !client) return;
    const original = activeFile ?? newNoteName();
    const copy =
      original.replace(/\.md$/, "") + ` (tata ${timeStamp().replace(":", ".")}).md`;
    setStatus("saving");
    try {
      await client.write(copy, content);
      void drafts.remove(original);
      setActiveFile(copy);
      baseContentRef.current = content;
      try {
        const doc = await client.readDoc(copy);
        baseMtimeRef.current = doc.mtime;
      } catch {
        baseMtimeRef.current = null;
      }
      dirtyRef.current = false;
      setConflict(null);
      setStatus("saved");
      onSaved(copy, true);
    } catch {
      setStatus("offline");
    }
  }, [conflict, activeFile, content, onSaved]);

  useEffect(() => {
    flushRef.current = flushSave;
  }, [flushSave]);

  /* The draft journal is the safety net, so the vault push can breathe slower. */
  useEffect(() => {
    if (!dirtyRef.current) return;
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      void flushSave();
    }, 4000);
    return () => {
      if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    };
  }, [content, flushSave]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) void flushSave();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [flushSave]);

  const handleChange = useCallback(
    (next: string) => {
      setContent(next);
      dirtyRef.current = true;
      setStatus((s) => (s === "saved" ? "idle" : s));
      let file = activeFile;
      if (!file) {
        file = newNoteName();
        setActiveFile(file);
      }
      onWords(file, countWords(next));
      const snapshot = {
        file,
        content: next,
        seed: seedRef.current,
        baseMtime: baseMtimeRef.current,
        updatedAt: Date.now(),
      };
      if (draftTimerRef.current !== null) window.clearTimeout(draftTimerRef.current);
      draftTimerRef.current = window.setTimeout(() => {
        if (snapshot.content.trim() === snapshot.seed.trim()) void drafts.remove(snapshot.file);
        else void drafts.put(snapshot);
      }, 400);
    },
    [activeFile, onWords],
  );

  const newPage = useCallback(() => {
    const seed = `> ${timeStamp()}\n\n`;
    seedRef.current = seed;
    setActiveFile(null); // claims its name on the first keystroke
    setConflict(null);
    setContent(seed);
    baseMtimeRef.current = null;
    baseContentRef.current = null;
    dirtyRef.current = false;
    setStatus("idle");
    setView("edit");
    window.setTimeout(() => editorRef.current?.cursorToEnd(), 150);
  }, []);

  const handleClose = useCallback(() => {
    void flushSave();
    onClose();
  }, [flushSave, onClose]);

  const statusLabel =
    status === "saving"
      ? t("notes.status.saving")
      : status === "saved"
        ? t("notes.status.saved")
        : status === "offline"
          ? t("notes.status.offline")
          : status === "loading"
            ? t("notes.status.loading")
            : "";

  return (
    <aside className="notes-panel" aria-label="Notes" aria-hidden={!open} inert={!open}>
      <div className="panel-heading">
        <span>{view === "setup" ? t("notes.vault.title") : ""}</span>
        <div className="notes-heading-actions">
          {view !== "setup" && (
            <button type="button" className="notes-gear" onClick={newPage} aria-label={t("notes.newpage")} title={t("notes.newpage")}>
              +
            </button>
          )}
          {view !== "setup" && (
            <button
              type="button"
              className="notes-gear"
              onClick={() => setView("setup")}
              aria-label={t("notes.settings.aria")}
            >
              ⚙
            </button>
          )}
          {view === "setup" && (
            <button
              type="button"
              className="notes-gear"
              onClick={() => setView("edit")}
              aria-label={t("notes.back")}
            >
              ←
            </button>
          )}
          <button type="button" onClick={handleClose} aria-label={t("common.close")}>
            ×
          </button>
        </div>
      </div>

      {view === "setup" && isIOS && (
        <div className="notes-setup">
          <p className="notes-help">{t("notes.setup.ios")}</p>
          <button type="button" className="notes-primary" onClick={onClose}>
            {t("notes.setup.ios.ok")}
          </button>
        </div>
      )}
      {view === "setup" && !isIOS && (
        <div className="notes-setup">
          <p className="notes-help">{t("notes.setup.help")}</p>
          {isSafari && (
            <ol className="notes-steps">
              <li>{t("notes.setup.safari.1")}</li>
              <li>{t("notes.setup.safari.2")}</li>
              <li>{t("notes.setup.safari.3")}</li>
            </ol>
          )}
          <label>
            <span>{t("notes.setup.apikey")}</span>
            <input
              type="password"
              value={key}
              onChange={(event) => setKey(event.target.value)}
              spellCheck={false}
            />
          </label>
          {advanced && (
            <>
              <label>
                <span>{t("notes.setup.url")}</span>
                <input
                  type="text"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder={DEFAULT_OBSIDIAN_URL}
                  spellCheck={false}
                />
              </label>
              <label>
                <span>{t("notes.setup.folder")}</span>
                <input
                  type="text"
                  value={folder}
                  onChange={(event) => setFolder(event.target.value)}
                  placeholder={t("notes.setup.folder.placeholder")}
                  spellCheck={false}
                />
              </label>
            </>
          )}
          {error && <p className="notes-error">{error}</p>}
          <button type="button" className="notes-primary" onClick={connect}>
            {t("notes.setup.connect")}
          </button>
          <button type="button" className="notes-plain" onClick={() => setAdvanced((v) => !v)}>
            {advanced ? t("notes.setup.hideadvanced") : t("notes.setup.advanced")}
          </button>
        </div>
      )}

      {view === "edit" && (
        <div className={"notes-editor size-" + fontSize}>
          {recent && recent.length > 1 && (
            <div className="notes-recent" aria-label={t("notes.recent.aria")}>
              {recent.map((f) => (
                <button
                  key={f}
                  type="button"
                  className={f === activeFile ? "current" : ""}
                  onClick={() => void openNote(f)}
                >
                  {prettyName(f)}
                </button>
              ))}
            </div>
          )}
          <div className="notes-editor-bar">
            <strong>{activeFile ? prettyName(activeFile) : t("notes.today")}</strong>
            <span className="bar-side">
              <em>
                {(() => {
                  const w = countWords(content);
                  if (w <= 0) return "";
                  // the exact price of the next floor, spelled out
                  const f = floorsOf(w);
                  let need = 0;
                  for (let probe = w + 1; probe <= w + 800; probe += 1) {
                    if (floorsOf(probe) > f) {
                      need = probe - w;
                      break;
                    }
                  }
                  const tonight = Math.floor(Math.min(105, wordWatts(w)) + 28);
                  return (
                    `${w}${t("notes.wordunit")} · ` +
                    (need > 0 ? `${t("notes.floor.pre")}${need}${t("notes.floor.post")} · ` : "") +
                    `${t("notes.tonight")}${tonight}W · `
                  );
                })()}
                {statusLabel}
              </em>
              {connected && activeFile && (
                <button
                  type="button"
                  className="bar-obsidian"
                  onClick={() => {
                    void clientRef.current?.openInObsidian(activeFile).catch(() => {});
                    // the REST call opens the note; the protocol brings
                    // Obsidian itself to the front (macOS won't focus an
                    // app for a background request)
                    window.setTimeout(() => {
                      window.location.href = "obsidian://open";
                    }, 150);
                  }}
                  aria-label={t("notes.openinobsidian")}
                  title={t("notes.openinobsidian")}
                >
                  ↗
                </button>
              )}
            </span>
          </div>
          {conflict && (
            <div className="notes-conflict" role="alert">
              <span>{t("notes.conflict.message")}</span>
              <span className="conflict-actions">
                <button type="button" onClick={resolveTheirs}>
                  {t("notes.conflict.theirs")}
                </button>
                <button type="button" onClick={() => void resolveMine()}>
                  {t("notes.conflict.mine")}
                </button>
                <button type="button" onClick={() => void resolveBoth()}>
                  {t("notes.conflict.both")}
                </button>
              </span>
            </div>
          )}
          <div className="notes-tools" aria-label="Formatting">
            <button
              type="button"
              onClick={() => editorRef.current?.toggle("list")}
              aria-label={t("notes.tool.list")}
            >
              •–
            </button>
            <button
              type="button"
              onClick={() => editorRef.current?.toggle("todo")}
              aria-label={t("notes.tool.todo")}
            >
              ☑
            </button>
            <button
              type="button"
              onClick={() => editorRef.current?.toggle("heading")}
              aria-label={t("notes.tool.heading")}
            >
              H
            </button>
            <span className="tools-hint">{t("notes.tool.hint")}</span>
            <span className="tools-gap" />
            <button type="button" onClick={cycleFontSize} aria-label={t("notes.tool.size")}>
              aA
            </button>
          </div>
          {backlinks && backlinks.length > 0 && (
            <div className="notes-backlinks">
              <span>{t("notes.backlinks")}</span>
              {backlinks.map((f) => (
                <button key={f} type="button" onClick={() => void openNote(f)}>
                  {f.replace(/\.md$/, "")}
                </button>
              ))}
            </div>
          )}
          <MarkdownEditor
            lang={lang}
            templates={templates}
            onOpenTag={onOpenTag}
            onOpenPage={(name) => {
              const file = name.endsWith(".md") ? name : `${name}.md`;
              void openNote(file);
            }}
            value={content}
            channelName=""
            pages={pages}
            placeholder={t("notes.editor.placeholder")}
            onChange={handleChange}
            onBlur={() => void flushSave()}
            onReady={(api) => {
              editorRef.current = api;
            }}
          />
          {error && view === "edit" && <p className="notes-error">{error}</p>}
          {!connected && (
            <button
              type="button"
              className="notes-plain notes-connect"
              onClick={() => setView("setup")}
            >
              {t("notes.connectcta")}
            </button>
          )}
        </div>
      )}
    </aside>
  );
}
