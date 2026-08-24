"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  DEFAULT_OBSIDIAN_URL,
  ObsidianClient,
  loadConfig,
  saveConfig,
} from "../lib/obsidian";
import type { ObsidianConfig } from "../lib/obsidian";
import { migrateLegacyDraft } from "../lib/drafts";
import { countWords } from "../lib/city/metrics";
import { CABINET_ICON } from "../lib/game/icons";
import { PixelIcon } from "./pixel-icon";
import { floorsOf } from "../lib/city/plan";
import { wordWatts } from "../lib/game/watts";
import { MarkdownEditor } from "./editor";
import type { EditorApi } from "./editor";
import { createDocStore, newNoteName } from "../lib/notes/doc-store";
import type { DocStore } from "../lib/notes/doc-store";

type View = "setup" | "edit";

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

function prettyName(file: string) {
  const daily = file.match(/^(\d{4})-(\d{2})-(\d{2}) (Today|Tonight)\.md$/);
  if (daily) return `${MONTHS[Number(daily[2]) - 1]} ${Number(daily[3])} · Today`;
  const m = file.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2})\.(\d{2})\.md$/);
  if (!m) return file.replace(/\.md$/, "");
  return `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])} · ${m[4]}:${m[5]}`;
}

export function NotesPanel({
  open,
  onClose,
  onPin,
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
  onPin?: (text: string) => void;
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
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [connected, setConnected] = useState(false);
  const [url, setUrl] = useState(isSafari && !isIOS ? SAFARI_OBSIDIAN_URL : DEFAULT_OBSIDIAN_URL);
  const [key, setKey] = useState("");
  const [folder, setFolder] = useState("");
  const [advanced, setAdvanced] = useState(false);
  /** connection/setup errors live here (already translated); document
   *  errors live in the store as keys — the render merges the two */
  const [error, setError] = useState<string | null>(null);
  const [fontSize, setFontSize] = useState<FontSize>("m");

  /* Everything that opens, edits, saves or rescues a page lives in the
     doc store — one atomic tuple, one in-flight lock, one debounce. The
     component renders snapshots and forwards intents; it never assembles
     a save payload. That separation IS the 8/21 fix, made structural. */
  const [store] = useState<DocStore>(createDocStore);
  const snap = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const { file: activeFile, content, status, conflict } = snap;

  const clientRef = useRef<ObsidianClient | null>(null);
  const openedRef = useRef(false);
  const requestSeenRef = useRef(0);
  const editorRef = useRef<EditorApi | null>(null);

  useEffect(() => {
    store.setCallbacks({ onSaved, onWords });
  }, [store, onSaved, onWords]);

  useEffect(() => () => store.dispose(), [store]);

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

  const makeClient = useCallback(
    (config: ObsidianConfig) => {
      clientRef.current = new ObsidianClient(config);
      store.setClient(clientRef.current);
      return clientRef.current;
    },
    [store],
  );

  const checkConnection = useCallback(
    async (client: ObsidianClient, quiet = false) => {
      if (!quiet) {
        store.setStatus("loading", null);
        setError(null);
      }
      try {
        await client.list();
        if (!quiet) store.setStatus("idle");
        setError(null);
        setConnected(true);
        return true;
      } catch {
        setConnected(false);
        if (quiet) return false;
        store.setStatus("error");
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
    },
    [t, store],
  );

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
  useEffect(() => {
    if (!open || connected || view === "setup" || isIOS) return;
    const id = window.setInterval(() => {
      const client = clientRef.current;
      if (!client || document.hidden) return;
      void checkConnection(client, true).then((ok) => {
        if (ok && store.getSnapshot().dirty) void store.flush();
      });
    }, 8000);
    return () => window.clearInterval(id);
  }, [open, connected, view, checkConnection, store]);

  const cursorSoon = useCallback((delay: number) => {
    window.setTimeout(() => editorRef.current?.cursorToEnd(), delay);
  }, []);

  const openTonight = useCallback(async () => {
    setView("edit");
    await store.openToday();
    cursorSoon(250);
  }, [store, cursorSoon]);

  const todaySeenRef = useRef(0);
  useEffect(() => {
    if (!requestToday || requestToday === todaySeenRef.current) return;
    todaySeenRef.current = requestToday;
    void openTonight();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestToday]);

  const openNote = useCallback(
    async (name: string) => {
      setView("edit");
      await store.open(name);
    },
    [store],
  );

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
      if (cancelled) return;
      const config = loadConfig();
      if (config) {
        setUrl(config.url);
        setKey(config.key);
        setFolder(config.folder);
        const client = makeClient(config);
        setConnected(true);
        void checkConnection(client);
      }
      const resumed = await store.resume();
      if (cancelled) return;
      if (resumed) {
        setView("edit");
        cursorSoon(250);
      } else {
        void openTonight();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, makeClient, checkConnection, openTonight, store, cursorSoon]);

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
      if (store.hasUnsentWords()) {
        setView("edit");
      } else {
        void openTonight();
      }
    });
  }, [url, key, folder, makeClient, checkConnection, onConnected, openTonight, store, t]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) void store.flush();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [store]);

  const newPage = useCallback(() => {
    store.newPage();
    setView("edit");
    cursorSoon(150);
  }, [store, cursorSoon]);

  const handleClose = useCallback(() => {
    void store.flush();
    onClose();
  }, [store, onClose]);

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

  const shownError = error ?? (snap.errorKey ? t(snap.errorKey) : null);

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
          {shownError && <p className="notes-error">{shownError}</p>}
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
            <div className="notes-tabs-row">
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
              {(pages?.length ?? 0) > 0 && (
                <span className="archive-anchor">
                  <button
                    type="button"
                    className="notes-archive-btn"
                    onClick={() => setArchiveOpen((v) => !v)}
                    aria-label={t("notes.archive")}
                    title={t("notes.archive")}
                  >
                    <PixelIcon rows={CABINET_ICON} size={18} />
                  </button>
                  {archiveOpen && (
                    <div className="notes-archive" role="dialog" aria-label={t("notes.archive")}>
              {(() => {
                const groups = new Map<string, string[]>();
                for (const f of pages ?? []) {
                  const m = f.match(/^(\d{4}-\d{2})/);
                  const key2 = m ? m[1] : "…";
                  groups.set(key2, [...(groups.get(key2) ?? []), f]);
                }
                return [...groups.entries()]
                  .sort((a, b) => (a[0] < b[0] ? 1 : -1))
                  .map(([month, files]) => (
                    <div key={month} className="archive-month">
                      <em>{month}</em>
                      {files
                        .sort((a, b) => (a < b ? 1 : -1))
                        .map((f) => (
                          <button
                            key={f}
                            type="button"
                            onClick={() => {
                              setArchiveOpen(false);
                              void openNote(f);
                            }}
                          >
                            {prettyName(f)}
                          </button>
                        ))}
                    </div>
                  ));
              })()}
                    </div>
                  )}
                </span>
              )}
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
                <button type="button" onClick={() => store.resolveTheirs()}>
                  {t("notes.conflict.theirs")}
                </button>
                <button type="button" onClick={() => void store.resolveMine()}>
                  {t("notes.conflict.mine")}
                </button>
                <button type="button" onClick={() => void store.resolveBoth()}>
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
            {onPin && (
              <button
                type="button"
                onClick={() => onPin(editorRef.current?.getSelection() ?? "")}
                aria-label={t("notes.tool.pin")}
                title={t("notes.tool.pin")}
              >
                {t("notes.tool.pin.icon")}
              </button>
            )}
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
            docVersion={snap.docVersion}
            channelName=""
            pages={pages}
            placeholder={t("notes.editor.placeholder")}
            onChange={(next) => store.edit(next)}
            onBlur={() => void store.flush()}
            onReady={(api) => {
              editorRef.current = api;
            }}
          />
          {shownError && view === "edit" && <p className="notes-error">{shownError}</p>}
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
