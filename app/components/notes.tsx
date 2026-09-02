"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  DEFAULT_OBSIDIAN_URL,
  ObsidianClient,
  clearConfig,
  saveConfig,
} from "../lib/obsidian";
import type { ObsidianConfig } from "../lib/obsidian";
import { resolveBridge, regrantFolder } from "../lib/bridge";
import type { VaultBridge } from "../lib/bridge/types";
import { BRIDGE_MODE_KEY, loadBridgeMode, saveBridgeMode } from "../lib/bridge/types";
import { buildFsBridge } from "../lib/bridge/fs-bridge";
import { opfsAvailable, opfsStore } from "../lib/bridge/opfs";
import { fsapiAvailable, pickFolder, fsapiStore, forgetHandle } from "../lib/bridge/fsapi";
import { nativeAvailable, pickVaultFolder, forgetVaultFolder } from "../lib/bridge/native";
import { logDebug } from "../lib/debuglog";
import { loadConfig } from "../lib/obsidian";
import { migrateLegacyDraft } from "../lib/drafts";
import { countWords } from "../lib/city/metrics";
import { CABINET_ICON } from "../lib/game/icons";
import { PixelIcon } from "./pixel-icon";
import { floorsOf } from "../lib/city/plan";
import { wordWatts } from "../lib/game/watts";
import { MarkdownEditor } from "./editor";
import type { EditorApi } from "./editor";
import { createDocStore, isSealed, newNoteName, todayStamp } from "../lib/notes/doc-store";
import { PageTurn } from "./page-turn";
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



/**
 * Choosing a folder of your own is built and works in the simulator, but
 * not one line of it has been proven on a real device with real iCloud:
 * whether a bookmark survives a reboot, what an undownloaded page looks
 * like on disk, whether the download call needs an entitlement. Until
 * that list is walked on hardware, v1 offers the one road that has been
 * proven end to end — the app's own Documents folder. Flip this to true
 * for v1.1 and the cards come back; nothing else has to change.
 */
const FOLDER_PICKING_SHIPPED = false;

const noSubscription = () => () => {};
const readNotebookFlag = () => !new URLSearchParams(window.location.search).has("oldnotes");

/** flag label: just the day — the flag is small, the title says the rest */
function shortLabel(file: string) {
  const m = file.match(/^\d{4}-\d{2}-(\d{2})/);
  if (m) return String(Number(m[1]));
  return file.replace(/\.md$/, "").slice(-3);
}

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
  plusDisabled,
  lockAll,
  pages,
  onConnected,
  cityLive,
  onWords,
  onSaved,
  onActiveFile,
  onPutAway,
  requestArchive,
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
  /** two pages already written tonight — the plus goes quiet */
  plusDisabled?: boolean;
  /** the demo's museum glass: everything opens, nothing edits */
  lockAll?: boolean;
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
  /** the notebook was deliberately put away for the day — the city answers */
  onPutAway?: (file: string | null) => void;
  /** bumped by the compass: open the book straight onto the archive */
  requestArchive?: number;
  t: (key: string) => string;
}) {
  const [view, setView] = useState<View>("edit");
  /* The notebook skin is the product now; ?oldnotes keeps the plain panel
     as an escape hatch. Read via useSyncExternalStore so the server
     (which knows no URL) and the client hydrate without mismatch. */
  const notebookSkin = useSyncExternalStore(
    noSubscription,
    readNotebookFlag,
    () => false,
  );
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

  const clientRef = useRef<VaultBridge | null>(null);
  /* render-safe mirror of a bridge capability — refs must not be read in JSX */
  const [canObsidian, setCanObsidian] = useState(false);
  /* setup card: first the three roads, then (optionally) the plugin form */
  const [setupMode, setSetupMode] = useState<"choose" | "rest">("choose");
  /* fsapi: a folder is remembered but the browser wants a click first */
  const [needsPermission, setNeedsPermission] = useState(false);
  const openedRef = useRef(false);
  const requestSeenRef = useRef(0);
  const archiveSeenRef = useRef(0);
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
      saveBridgeMode("rest");
      setCanObsidian(true);
      store.setClient(clientRef.current);
      return clientRef.current;
    },
    [store],
  );

  const checkConnection = useCallback(
    async (client: VaultBridge, quiet = false) => {
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
          const h = await client.health?.();
          if (h && h.ok && !h.authenticated) {
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

  /* While the panel is open, quietly retry every 8 s and push any waiting
     words the moment the road clears. This runs on the phone too now: a
     page that answered "still coming down from iCloud" is usually there a
     few seconds later, and without a retry that save would simply be lost
     until the writer happened to type again. Words the store is still
     holding count as a reason to retry, even when the link looks fine —
     a failed write never lowers `connected`. */
  useEffect(() => {
    if (!open || view === "setup") return;
    if (connected && !store.getSnapshot().dirty) return;
    const id = window.setInterval(() => {
      const client = clientRef.current;
      if (!client || document.hidden) return;
      void checkConnection(client, true).then((ok) => {
        if (ok && store.getSnapshot().dirty) void store.flush();
      });
    }, 8000);
    return () => window.clearInterval(id);
  }, [open, connected, view, checkConnection, store, snap.dirty]);

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
    // opened FOR a specific page (a building, the archive)? that request
    // owns this opening — resume/today must not race it
    const claimed =
      (requestOpen && requestOpen.n !== requestSeenRef.current) ||
      (requestArchive && requestArchive !== archiveSeenRef.current);
    let cancelled = false;
    void (async () => {
      await migrateLegacyDraft(newNoteName);
      if (cancelled) return;
      const resolved = await resolveBridge();
      if (cancelled) return;
      // Always mirror the saved config into the form, whichever bridge
      // answered. Gating this on mode meant the folder box could sit empty
      // while a folder was configured — and connect() writes the box back,
      // so one press would silently move every future page to the vault
      // root, leaving the old ones behind in a folder nothing writes to.
      const saved = loadConfig();
      if (saved) {
        setUrl(saved.url);
        setKey(saved.key);
        setFolder(saved.folder);
      }
      if (resolved.needsPermission) setNeedsPermission(true);
      if (resolved.bridge) {
        clientRef.current = resolved.bridge;
        setCanObsidian(!!resolved.bridge.openInObsidian);
        store.setClient(resolved.bridge);
        setConnected(true);
        void checkConnection(resolved.bridge);
      }
      if (claimed) return;
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
  }, [open, makeClient, checkConnection, openTonight, store, cursorSoon, requestOpen, requestArchive]);

  /* open a specific building */
  useEffect(() => {
    if (!requestOpen || requestOpen.n === requestSeenRef.current) return;
    requestSeenRef.current = requestOpen.n;
    void openNote(requestOpen.file);
  }, [requestOpen, openNote]);

  /* a live bridge was chosen or revived — the notebook takes it as-is */
  const adoptBridge = useCallback(
    (bridge: VaultBridge) => {
      clientRef.current = bridge;
      setCanObsidian(!!bridge.openInObsidian);
      store.setClient(bridge);
      setConnected(true);
      setNeedsPermission(false);
      setError(null);
      onConnected?.();
      if (store.hasUnsentWords()) setView("edit");
      else void openTonight();
    },
    [store, onConnected, openTonight],
  );

  const handleOpfs = useCallback(() => {
    saveBridgeMode("opfs");
    adoptBridge(buildFsBridge(opfsStore()));
  }, [adoptBridge]);

  const handlePickFolder = useCallback(async () => {
    const handle = await pickFolder();
    if (!handle) return; // user closed the picker — nothing changes
    saveBridgeMode("fsapi");
    const dest = fsapiStore(handle);
    /* Moving day: pages from the local bookcase follow into the folder.
       A folder we cannot read is NOT an empty folder — believing that
       would pour our whole bookcase into a vault that already holds years
       of someone's writing. And every landing goes through the guard, so
       even a name we think is free is checked before it is used. */
    const bridge = buildFsBridge(dest);
    try {
      if (opfsAvailable()) {
        const have = new Set(await bridge.list()); // throws → no move at all
        const src = opfsStore();
        for (const name of await src.list()) {
          if (have.has(name)) continue;
          const doc = await src.read(name);
          if (!doc || doc.text.trim() === "") continue;
          const res = await bridge.writeGuarded(name, doc.text, null, null);
          if (!res.ok) logDebug("move", `${name}: ${res.reason}`);
        }
      }
    } catch (err) {
      logDebug("move", `stopped: ${String(err).slice(0, 60)}`);
    }
    adoptBridge(bridge);
  }, [adoptBridge]);

  /* the shell's repair is to choose again — there is no silent handle to
     re-grant, and we refuse to write anywhere but the folder they meant */
  const handlePickNative = useCallback(async () => {
    const picked = await pickVaultFolder();
    if (!picked) return;
    const resolved = await resolveBridge();
    if (resolved.bridge) adoptBridge(resolved.bridge);
  }, [adoptBridge]);

  const handleUseOwnFolder = useCallback(async () => {
    await forgetVaultFolder();
    const resolved = await resolveBridge();
    if (resolved.bridge) adoptBridge(resolved.bridge);
  }, [adoptBridge]);

  const handleRegrant = useCallback(async () => {
    if (nativeAvailable()) {
      await handlePickNative();
      return;
    }
    const bridge = await regrantFolder();
    if (bridge) adoptBridge(bridge);
  }, [adoptBridge, handlePickNative]);

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
    if (plusDisabled || lockAll) return;
    store.newPage();
    setView("edit");
    cursorSoon(150);
  }, [store, cursorSoon, plusDisabled, lockAll]);

  const handleClose = useCallback(() => {
    void store.flush();
    onClose();
  }, [store, onClose]);

  /* Closing the book is the day's full stop: the words land FIRST, then
     the cover closes — the animation reads the store, never delays it. */
  const [closing, setClosing] = useState(false);

  /* the notebook arrives closed, front and centre; tapping it opens it.
     Render-phase adjust: when the panel closes, the next opening finds
     the cover shut again. */
  const [bookNav, setBookNav] = useState<{ wasOpen: boolean; book: boolean }>({
    wasOpen: false,
    book: false,
  });
  if (bookNav.wasOpen !== open) {
    setBookNav({ wasOpen: open, book: open ? true : bookNav.book });
    if (open) {
      if (closing) setClosing(false);
      if (archiveOpen) setArchiveOpen(false);
      if (notebookSkin && view === "setup") setView("edit");
    }
  }
  const bookOpen = bookNav.book;
  const setBookOpen = useCallback((v: boolean) => {
    setBookNav((cur) => ({ ...cur, book: v }));
  }, []);

  useEffect(() => {
    if (!requestArchive || requestArchive === archiveSeenRef.current) return;
    archiveSeenRef.current = requestArchive;
    setView("edit");
    setBookOpen(false); // flip through the files first; the book waits
    setArchiveOpen(true);
  }, [requestArchive, setBookOpen]);

  useEffect(() => {
    if (!open || !notebookSkin || view !== "edit") return;
    const onKey = (e: KeyboardEvent) => {
      // an IME uses Escape to cancel a candidate — never steal it mid-word
      if (e.key === "Escape" && !e.isComposing) handleClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, notebookSkin, view, handleClose]);


  const handlePutAway = useCallback(async () => {
    if (closing) return;
    setClosing(true);
    await store.flush();
    const file = store.getSnapshot().file;
    const reduced =
      typeof window.matchMedia !== "function" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.setTimeout(
      () => {
        // 'closing' stays on through the fade-out — resetting it here made
        // the book snap back for one visible frame; the next opening resets
        onClose();
        onPutAway?.(file);
      },
      reduced ? 0 : 520,
    );
  }, [closing, store, onClose, onPutAway]);

  /* a light page-flip when browsing to a DIFFERENT page (never on typing:
     the trigger is file adoption, which typing can't cause) */
  const [flip, setFlip] = useState<{ file: string | null; n: number }>({ file: null, n: 0 });
  if (flip.file !== activeFile) {
    setFlip((prev) => ({ file: activeFile, n: prev.file === null ? prev.n : prev.n + 1 }));
  }

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

  /* past days are the record, not the draft: sealed here, editable only
     in Obsidian itself */
  const sealed = Boolean(lockAll) || (notebookSkin && isSealed(activeFile, todayStamp()));

  return (
    <aside
      className={"notes-panel" + (notebookSkin ? " notebook" : "") + (closing ? " closing" : "")}
      aria-label="Notes"
      aria-hidden={!open}
      inert={!open}
      onClick={(e) => {
        if (!notebookSkin || e.target !== e.currentTarget) return;
        if (view === "edit" && bookOpen) void handlePutAway();
        else handleClose();
      }}
    >
      {!notebookSkin && (
      <div className="panel-heading">
        <span>{view === "setup" ? t("notes.vault.title") : ""}</span>
        <div className="notes-heading-actions">
          {view !== "setup" && (
            <button type="button" className="notes-gear" disabled={plusDisabled} onClick={newPage} aria-label={t("notes.newpage")} title={t("notes.newpage")}>
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
          <button
            type="button"
            onClick={() => {
              if (notebookSkin && bookOpen && view === "edit") void handlePutAway();
              else handleClose();
            }}
            aria-label={t("common.close")}
          >
            ×
          </button>
        </div>
      </div>
      )}

      {view === "setup" && (
        <div
          className="setup-stage"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleClose();
          }}
        >
          {isIOS ? (
        <div className="notes-setup">
          <p className="notes-help">{t("notes.setup.ios")}</p>
          <button type="button" className="notes-primary" onClick={onClose}>
            {t("notes.setup.ios.ok")}
          </button>
        </div>
          ) : setupMode === "choose" ? (
        <div className="notes-setup">
          {needsPermission && (
            <button type="button" className="notes-primary" onClick={() => void handleRegrant()}>
              {t("notes.setup.regrant")}
            </button>
          )}
          <p className="notes-help">{t("notes.setup.choose")}</p>
          <div className="setup-cards">
            {nativeAvailable() && FOLDER_PICKING_SHIPPED && (
              <>
                <button type="button" className="setup-card" onClick={() => void handlePickNative()}>
                  <strong>{t("notes.setup.card.pick")}</strong>
                  <span>{t("notes.setup.card.pick.desc")}</span>
                </button>
                <button type="button" className="setup-card" onClick={() => void handleUseOwnFolder()}>
                  <strong>{t("notes.setup.card.own")}</strong>
                  <span>{t("notes.setup.card.own.desc")}</span>
                </button>
              </>
            )}
            {!nativeAvailable() && fsapiAvailable() && (
              <button type="button" className="setup-card" onClick={() => void handlePickFolder()}>
                <strong>{t("notes.setup.card.folder")}</strong>
                <span>{t("notes.setup.card.folder.desc")}</span>
              </button>
            )}
            {!nativeAvailable() && (
              <>
                <button type="button" className="setup-card" onClick={() => setSetupMode("rest")}>
                  <strong>{t("notes.setup.card.rest")}</strong>
                  <span>{t("notes.setup.card.rest.desc")}</span>
                </button>
                <button type="button" className="setup-card" onClick={handleOpfs}>
                  <strong>{t("notes.setup.card.opfs")}</strong>
                  <span>{t("notes.setup.card.opfs.desc")}</span>
                </button>
              </>
            )}
          </div>
          {(loadBridgeMode() !== null || loadConfig() !== null) && (
            <button
              type="button"
              className="notes-plain notes-forget"
              onClick={() => {
                clearConfig();
                try {
                  window.localStorage.removeItem(BRIDGE_MODE_KEY);
                } catch {}
                void forgetHandle().finally(() => window.location.reload());
              }}
            >
              {t("notes.setup.forget")}
            </button>
          )}
        </div>
          ) : (
        <div className="notes-setup">
          <p className="notes-help">{t("notes.setup.help")}</p>
          <ol className="notes-steps">
            <li>
              <a href="https://obsidian.md" target="_blank" rel="noreferrer">
                {t("notes.setup.step1")} ↗
              </a>
            </li>
            <li>
              <a
                href="https://obsidian.md/plugins?id=obsidian-local-rest-api"
                target="_blank"
                rel="noreferrer"
              >
                {t("notes.setup.step2")} ↗
              </a>
            </li>
            <li>{t("notes.setup.step3")}</li>
          </ol>
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
          <p className="notes-keynote">{t("notes.setup.keynote")}</p>
          {shownError && <p className="notes-error">{shownError}</p>}
          <button type="button" className="notes-primary" onClick={connect}>
            {t("notes.setup.connect")}
          </button>
          <button type="button" className="notes-plain" onClick={() => setSetupMode("choose")}>
            {t("notes.setup.back")}
          </button>
          <button type="button" className="notes-plain" onClick={() => setAdvanced((v) => !v)}>
            {advanced ? t("notes.setup.hideadvanced") : t("notes.setup.advanced")}
          </button>
        </div>
          )}
        </div>
      )}

      {view === "edit" && notebookSkin && archiveOpen && !bookOpen && (
        <div className="archive-stand" role="dialog" aria-label={t("notes.archive")}>
          <div className="archive-head">
            <strong>{t("notes.archive")}</strong>
            <button
              type="button"
              className="archive-close"
              onClick={handleClose}
              aria-label={t("common.close")}
            >
              ×
            </button>
          </div>
          {(() => {
            // shelved by month, newest on top; pages with no date in
            // their name gather on the loose-pages shelf at the bottom
            const groups = new Map<string, string[]>();
            for (const f of pages ?? []) {
              const m2 = f.match(/^(\d{4}-\d{2})/);
              const key2 = m2 ? m2[1] : "";
              groups.set(key2, [...(groups.get(key2) ?? []), f]);
            }
            return [...groups.entries()]
              .sort((a, b) =>
                a[0] === "" ? 1 : b[0] === "" ? -1 : a[0] < b[0] ? 1 : -1,
              )
              .map(([month, files]) => (
                <div key={month || "loose"} className="archive-month">
                  <em>{month || t("notes.archive.loose")}</em>
                  {files
                    .sort((a, b) => (a < b ? 1 : -1))
                    .map((f) => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => {
                          setArchiveOpen(false);
                          setBookOpen(true); // found it — NOW the book opens
                          void openNote(f);
                        }}
                      >
                        {prettyName(f)}
                      </button>
                    ))}
                </div>
              ));
          })()}
          <p className="archive-note">
            {t(nativeAvailable() ? "notes.sealed.native" : "notes.sealed")}
          </p>
        </div>
      )}
      {view === "edit" && (!notebookSkin || bookOpen) && (
        <div className={"notes-editor size-" + fontSize}>
          <button
            type="button"
            className="book-close"
            onClick={() => {
              if (notebookSkin && bookOpen && view === "edit") void handlePutAway();
              else handleClose();
            }}
            aria-label={t("common.close")}
          >
            ×
          </button>
          {(notebookSkin || (recent && recent.length > 1)) && (
            <div className="notes-tabs-row">
            <div className="notes-recent" aria-label={t("notes.recent.aria")}>
              {notebookSkin && (
                <button
                  type="button"
                  className="tab-plus"
                  disabled={plusDisabled}
                  onClick={newPage}
                  aria-label={t("notes.newpage")}
                  title={t("notes.newpage")}
                >
                  +
                </button>
              )}
              {(recent ?? []).slice(0, notebookSkin ? 5 : undefined).map((f) => (
                <button
                  key={f}
                  type="button"
                  className={f === activeFile ? "current" : ""}
                  onClick={() => void openNote(f)}
                  title={prettyName(f)}
                >
                  {notebookSkin ? shortLabel(f) : prettyName(f)}
                </button>
              ))}
            </div>
              {!notebookSkin && (pages?.length ?? 0) > 0 && (
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
          <div className="book">
          <div className="book-page-left">
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
              {connected && activeFile && canObsidian && (
                <button
                  type="button"
                  className="bar-obsidian"
                  onClick={() => {
                    void clientRef.current?.openInObsidian?.(activeFile).catch(() => {});
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
          <div className={"notes-tools" + (lockAll ? " tools-locked" : "")} aria-label="Formatting">
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
          {!connected && !isIOS && (
            <em className="page-sealed">
              {t("notes.unsynced")}
              {needsPermission && (
                <button type="button" className="page-regrant" onClick={() => void handleRegrant()}>
                  {t("notes.setup.regrant")}
                </button>
              )}
            </em>
          )}
          {shownError && view === "edit" && <p className="notes-error">{shownError}</p>}
          {/* in the shell there is exactly one place pages can live, so the
              vault button only appears where there is a choice to make —
              or a folder grant to repair */}
          {notebookSkin &&
            (!nativeAvailable() || FOLDER_PICKING_SHIPPED || needsPermission) && (
            <button
              type="button"
              className="page-gear"
              disabled={lockAll}
              onClick={() => setView("setup")}
              aria-label={t("notes.settings.aria")}
            >
              ⚙ {t("notes.vault.title")}
            </button>
          )}
          {!connected && (
            <button
              type="button"
              className="notes-plain notes-connect"
              disabled={lockAll}
              onClick={() => setView("setup")}
            >
              {t("notes.connectcta")}
            </button>
          )}
          </div>
          <div className="book-page-right">
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
          <MarkdownEditor
            lang={lang}
            templates={templates}
            onOpenTag={onOpenTag}
            onOpenPage={(name) => {
              const file = name.endsWith(".md") ? name : `${name}.md`;
              void openNote(file);
            }}
            value={content}
            readOnly={sealed}
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
          {notebookSkin && <PageTurn trigger={flip.n} />}
          </div>
          </div>
        </div>
      )}
    </aside>
  );
}
