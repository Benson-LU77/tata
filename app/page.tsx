"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { City3D } from "./components/city3d";
import { NotesPanel } from "./components/notes";
import { Hum } from "./lib/hum";
import { planCity } from "./lib/city/plan";
import { CityMinimap } from "./components/city-minimap";
import { DebugPanel } from "./components/debug-panel";
import { demoMetrics, loadCityMetrics, dateOf } from "./lib/city/metrics";
import type { NoteMetric } from "./lib/city/metrics";
import { loadConfig } from "./lib/obsidian";
import { resolveBridge } from "./lib/bridge";
import { zipSync, unzipSync, strToU8, strFromU8 } from "fflate";
import { logDebug } from "./lib/debuglog";
import type { VaultBridge } from "./lib/bridge/types";
import { cityCache } from "./lib/drafts";
import { bestStreakOf, earnedWatts, levelFromWatts, levelProgress, orderBonus, skylineCap, streakBonus, streakOf, workOrders } from "./lib/game/watts";
import { dateAtCell, floorsOf } from "./lib/city/plan";
import { CATALOG, EMPTY_STATE, loadGameState, saveGameState } from "./lib/game/shop";
import type { GameState } from "./lib/game/shop";
import { greet, remember, tierOf, nameOf, lineFor, tierName, type Tier, type Topic } from "./lib/game/bonds";
import type { CreatureKind } from "./lib/city/residents";
import { creaturesFor } from "./lib/city/residents";
import { hash32 } from "./lib/city/layout";
import { MirrorPanel } from "./components/mirror";
import { composeCitizens, professionOf } from "./lib/city/npc";
import {
  COMMISSION_CATALOG,
  commissionDef,
  letterBody,
  monthlyLetterBody,
  progressOf,
  resolveCommissions,
} from "./lib/game/commissions";
import { PET_ACTIONS, QUEST_LINES } from "./lib/game/bonds-lines";
import { repliesFor, closerFor, type ReplyDef } from "./lib/game/replies";
import { nativeAvailable } from "./lib/bridge/native";
import { allShadows } from "./lib/bridge/shadow";
import { iconOf, BACKPACK_ICON, MIRROR_ICON, COMPASS_RING, DEPOT_PX, REGISTRY_PX, CABINET_ICON } from "./lib/game/icons";
import { AMBER_PAL, PixelIcon } from "./components/pixel-icon";
import { composeYou } from "./lib/city/sprites/compose";
import { loadLang, saveLang, makeT } from "./lib/i18n";
import type { Lang } from "./lib/i18n";

/** frozen archetype verdicts — module-level so render stays pure while the
 *  map quietly grows; persisted to localStorage after each plan */
/* the compass draws in the city's own greys */
const BOOK_PAL_PAGE = ["#06070a", "#0d0f13", "#171a20", "#2a2e36", "#4a4f59", "#8b9099", "#e0a84f", "#f2f3f5"];

const ARCH_PINS: Record<string, number> = (() => {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem("tata.archpins") ?? "{}") as Record<string, number>;
  } catch {
    return {};
  }
})();

const HUM_KEY = "yeyufm.hum";
const CHIME_KEY = "yeyufm.chime";

/* a nine-pixel compass rose for the summon button */
const COMPASS_ROSE = [
  "....6....",
  "....6....",
  "..6.6.6..",
  "...666...",
  "66655666.",
  "...666...",
  "..6.6.6..",
  "....6....",
  "....6....",
];

export default function Home() {
  const [metrics, setMetrics] = useState<NoteMetric[]>([]);
  const [isDemoCity, setIsDemoCity] = useState(false);

  const [nowTs, setNowTs] = useState(0);
  const [intro, setIntro] = useState(false);
  const [introDone, setIntroDone] = useState(false);
  const [writeOpen, setWriteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hover, setHover] = useState<{ file: string; x: number; y: number } | null>(null);
  const [focusFile, setFocusFile] = useState<string | null>(null);
  const [requestOpen, setRequestOpen] = useState<{ file: string; n: number } | null>(null);
  const [requestToday, setRequestToday] = useState(0);
  const [requestArchive, setRequestArchive] = useState(0);
  const [uiVisible, setUiVisible] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [canFullscreen, setCanFullscreen] = useState(true);
  const [humOn, setHumOn] = useState(false);
  const [chimeOn, setChimeOn] = useState(true);
  const [synced, setSynced] = useState<"live" | "cached" | "local">("local");
  const [gl3d, setGl3d] = useState(true);
  const [shopOpen, setShopOpen] = useState(false);
  /* the depot counter: one tile is picked, its line and its verb wait below */
  const [depotPick, setDepotPick] = useState<string | null>(null);
  /* feedback: written here, carried by the visitor's own mail */
  const [fbOpen, setFbOpen] = useState(false);
  const [fbText, setFbText] = useState("");
  const [fbNote, setFbNote] = useState<string | null>(null);
  const [game, setGame] = useState<GameState>(EMPTY_STATE);
  const [searchHits, setSearchHits] = useState<Set<string> | null>(null);
  const [monthIx, setMonthIx] = useState(-1);
  const [goMonth, setGoMonth] = useState<{ x: number; z: number; n: number } | null>(null);
  const [requestSetup, setRequestSetup] = useState(0);
  const [zen, setZen] = useState(false);
  const [ceremony, setCeremony] = useState<{ file: string; n: number } | null>(null);
  const [dexOpen, setDexOpen] = useState(false);
  const [mirrorOpen, setMirrorOpen] = useState(false);
  const [monthListOpen, setMonthListOpen] = useState(false);
  const [letterOpen, setLetterOpen] = useState<string | null>(null);
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [foundToast, setFoundToast] = useState(false);
  const [swApply, setSwApply] = useState<(() => void) | null>(null);
  const [touchPick, setTouchPick] = useState<string | null>(null);
  const [moveMode, setMoveMode] = useState<string | null>(null);
  const [idOpen, setIdOpen] = useState(false);
  const [dexPick, setDexPick] = useState<string | null>(null);
  const [neighbourPick, setNeighbourPick] = useState<string | null>(null);
  const [replayOn, setReplayOn] = useState(false);
  const [replayDate, setReplayDate] = useState<string | null>(null);
  const [moveToast, setMoveToast] = useState<string | null>(null);
  const [encounterKey, setEncounterKey] = useState<string | null>(null);
  /* phone: the compass sleeps behind one button until summoned */
  const [compassOpen, setCompassOpen] = useState(false);
  const encTimersRef = useRef<number[]>([]);
  const encStageRef = useRef<"their" | "reply" | "closer" | null>(null);
  const encCloserRef = useRef<string | null>(null);
  /* the second round: what tonight is about, how warm it may get,
     which replies are spent, and whose meeting this is */
  const encTopicRef = useRef<Topic | undefined>(undefined);
  const encTierRef = useRef<Tier>(0);
  const encRoundRef = useRef(1);
  const encUsedRef = useRef<ReplyDef[]>([]);
  const encKeyRef = useRef<string | null>(null);
  const encNameRef = useRef<string>("");
  /* today's favour, read at meeting time — a ref because the quest is
     computed further down the file and the greeting must never hold a
     stale copy of it */
  type Quest = { key: string; seed: number; orderId: string; done: boolean } | null;
  const questRef = useRef<Quest>(null);
  const [bubble, setBubble] = useState<{
    key: string;
    name: string;
    text: string;
    until: number;
    choices?: { label: string; pick: () => void }[];
  } | null>(null);
  const [emote, setEmote] = useState<{ key: string; icon: string; until: number } | null>(null);
  const [lang, setLang] = useState<Lang>("en");
  const t = useMemo(() => makeT(lang), [lang]);

  const humRef = useRef<Hum | null>(null);
  const clientRef = useRef<VaultBridge | null>(null);

  /* every page, plus the city's own tata.json, into one honest zip */
  const exportPages = useCallback(async () => {
    const client = clientRef.current;
    if (!client) return;
    try {
      const files: Record<string, Uint8Array> = {};
      const names = await client.list();
      for (const name of names) {
        try {
          files[name] = strToU8(await client.read(name));
        } catch {}
      }
      try {
        files["tata.json"] = strToU8(await client.read("tata.json"));
      } catch {}
      /* the versions something replaced, carried out with the rest — an
         undo that needs no new machinery, only a door */
      for (const s of await allShadows()) {
        const stamp = new Date(s.at).toISOString().replace(/[:.]/g, "-").slice(0, 19);
        files[`replaced/${s.file.replace(/\.md$/i, "")} ${stamp}.md`] = strToU8(s.content);
      }
      if (Object.keys(files).length === 0) return;
      const blob = new Blob([zipSync(files).slice().buffer], { type: "application/zip" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "tata-pages.zip";
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    } catch (err) {
      logDebug("export", String(err).slice(0, 60));
    }
  }, []);
  const idleTimerRef = useRef<number | null>(null);
  const writeOpenRef = useRef(false);
  const wordsThrottleRef = useRef(0);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const bondSaveTimerRef = useRef<number | null>(null);
  const bondSaveStateRef = useRef<GameState | null>(null);
  const metricsRef = useRef<NoteMetric[]>([]);
  const todayRef = useRef("");

  const hum = useCallback(() => {
    humRef.current ??= new Hum();
    return humRef.current;
  }, []);

  const lastSyncRef = useRef(0);

  /** re-pull metrics from Obsidian; safe to call any time */
  const resync = useCallback(() => {
    if (new URLSearchParams(window.location.search).get("demo")) return;
    lastSyncRef.current = Date.now();
    void loadCityMetrics(clientRef.current, (fresh) => {
      setMetrics(fresh);
      setSynced("live");
    }).then((quick) => {
      setMetrics((prev) => (prev.length > 0 ? prev : quick));
      setSynced((prev) => (prev === "live" ? prev : clientRef.current ? "cached" : "local"));
    });
  }, []);

  /* the way back in: pages from a zip settle only where no page stands */
  const importPages = useCallback(async (file: File) => {
    const client = clientRef.current;
    if (!client) return;
    try {
      const files = unzipSync(new Uint8Array(await file.arrayBuffer()));
      const have = new Set(await client.list());
      let landed = 0;
      for (const [name, data] of Object.entries(files)) {
        if (!name.toLowerCase().endsWith(".md") || name.includes("..")) continue;
        if (have.has(name)) continue; // nothing standing is ever replaced
        const text = strFromU8(data);
        if (text.trim() === "") continue;
        await client.writeOwn(name, text);
        landed += 1;
      }
      logDebug("import", `${landed} pages landed`);
      if (landed > 0) resync();
    } catch (err) {
      logDebug("import", String(err).slice(0, 60));
    }
  }, [resync]);


  /* returning to the app (PWA re-open, tab re-focus) reconnects Obsidian */
  useEffect(() => {
    const wake = () => {
      if (document.hidden) return;
      if (Date.now() - lastSyncRef.current < 15000) return;
      resync();
    };
    window.addEventListener("focus", wake);
    document.addEventListener("visibilitychange", wake);
    return () => {
      window.removeEventListener("focus", wake);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [resync]);

  /* heartbeat: while configured but not live, retry every 10 s on our own —
     opening Tata before Obsidian (or an Obsidian restart) heals itself */
  useEffect(() => {
    if (synced === "live") return;
    const id = window.setInterval(() => {
      if (document.hidden) return;
      if (new URLSearchParams(window.location.search).get("demo")) return;
      if (!loadConfig()) return;
      resync();
    }, 10000);
    return () => window.clearInterval(id);
  }, [synced, resync]);

  /* the link healed on its own: fold the vault's save back in. Without
     this the heartbeat fixed reads but never re-merged, leaving every
     write path broadcasting a state that never saw the vault copy. */
  useEffect(() => {
    if (synced !== "live" || !clientRef.current) return;
    if (new URLSearchParams(window.location.search).get("demo")) return;
    let dropped = false;
    void loadGameState(clientRef.current).then((state) => {
      if (!dropped) setGame(state);
    });
    return () => {
      dropped = true;
    };
  }, [synced]);

  /* the notes panel just connected — adopt the client for the city too */
  const onConnected = useCallback(() => {
    void resolveBridge().then((r) => {
      if (!r.bridge) return;
      clientRef.current = r.bridge;
      resync();
      void loadGameState(r.bridge).then((state) => setGame(state));
    });
  }, [resync]);

  /* ---------- data ---------- */

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let disposed = false;
    const offer = (reg: ServiceWorkerRegistration) => {
      if (!reg.waiting || disposed) return;
      const waiting = reg.waiting;
      setSwApply(() => () => {
        navigator.serviceWorker.addEventListener(
          "controllerchange",
          () => window.location.reload(),
          { once: true },
        );
        waiting.postMessage({ type: "SKIP_WAITING" });
      });
    };
    void navigator.serviceWorker.getRegistration().then((reg) => {
      if (!reg || disposed) return;
      offer(reg);
      reg.addEventListener("updatefound", () => {
        const nw = reg.installing;
        nw?.addEventListener("statechange", () => offer(reg));
      });
    });
    return () => {
      disposed = true;
    };
  }, []);

  // the city's clock ticks by the minute: crossing midnight, commission
  // progress, moon and weather all follow real time on an open page
  useEffect(() => {
    const id = window.setInterval(() => setNowTs(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    void Promise.resolve().then(async () => {
      const now = Date.now();
      setNowTs(now);
      const demo = new URLSearchParams(window.location.search).get("demo");
      if (demo) {
        setIsDemoCity(true);
        setMetrics(demoMetrics(Number(demo) || 50, now));
        setSynced("local");
        return;
      }
      const resolved = await resolveBridge();
      const client = resolved.bridge;
      clientRef.current = client;
      void loadCityMetrics(client, (fresh) => {
        setMetrics(fresh);
        setSynced("live");
      }).then((quick) => {
        setMetrics((prev) => (prev.length > 0 ? prev : quick));
        setSynced(client ? "cached" : "local");
      });
      // game state heals from the vault copy when connected
      void loadGameState(client).then((state) => setGame(state));
    });
  }, []);

  /* ---------- derived city ---------- */

  // day-granular: the plan only re-lays when the date turns, not each tick
  const dayTs = useMemo(() => {
    if (!nowTs) return 0;
    const d = new Date(nowTs);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  }, [nowTs]);
  const cityPlan = useMemo(
    () =>
      planCity(
        replayDate ? metrics.filter((m) => m.date <= replayDate) : metrics,
        dayTs,
        ARCH_PINS,
      ),
    [metrics, dayTs, replayDate],
  );
  useEffect(() => {
    const pins = ARCH_PINS;
    if (!pins || cityPlan.lots.length === 0) return;
    let changed = false;
    for (const lot of cityPlan.lots) {
      if (lot.file.startsWith("__") || lot.file.startsWith("demo/")) continue;
      if (pins[lot.file] === undefined) {
        pins[lot.file] = lot.arch ?? 0;
        changed = true;
      }
    }
    if (changed) {
      try {
        window.localStorage.setItem("tata.archpins", JSON.stringify(pins));
      } catch {}
    }
  }, [cityPlan]);

  /* ---------- watts & the depot ---------- */

  const today = useMemo(() => {
    if (!nowTs) return "";
    const d = new Date(nowTs);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }, [nowTs]);
  useEffect(() => {
    metricsRef.current = metrics;
  }, [metrics]);
  useEffect(() => {
    todayRef.current = today;
  }, [today]);
  /* natural weather: dated, deterministic, free — owning a sky means the
     right to force it; "none" hands the night back to nature */
  const effectiveWeather = useMemo(() => {
    if (game.weather !== "none") return game.weather;
    if (!today) return "none" as const;
    const h = hash32(today + ":sky");
    const roll = h % 20;
    return roll < 3 ? ("rain" as const) : roll < 4 ? ("fog" as const) : roll < 5 ? ("snow" as const) : ("none" as const);
  }, [game.weather, today]);


  const earnedDerived = useMemo(
    () => earnedWatts(metrics) + orderBonus(metrics) + streakBonus(metrics),
    [metrics],
  );
  // the iron rule, enforced: deleting notes in the vault never shrinks the
  // city — the floor only ever rises, and it lives in tata.json
  const earned = Math.max(earnedDerived, game.earnedFloor);
  const balance = Math.max(0, earned - game.spent);
  const level = useMemo(() => levelFromWatts(earned), [earned]);
  const levelCap = skylineCap(level);
  const bestStreak = useMemo(() => bestStreakOf(metrics), [metrics]);
  const orders = useMemo(() => workOrders(metrics, today), [metrics, today]);
  const allPages = useMemo(() => metrics.map((m) => m.file), [metrics]);
  /** pages that link to the one being written */
  const backlinks = useMemo(() => {
    if (!focusFile) return [];
    const base = focusFile.replace(/\.md$/i, "").toLowerCase();
    const short = base.split("/").pop() ?? base;
    return metrics
      .filter(
        (m) =>
          m.file !== focusFile &&
          (m.links ?? []).some((l) => {
            const t2 = l.toLowerCase();
            return t2 === base || t2 === short;
          }),
      )
      .sort((a, b) => b.mtime - a.mtime)
      .map((m) => m.file)
      .slice(0, 8);
  }, [metrics, focusFile]);

  const recent = useMemo(
    () => [...metrics].sort((a, b) => b.mtime - a.mtime).slice(0, 6).map((m) => m.file),
    [metrics],
  );
  const youRows = useMemo(() => composeYou(game.look).you_S_i, [game.look]);
  const npcSheet = useMemo(() => composeCitizens(), []);

  /* the citizen card: everything on it derives from the vault */
  const citizen = useMemo(() => {
    const days = [...new Set(metrics.filter((m) => !m.file.startsWith("__")).map((m) => m.date))].sort();
    const first = days[0] ?? today;
    const resident = first && today
      ? Math.max(1, Math.round((new Date(today + "T00:00:00Z").getTime() - new Date(first + "T00:00:00Z").getTime()) / 86400000) + 1)
      : 1;
    const serial = (hash32((game.name || "citizen") + ":" + (first ?? "")) >>> 0)
      .toString(16)
      .toUpperCase()
      .padStart(8, "0")
      .slice(0, 8);
    return {
      first: first ?? "—",
      resident,
      pages: metrics.length,
      nights: days.length,
      best: bestStreakOf(metrics),
      known: Object.keys(game.bonds ?? {}).length,
      letters: (game.letters ?? []).length,
      serial: `${serial.slice(0, 4)}-${serial.slice(4)}`,
    };
  }, [metrics, today, game.name, game.bonds, game.letters]);


  const dex = useMemo(() => {
    const count = (a: number) => cityPlan.lots.filter((l) => l.arch === a).length;
    const own = (id: string, n: number) => (game.owned.includes(id) ? n : 0);
    const builtWorks = resolveCommissions(game.commissions ?? [], nowTs || 0).built.map((b) => b.id);
    const entries: { id: string; name: string; line: string; n: number; icon?: string[] | null }[] = [
      { id: "a10", name: t("dex.lighthouse.name"), line: t("dex.lighthouse.line"), n: count(10), icon: iconOf("a10") },
      { id: "a11", name: t("dex.arch.name"), line: t("dex.arch.line"), n: count(11), icon: iconOf("a11") },
      { id: "a12", name: t("dex.chapel.name"), line: t("dex.chapel.line"), n: count(12), icon: iconOf("a12") },
      { id: "constellations", name: t("dex.constellations.name"), line: t("dex.constellations.line"), n: Math.min(level, 12), icon: iconOf("constellations") },
      { id: "moon", name: t("dex.moon.name"), line: t("dex.moon.line"), n: 1, icon: iconOf("moon") },
      { id: "cats", name: t("shop.cats.name"), line: t("shop.cats.line"), n: own("cats", 4), icon: iconOf("cats") },
      { id: "birds", name: t("shop.birds.name"), line: t("shop.birds.line"), n: own("birds", 6), icon: iconOf("birds") },
      { id: "dog", name: t("shop.dog.name"), line: t("shop.dog.line"), n: own("dog", 1), icon: iconOf("dog") },
    ];
    for (const id of ["trees", "lamps", "fountain", "harbor", "viaduct", "observatory", "sister", "comet"]) {
      entries.push({ id, name: t("shop." + id + ".name"), line: t("shop." + id + ".line"), n: own(id, 1), icon: iconOf(id) });
    }
    for (const def of COMMISSION_CATALOG) {
      entries.push({
        id: def.id,
        name: t("comm." + def.id + ".name"),
        line: t("comm." + def.id + ".line"),
        n: builtWorks.includes(def.id) ? 1 : 0,
        icon: iconOf(def.id),
      });
    }
    return entries;
  }, [cityPlan.lots, game.owned, game.commissions, nowTs, level, t]);

  const buy = useCallback(
    (id: string) => {
      const item = CATALOG.find((i) => i.id === id);
      if (!item) return;
      setGame((prev) => {
        if (prev.owned.includes(id)) {
          // owned weather toggles on/off, owned skins re-apply
          if (item.kind === "weather") {
            const next: GameState = {
              ...prev,
              weather: prev.weather === id ? "none" : (id as GameState["weather"]),
              updatedAt: Date.now(),
            };
            void saveGameState(next, clientRef.current);
            return next;
          }
          if (item.kind === "skin" && prev.skin !== id) {
            const next: GameState = { ...prev, skin: id as GameState["skin"], updatedAt: Date.now() };
            void saveGameState(next, clientRef.current);
            return next;
          }
          if (item.kind === "decor" || item.kind === "creature") {
            // stash or bring back out — never lost, never resold
            const pocket = (prev.stashed ?? []).includes(id)
              ? (prev.stashed ?? []).filter((s) => s !== id)
              : [...(prev.stashed ?? []), id];
            const next: GameState = { ...prev, stashed: pocket, updatedAt: Date.now() };
            void saveGameState(next, clientRef.current);
            return next;
          }
          return prev;
        }
        if (earned - prev.spent < item.cost) return prev;
        if ((item.minLevel ?? 0) > levelFromWatts(earned)) return prev;
        const next: GameState = {
          ...prev, // never rebuild from scratch — newer fields must survive
          spent: prev.spent + item.cost,
          owned: [...prev.owned, id],
          skin: item.kind === "skin" ? (id as GameState["skin"]) : prev.skin,
          weather: item.kind === "weather" ? (id as GameState["weather"]) : prev.weather,
          updatedAt: Date.now(),
        };
        void saveGameState(next, clientRef.current);
        hum().settle();
        return next;
      });
    },
    [earned, hum],
  );

  /** vault writes for bonds are debounced — greeting is frequent, saving is not */
  const scheduleBondSave = useCallback((state: GameState) => {
    bondSaveStateRef.current = state;
    if (bondSaveTimerRef.current !== null) window.clearTimeout(bondSaveTimerRef.current);
    bondSaveTimerRef.current = window.setTimeout(() => {
      bondSaveTimerRef.current = null;
      if (bondSaveStateRef.current) void saveGameState(bondSaveStateRef.current, clientRef.current);
    }, 5000);
  }, []);

  useEffect(() => {
    if (metrics.length === 0 || earnedDerived <= game.earnedFloor) return;
    // deferred so the floor raise never cascades into the same render pass
    const id = window.setTimeout(() => {
      setGame((prev) => {
        if (earnedDerived <= prev.earnedFloor) return prev;
        const next = { ...prev, earnedFloor: earnedDerived, updatedAt: Date.now() };
        scheduleBondSave(next);
        return next;
      });
    }, 400);
    return () => window.clearTimeout(id);
  }, [earnedDerived, game.earnedFloor, metrics.length, scheduleBondSave]);

  const clearEncounterTimers = useCallback(() => {
    for (const id of encTimersRef.current) window.clearTimeout(id);
    encTimersRef.current = [];
  }, []);

  /** turn a set of replies into bubble choices — round one and two alike */
  const replyChoices = useCallback(
    (replies: ReplyDef[]) =>
      replies.map((r) => ({
        label: lang === "zh" ? r.reply.zh : r.reply.en,
        pick: () => {
          encStageRef.current = "reply";
          encUsedRef.current.push(r);
          // the closer answers THIS reply, not the void
          encCloserRef.current = closerFor(r, Math.random(), lang);
          hum().click();
          setBubble({
            key: "you:0",
            name: t("bubble.you"),
            text: lang === "zh" ? r.reply.zh : r.reply.en,
            until: Date.now() + 30000,
          });
        },
      })),
    [hum, lang, t],
  );

  /** a click during the meeting turns the conversation one page */
  const lastAdvanceRef = useRef(0);
  const advanceEncounter = useCallback(() => {
    // double-fired pointer events must not skip a page of dialogue
    if (Date.now() - lastAdvanceRef.current < 650) return;
    lastAdvanceRef.current = Date.now();
    if (encStageRef.current === "their") {
      // while choices are on the table, tapping the city is not an answer
      return;
    }
    if (encStageRef.current === "reply" && encCloserRef.current) {
      hum().click();
      // read the ref NOW — the state updater runs later, after we clear it
      const closerText = encCloserRef.current ?? "";
      encCloserRef.current = null;
      // the conversation has one more turn in it: their closer can be
      // answered once, with words neither of you has used tonight
      const followups =
        encRoundRef.current < 2
          ? repliesFor(encTopicRef.current, encTierRef.current, Math.random(), encUsedRef.current)
          : [];
      if (followups.length > 0) {
        encRoundRef.current += 1;
        encStageRef.current = "their";
        setBubble({
          key: encKeyRef.current ?? "npc",
          name: encNameRef.current,
          text: closerText,
          until: Date.now() + 30000,
          choices: replyChoices(followups),
        });
      } else {
        encStageRef.current = "closer";
        setBubble({
          key: encKeyRef.current ?? "npc",
          name: encNameRef.current,
          text: closerText,
          until: Date.now() + 30000,
        });
      }
    } else {
      clearEncounterTimers();
      encStageRef.current = null;
      setBubble(null);
      setEncounterKey(null);
    }
  }, [clearEncounterTimers, hum, replyChoices]);

  const onCreatureTap = useCallback(
    (hit: { key: string; kind: string; seed: number; x: number; y: number }) => {
      if (hit.kind === "you") {
        setMirrorOpen(true);
        return;
      }
      if (encounterKey && hit.key === encounterKey) {
        advanceEncounter();
        return;
      }
      // start the walk — the greeting happens when you actually arrive.
      // They wave back right away, so the tap visibly landed on a person
      // and the pause reads as "walking over", not "app stopped working".
      clearEncounterTimers();
      encStageRef.current = null;
      setBubble(null);
      hum().click();
      setEmote({ key: hit.key, icon: "emote_wave", until: Date.now() + 2200 });
      setEncounterKey(hit.key);
    },
    [clearEncounterTimers, hum, encounterKey, advanceEncounter],
  );

  /** you arrived: the exchange — their line, your reply, then goodbye */
  const onEncounterMeet = useCallback(
    (hit: { key: string; kind: string; seed: number }) => {
      if (encStageRef.current !== null) return; // already exchanged
      const kind = hit.kind as CreatureKind;
      const now = Date.now();
      const d = new Date(now);
      const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const had = game.bonds[hit.key];
      const nextBonds = greet(game.bonds, hit.key, today);
      const tierBefore = tierOf(had);
      const tierAfter = tierOf(nextBonds[hit.key]);
      const name = nameOf(kind, hit.seed);
      const sinceGreet = had
        ? Math.round((now - new Date(had.last + "T00:00:00").getTime()) / 86400000)
        : 0;
      const quest = questRef.current;
      const isGiver = quest !== null && hit.key === quest.key;
      const questText = isGiver
        ? (quest.done ? QUEST_LINES[quest.orderId]?.thanks : QUEST_LINES[quest.orderId]?.ask)
        : undefined;
      const addressed = questText
        ? (game.name ? `${game.name}\uff0c` : "") + (lang === "zh" ? questText.zh : questText.en)
        : null;
      // the favour speaks as its own subject: the ask offers quest replies,
      // the thanks lands as being-noticed warmth
      const spoken = addressed
        ? { text: addressed, topic: (quest && quest.done ? "you" : "quest") as Topic }
        : lineFor(
        {
          kind,
          tier: tierAfter,
          hour: d.getHours(),
          weather: effectiveWeather === "none" ? "base" : effectiveWeather,
          firstMeet: !had,
          profession: kind === "person" ? professionOf(hit.seed) : undefined,
          wroteTonight: metrics.some((m) => m.date === today),
          streak: streakOf(metrics, today),
          totalNotes: metrics.length,
          daysSinceGreet: Math.max(0, sinceGreet),
          name: game.name || undefined,
          lastTopic: had?.t,
        },
        Math.random(),
        lang,
      );
      // they will remember what tonight was about — but a favour is an
      // errand, not a subject worth bringing up tomorrow
      const kept =
        spoken.topic && spoken.topic !== "quest"
          ? remember(nextBonds, hit.key, spoken.topic)
          : nextBonds;
      if (kept !== game.bonds) {
        const next: GameState = { ...game, bonds: kept, updatedAt: now };
        setGame(next);
        scheduleBondSave(next);
      }
      const line = spoken.text;
      const shownName = had ? name : t("bubble.someone");
      encNameRef.current = shownName;
      encTopicRef.current = spoken.topic;
      encTierRef.current = tierAfter;
      encRoundRef.current = 1;
      encUsedRef.current = [];
      encKeyRef.current = hit.key;
      // the exchange is a fork now: you choose what to say or do
      let choices: { label: string; pick: () => void }[];
      if (kind === "cat" || kind === "dog") {
        choices = PET_ACTIONS[kind].map((a) => ({
          label: lang === "zh" ? a.zh : a.en,
          pick: () => {
            encStageRef.current = "reply";
            encCloserRef.current = null;
            hum().click();
            setEmote({ key: hit.key, icon: a.emote, until: Date.now() + 2400 });
            setBubble({
              key: hit.key,
              name: shownName,
              text: lang === "zh" ? a.react.zh : a.react.en,
              until: Date.now() + 30000,
            });
          },
        }));
      } else {
        // the replies answer the topic that was just raised, and only the
        // warmth this friendship has earned is on the table (the nod is
        // gone: tapping away has always been the graceful exit)
        choices = replyChoices(repliesFor(spoken.topic, tierAfter, Math.random()));
      }
      setBubble({ key: hit.key, name: shownName, text: line, until: now + 30000, choices });
      setEmote({
        key: hit.key,
        icon:
          isGiver && quest.done
            ? "emote_heart"
            : !had
              ? "emote_dots"
              : tierAfter > tierBefore
                ? "emote_heart"
                : "emote_wave",
        until: now + 2200,
      });
      hum().greet(hit.seed);
      if (tierAfter > tierBefore) hum().settle();
      encStageRef.current = "their";
      encTimersRef.current.push(window.setTimeout(() => setEncounterKey(null), 45000));
    },
    [game, hum, scheduleBondSave, lang, metrics, effectiveWeather, replyChoices, t],
  );

  /* bubbles and emotes fade on their own clock */
  useEffect(() => {
    if (!bubble) return;
    const t = window.setTimeout(() => setBubble(null), Math.max(0, bubble.until - Date.now()));
    return () => window.clearTimeout(t);
  }, [bubble]);
  useEffect(() => {
    if (!emote) return;
    const t = window.setTimeout(() => setEmote(null), Math.max(0, emote.until - Date.now()));
    return () => window.clearTimeout(t);
  }, [emote]);

  /** unlock a wardrobe part with Watts, or wear a look — the Mirror's two verbs */
  const unlockPart = useCallback(
    (id: string, cost: number) => {
      setGame((prev) => {
        if (prev.owned.includes(id) || earned - prev.spent < cost) return prev;
        const next: GameState = {
          ...prev,
          spent: prev.spent + cost,
          owned: [...prev.owned, id],
          updatedAt: Date.now(),
        };
        void saveGameState(next, clientRef.current);
        hum().purchase();
        return next;
      });
    },
    [earned, hum],
  );
  const wearLook = useCallback((look: GameState["look"]) => {
    setGame((prev) => {
      const next: GameState = { ...prev, look, updatedAt: Date.now() };
      void saveGameState(next, clientRef.current);
      return next;
    });
    setMirrorOpen(false);
  }, []);

  /* the neighbours you know, for the Registry */
  const knownResidents = useMemo(() => {
    return Object.entries(game.bonds ?? {})
      .map(([key, bond]) => {
        const kind = key.split(":")[0] as CreatureKind;
        const seed = hash32(key);
        return {
          key,
          kind,
          seed,
          name: nameOf(kind, seed),
          tier: tierOf(bond),
          days: bond.n,
          prof: kind === "person" ? professionOf(seed) : null,
        };
      })
      .sort((a, b) => b.days - a.days);
  }, [game.bonds]);

  /* the ambience bus follows tonight's sky */
  useEffect(() => {
    hum().setWeather(effectiveWeather);
  }, [effectiveWeather, humOn, hum]);

  /* level-up: a named moment, not a number — one line, one chord, and the
     growth wave city3d already plays */
  const prevLevelRef = useRef<number | null>(null);
  const [levelToast, setLevelToast] = useState(false);
  const [worksToast, setWorksToast] = useState(false);
  useEffect(() => {
    const prev = prevLevelRef.current;
    prevLevelRef.current = level;
    if (prev === null || level <= prev || metrics.length === 0) return;
    hum().levelUp();
    const show = window.setTimeout(() => setLevelToast(true), 10);
    const hide = window.setTimeout(() => setLevelToast(false), 5200);
    return () => {
      window.clearTimeout(show);
      window.clearTimeout(hide);
    };
  }, [level, hum, metrics.length]);

  /* public works resolve on real time; completion stamps once and the
     caretaker's letter arrives — in tata.json, never in the vault */
  const works = useMemo(
    () =>
      (game.commissions ?? []).map((c) => ({
        id: c.id,
        block: c.block,
        progress: nowTs ? progressOf(c, nowTs) : 0,
      })),
    [game.commissions, nowTs],
  );

  useEffect(() => {
    const now = Date.now();
    const done = resolveCommissions(game.commissions ?? [], now).built.filter((b) => {
      const c = (game.commissions ?? []).find((x) => x.id === b.id);
      return c && !c.rewardClaimed;
    });
    if (done.length === 0) return;
    const id = window.setTimeout(() => {
      setGame((prev) => {
        const pending = resolveCommissions(prev.commissions ?? [], now).built.filter((b) => {
          const c = (prev.commissions ?? []).find((x) => x.id === b.id);
          return c && !c.rewardClaimed;
        });
        if (pending.length === 0) return prev;
        const d = new Date(now);
        const pad2 = (n: number) => String(n).padStart(2, "0");
        const today2 = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
        const next: GameState = {
          ...prev,
          commissions: (prev.commissions ?? []).map((c) =>
            pending.some((b) => b.id === c.id)
              ? { ...c, completedAt: c.completedAt ?? now, rewardClaimed: true }
              : c,
          ),
          letters: [
            ...(prev.letters ?? []),
            ...pending
              .filter((b) => !(prev.letters ?? []).some((l) => l.id === b.id))
              .map((b) => ({ id: b.id, date: today2, read: false })),
          ],
          updatedAt: now,
        };
        void saveGameState(next, clientRef.current);
        return next;
      });
      hum().levelUp();
      setWorksToast(true);
      window.setTimeout(() => setWorksToast(false), 5200);
    }, 600);
    return () => window.clearTimeout(id);
    // nowTs: an open page re-checks each minute, so opening day arrives live
  }, [game.commissions, nowTs, hum]);

  /* the archive writes a ledger for last month, once, when it has pages */
  useEffect(() => {
    if (!today || metrics.length === 0) return;
    const d = new Date(today + "T00:00:00Z");
    d.setUTCMonth(d.getUTCMonth() - 1);
    const prevMonth = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const id2 = `month-${prevMonth}`;
    const pages = metrics.filter((m) => m.date.startsWith(prevMonth) && !m.file.startsWith("__")).length;
    if (pages === 0) return;
    const timer = window.setTimeout(() => {
      setGame((prev) => {
        if ((prev.letters ?? []).some((l) => l.id === id2)) return prev;
        const next: GameState = {
          ...prev,
          letters: [...(prev.letters ?? []), { id: id2, date: today, read: false }],
          updatedAt: Date.now(),
        };
        void saveGameState(next, clientRef.current);
        return next;
      });
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [metrics, today]);

  /* a capsule's day arrives: the vault unlocks and a letter announces it */
  useEffect(() => {
    if (!today) return;
    const due = metrics.filter(
      (m) => m.capsule && m.capsule <= today && !(game.letters ?? []).some((l) => l.id === "capsule-" + m.file),
    );
    if (due.length === 0) return;
    const timer = window.setTimeout(() => {
      setGame((prev) => {
        const fresh = due.filter((m) => !(prev.letters ?? []).some((l) => l.id === "capsule-" + m.file));
        if (fresh.length === 0) return prev;
        const next: GameState = {
          ...prev,
          letters: [
            ...(prev.letters ?? []),
            ...fresh.map((m) => ({ id: "capsule-" + m.file, date: today, read: false })),
          ],
          updatedAt: Date.now(),
        };
        void saveGameState(next, clientRef.current);
        return next;
      });
      hum().levelUp();
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [metrics, today, game.letters, hum]);

  const orderCommission = useCallback(
    (id: string) => {
      const def = commissionDef(id);
      if (!def) return;
      setGame((prev) => {
        if ((prev.commissions ?? []).some((c) => c.id === id)) return prev;
        if (earned - prev.spent < def.cost) return prev;
        if (def.minLevel > level) return prev;
        const next: GameState = {
          ...prev,
          spent: prev.spent + def.cost,
          commissions: [
            ...(prev.commissions ?? []),
            {
              id,
              block: Math.max(0, cityPlan.blocks.length - 1),
              placedAt: Date.now(),
              completedAt: null,
              rewardClaimed: false,
            },
          ],
          updatedAt: Date.now(),
        };
        void saveGameState(next, clientRef.current);
        hum().purchase();
        return next;
      });
    },
    [earned, level, hum, cityPlan.blocks.length],
  );

  /** stats of one calendar month — pages, nights, longest run */
  const monthStats = useCallback(
    (month: string) => {
      const days = [...new Set(
        metrics.filter((m) => m.date.startsWith(month) && !m.file.startsWith("__")).map((m) => m.date),
      )].sort();
      const set = new Set(days);
      let best = 0;
      for (const d of days) {
        let run = 1;
        let cur = d;
        for (;;) {
          const t2 = new Date(cur + "T00:00:00Z").getTime() + 86400000;
          const nd = new Date(t2);
          cur = `${nd.getUTCFullYear()}-${String(nd.getUTCMonth() + 1).padStart(2, "0")}-${String(nd.getUTCDate()).padStart(2, "0")}`;
          if (!set.has(cur)) break;
          run += 1;
        }
        best = Math.max(best, run);
      }
      const pages = metrics.filter((m) => m.date.startsWith(month) && !m.file.startsWith("__")).length;
      return { pages, days: days.length, streak: best };
    },
    [metrics],
  );

  const bodyOf = useCallback(
    (id: string, date: string) => {
      if (id.startsWith("capsule-")) {
        const file = id.slice(8).replace(/\.md$/, "");
        return lang === "zh"
          ? `寫字的人。\n\n你埋下的字醒了：「${file}」。\n它等到了自己的日子。去打開它——那是過去的你，寄給現在的你的信。\n\n—— 城市檔案室`
          : `To the one who writes.\n\nA page you buried has woken: "${file}".\nIt waited for its own day. Go open it — the person you were, writing to the person you are.\n\n— The city archive`;
      }
      const body = id.startsWith("month-")
        ? monthlyLetterBody(id.slice(6), monthStats(id.slice(6)), lang)
        : letterBody(id, { months: cityPlan.blocks.length, pages: metrics.length, date }, lang);
      return game.name
        ? body
            .replace(/^寫字的人。/, `${game.name}。`)
            .replace(/^To the one who writes\./, `To ${game.name}.`)
        : body;
    },
    [monthStats, cityPlan.blocks.length, metrics.length, lang, game.name],
  );

  const exportLetter = useCallback(
    (id: string) => {
      const client = clientRef.current;
      const letter = (game.letters ?? []).find((l) => l.id === id);
      if (!client || !letter) return;
      // ids can carry a note path (capsule-Journal/2026/…): flatten it, or
      // the letter lands in a folder nobody asked for
      const safe = id.replace(/[/\\]/g, "-").replace(/\.md$/i, "");
      const body = bodyOf(id, letter.date) + "\n";
      void client
        .writeGuarded(`Letters/${letter.date} ${safe}.md`, body, null, null)
        .then((r) => {
          if (r.ok) return;
          // you have edited the exported letter — keep your copy, add mine
          const stamp = new Date().toISOString().slice(11, 16).replace(":", ".");
          return client.writeGuarded(`Letters/${letter.date} ${safe} (${stamp}).md`, body, null, null);
        })
        .catch(() => {});
    },
    [game.letters, bodyOf],
  );

  const extras = useMemo(() => {
    const on = (id: string) => game.owned.includes(id) && !(game.stashed ?? []).includes(id);
    return {
      cats: on("cats") ? 4 : 0,
      birds: on("birds") ? 6 : 0,
      dogs: on("dog") ? 1 : 0,
    };
  }, [game.owned, game.stashed]);

  /* the nightly favour: a resident claims one of tonight's work orders */
  const quest = useMemo(() => {
    if (!today || cityPlan.lots.length === 0) return null;
    const orders = workOrders(metrics, today);
    if (orders.length === 0) return null;
    const order = orders[hash32(today + ":favour") % orders.length];
    const persons = creaturesFor(cityPlan, cityPlan.lots.length, extras).filter(
      (c) => c.kind === "person",
    );
    if (persons.length === 0) return null;
    // rendezvous pick: `hash % persons.length` re-drew the giver whenever
    // the city grew mid-day — write a page, and the question mark jumped
    // to another resident. Highest per-person score is stable.
    const giver = persons.reduce((best, p) =>
      hash32(today + ":giver:" + p.key) > hash32(today + ":giver:" + best.key) ? p : best,
    );
    return { key: giver.key, seed: giver.seed, orderId: order.id, done: order.done };
  }, [metrics, today, cityPlan, extras]);
  useEffect(() => {
    questRef.current = quest;
  }, [quest]);
  /* the favour's receipt: the moment tonight's asked-for order lands,
     say so once — otherwise the tip arrives in silence */
  const [questToast, setQuestToast] = useState(false);
  const questDoneSeenRef = useRef<boolean | null>(null);
  useEffect(() => {
    const done = Boolean(quest?.done);
    const was = questDoneSeenRef.current;
    questDoneSeenRef.current = done;
    if (was === false && done) {
      setQuestToast(true);
      const id = window.setTimeout(() => setQuestToast(false), 6000);
      return () => window.clearTimeout(id);
    }
  }, [quest]);
  const decor = useMemo(() => {
    const on = (id: string) => game.owned.includes(id) && !(game.stashed ?? []).includes(id);
    return {
      lamps: on("lamps"),
      trees: on("trees"),
      fountain: on("fountain"),
      harbor: on("harbor"),
      viaduct: on("viaduct"),
      observatory: on("observatory"),
      sister: on("sister"),
      comet: on("comet"),
    };
  }, [game.owned, game.stashed]);

  /* ---------- search lights up the city ---------- */

  useEffect(() => {
    const q = query.trim();
    const client = clientRef.current;
    if (!searchOpen || !q || !client) {
      setSearchHits(null);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      if (!client.search) return; // this bridge has no full-text road yet
      client
        .search(q, controller.signal)
        .then((found) => {
          if (!controller.signal.aborted) setSearchHits(new Set(found.map((f) => f.name)));
        })
        .catch(() => {});
    }, 350);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query, searchOpen]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!searchOpen || !q) return null;
    if (q.startsWith("#")) {
      // tag search is fully local — the city lights up by topic
      const tag = q.slice(1);
      return new Set(
        metrics
          .filter((m) => (m.tags ?? []).some((t2) => t2.toLowerCase().includes(tag)))
          .map((m) => m.file),
      );
    }
    const byName = new Set(
      metrics.filter((m) => m.file.toLowerCase().includes(q)).map((m) => m.file),
    );
    if (!searchHits) return byName;
    return new Set([...byName, ...searchHits]);
  }, [searchOpen, query, metrics, searchHits]);

  /* ---------- month travel ---------- */

  useEffect(() => {
    const n = cityPlan.blocks.length - 1;
    const id = window.setTimeout(() => setMonthIx(n), 0);
    return () => window.clearTimeout(id);
  }, [cityPlan.blocks.length]);

  const jumpMonth = useCallback(
    (dir: -1 | 1) => {
      setMonthIx((prev) => {
        const next = Math.min(cityPlan.blocks.length - 1, Math.max(0, prev + dir));
        const block = cityPlan.blocks[next];
        if (block) setGoMonth({ x: block.x, z: block.z, n: Date.now() });
        return next;
      });
    },
    [cityPlan.blocks],
  );

  useEffect(() => {
    if (!moveMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMoveMode(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [moveMode]);

  /* the year rings: replay the city from its first page to tonight */
  useEffect(() => {
    if (!replayOn || metrics.length === 0 || !today) return;
    const days = [...new Set(metrics.map((m) => m.date))].sort();
    const startT = new Date(days[0] + "T00:00:00Z").getTime();
    const endT = new Date(today + "T00:00:00Z").getTime();
    const total = Math.max(1, Math.round((endT - startT) / 86400000));
    const stepDays = Math.max(1, Math.ceil(total / 140));
    const pad2 = (n: number) => String(n).padStart(2, "0");
    const fmt = (t2: number) => {
      const d = new Date(t2);
      return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
    };
    let cur = startT;
    const kick = window.setTimeout(() => setReplayDate(fmt(startT)), 0);
    const id = window.setInterval(() => {
      cur += stepDays * 86400000;
      if (cur >= endT) {
        setReplayOn(false);
        setReplayDate(null);
        return;
      }
      setReplayDate(fmt(cur));
    }, 130);
    return () => {
      window.clearTimeout(kick);
      window.clearInterval(id);
      setReplayDate(null);
    };
  }, [replayOn, metrics, today]);

  /* summoned compass: any outside tap or six idle seconds puts it away */
  useEffect(() => {
    if (!compassOpen) return;
    const close = (e: PointerEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest(".dpad") || el?.closest(".dpad-summon")) return;
      setCompassOpen(false);
    };
    document.addEventListener("pointerdown", close, true);
    const id = window.setTimeout(() => setCompassOpen(false), 8000);
    return () => {
      document.removeEventListener("pointerdown", close, true);
      window.clearTimeout(id);
    };
  }, [compassOpen]);

  /* ---------- intro ---------- */

  useEffect(() => {
    const seen = window.localStorage.getItem("tata.visited");
    let welcomeTimer: number | null = null;
    if (!seen && !new URLSearchParams(window.location.search).get("demo")) {
      welcomeTimer = window.setTimeout(() => setWelcomeOpen(true), 0);
    }
    const t1 = window.setTimeout(() => setIntro(true), seen ? 40 : 150);
    const t2 = window.setTimeout(() => setIntroDone(true), seen ? 420 : 2100);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      if (welcomeTimer !== null) window.clearTimeout(welcomeTimer);
    };
  }, []);

  /* ---------- language ---------- */

  useEffect(() => {
    const saved = loadLang();
    document.documentElement.lang = saved === "zh" ? "zh-Hant" : "en";
    if (saved !== "en") window.setTimeout(() => setLang(saved), 0);
  }, []);

  const changeLang = useCallback((next: Lang) => {
    saveLang(next);
    setLang(next);
    document.documentElement.lang = next === "zh" ? "zh-Hant" : "en";
  }, []);

  /* ---------- sound prefs ---------- */

  useEffect(() => {
    try {
      if (window.localStorage.getItem(HUM_KEY) === "1") {
        window.setTimeout(() => setHumOn(true), 0);
      }
      if (window.localStorage.getItem(CHIME_KEY) === "0") {
        window.setTimeout(() => setChimeOn(false), 0);
      }
    } catch {}
  }, []);

  useEffect(() => {
    hum().setChime(chimeOn);
    try {
      window.localStorage.setItem(CHIME_KEY, chimeOn ? "1" : "0");
    } catch {}
  }, [chimeOn, hum]);

  const toggleHum = useCallback(() => {
    setHumOn((on) => {
      const next = !on;
      hum().setHum(next);
      try {
        window.localStorage.setItem(HUM_KEY, next ? "1" : "0");
      } catch {}
      return next;
    });
  }, [hum]);

  /* resume hum on first gesture if it was on */
  useEffect(() => {
    if (!humOn) return;
    const onGesture = () => hum().setHum(true);
    window.addEventListener("pointerdown", onGesture, { once: true });
    return () => window.removeEventListener("pointerdown", onGesture);
  }, [humOn, hum]);

  /* ---------- idle fade ---------- */

  const scheduleIdle = useCallback(() => {
    if (idleTimerRef.current !== null) window.clearTimeout(idleTimerRef.current);
    if (writeOpenRef.current) return;
    const idleMs = window.matchMedia("(pointer: coarse)").matches ? 3500 : 6000;
    idleTimerRef.current = window.setTimeout(() => setUiVisible(false), idleMs);
  }, []);

  const registerActivity = useCallback(() => {
    setUiVisible(true);
    scheduleIdle();
  }, [scheduleIdle]);

  useEffect(() => {
    scheduleIdle();
    window.addEventListener("pointermove", registerActivity, { passive: true });
    window.addEventListener("pointerdown", registerActivity, { passive: true });
    return () => {
      window.removeEventListener("pointermove", registerActivity);
      window.removeEventListener("pointerdown", registerActivity);
    };
  }, [registerActivity, scheduleIdle]);

  /* ---------- writing ---------- */

  const pinSentence = useCallback(
    (text: string) => {
      const clean = text.trim().replace(/\s+/g, " ").slice(0, 120);
      if (!clean) {
        setMoveToast(t("board.empty"));
        window.setTimeout(() => setMoveToast(null), 3200);
        return;
      }
      setGame((prev) => {
        const next: GameState = {
          ...prev,
          billboard: { text: clean, date: todayRef.current || "" },
          updatedAt: Date.now(),
        };
        void saveGameState(next, clientRef.current);
        return next;
      });
      hum().settle();
      setMoveToast(t("board.pinned"));
      window.setTimeout(() => setMoveToast(null), 3200);
    },
    [hum, t],
  );

  const openWrite = useCallback((file?: string) => {
    if (file) {
      const m = metricsRef.current.find((x) => x.file === file);
      if (m?.capsule && todayRef.current && m.capsule > todayRef.current) {
        // a sealed capsule: the whole point is that it will not open
        setMoveToast(`\u23f3 ${m.capsule}`);
        window.setTimeout(() => setMoveToast(null), 3200);
        return;
      }
    }
    clearEncounterTimers();
    setEncounterKey(null);
    setBubble(null);
    writeOpenRef.current = true;
    setWriteOpen(true);
    setUiVisible(true);
    if (file) setRequestOpen({ file, n: Date.now() });
  }, [clearEncounterTimers]);

  /** landmark placements in world coords — a written day evicts the guest */
  const placements = useMemo(() => {
    const CELL = 3;
    const out: Record<string, { x: number; z: number }> = {};
    for (const [id, cell] of Object.entries(game.placedAt ?? {})) {
      const block = cityPlan.blocks.find((b) => b.month === cell.month);
      if (!block) continue;
      const date = dateAtCell(cell.month, cell.col, cell.row);
      if (date !== null && metrics.some((m) => m.date === date)) continue; // words win
      out[id] = { x: block.x + cell.col * CELL + CELL / 2, z: block.z + cell.row * CELL + CELL / 2 };
    }
    return out;
  }, [game.placedAt, cityPlan.blocks, metrics]);

  /* a new building claimed a chosen cell — the landmark steps aside, told */
  useEffect(() => {
    const evicted = Object.entries(game.placedAt ?? {}).filter(([, cell]) => {
      const date = dateAtCell(cell.month, cell.col, cell.row);
      return date !== null && metrics.some((m) => m.date === date);
    });
    if (evicted.length === 0) return;
    const timer = window.setTimeout(() => {
      setGame((prev) => {
        const left = Object.fromEntries(
          Object.entries(prev.placedAt ?? {}).filter(([, cell]) => {
            const date = dateAtCell(cell.month, cell.col, cell.row);
            return !(date !== null && metrics.some((m) => m.date === date));
          }),
        );
        if (Object.keys(left).length === Object.keys(prev.placedAt ?? {}).length) return prev;
        const next: GameState = { ...prev, placedAt: left, updatedAt: Date.now() };
        void saveGameState(next, clientRef.current);
        return next;
      });
      setMoveToast(t("move.yield"));
      window.setTimeout(() => setMoveToast(null), 5200);
    }, 800);
    return () => window.clearTimeout(timer);
  }, [game.placedAt, metrics, t]);

  const onGroundTap = useCallback(
    (x: number, z: number) => {
      if (encounterKey) {
        // still walking over? a tap on open ground calls the visit off —
        // changing your mind mid-street is allowed
        if (encStageRef.current === null) {
          clearEncounterTimers();
          hum().click();
          setEncounterKey(null);
        } else {
          // mid-talk, the ground turns the page (it can never open the
          // notebook here — the notebook stays behind the conversation)
          advanceEncounter();
        }
        return;
      }
      const CELL = 3;
      const block = cityPlan.blocks.find(
        (b) => x >= b.x && x < b.x + 7 * CELL && z >= b.z && z < b.z + 6 * CELL,
      );
      if (!block) return;
      const col = Math.floor((x - block.x) / CELL);
      const row = Math.floor((z - block.z) / CELL);
      const date = dateAtCell(block.month, col, row);
      if (moveMode) {
        if (date !== null && metrics.some((m) => m.date === date)) {
          setMoveToast(t("move.blocked"));
          window.setTimeout(() => setMoveToast(null), 3200);
          return;
        }
        const id2 = moveMode;
        hum().settle();
        setMoveMode(null);
        setGame((prev) => {
          const next: GameState = {
            ...prev,
            placedAt: { ...(prev.placedAt ?? {}), [id2]: { month: block.month, col, row } },
            updatedAt: Date.now(),
          };
          void saveGameState(next, clientRef.current);
          return next;
        });
        return;
      }
      if (!date || !today || date > today) return; // the future stays empty
      const existing = metrics.filter((m) => m.date === date);
      const file =
        existing.length > 0
          ? existing.sort((a2, b2) => b2.mtime - a2.mtime)[0].file
          : date === today
            ? `${date} Today.md`
            : `${date}.md`; // backfill: a page for a day that stayed dark
      // on touch, nothing bursts open from a graze — a chip names the
      // page first, and only a second, meant tap unfolds the notebook
      if (window.matchMedia("(pointer: coarse)").matches && touchPick !== file) {
        hum().click();
        setTouchPick(file);
        return;
      }
      setTouchPick(null);
      hum().click();
      openWrite(file);
    },
    [cityPlan.blocks, metrics, today, openWrite, hum, encounterKey, clearEncounterTimers, advanceEncounter, moveMode, touchPick, t],
  );


  const closeWrite = useCallback(() => {
    writeOpenRef.current = false;
    setWriteOpen(false);
    setFocusFile(null);
    setRequestOpen(null);
  }, []);

  /** live growth: the building breathes while you type */
  const onWords = useCallback((file: string, words: number) => {
    const now = Date.now();
    if (now - wordsThrottleRef.current < 300) return;
    wordsThrottleRef.current = now;
    setMetrics((prev) => {
      const index = prev.findIndex((m) => m.file === file);
      if (index >= 0) {
        if (floorsOf(prev[index].words) === floorsOf(words)) return prev;
        const next = [...prev];
        next[index] = { ...next[index], words, mtime: now };
        return next;
      }
      return [...prev, { file, date: dateOf(file, now), words, mtime: now }];
    });
    setFocusFile(file);
  }, []);

  /* the notebook was put away: tonight's building settles under the
     amber — once per day, so the ritual stays a ritual */
  const putAwayDayRef = useRef("");
  const onPutAway = useCallback((file: string | null) => {
    const day = new Date().toISOString().slice(0, 10);
    if (putAwayDayRef.current === day) return;
    putAwayDayRef.current = day;
    if (!file) return;
    hum().settle();
    setCeremony({ file, n: Date.now() });
  }, []);

  const onSaved = useCallback(
    (file: string, isNew: boolean) => {
      if (isNew) {
        hum().settle();
        setCeremony({ file, n: Date.now() });
        setMetrics((prev) => {
          if (prev.filter((m) => !m.file.startsWith("__")).length === 1) {
            setFoundToast(true);
            window.setTimeout(() => setFoundToast(false), 7000);
          }
          return prev;
        });
      }
      setMetrics((prev) => {
        const m = prev.find((x) => x.file === file);
        if (m) void cityCache.put({ file: m.file, date: m.date, words: m.words, mtime: Date.now() });
        return prev;
      });
    },
    [hum],
  );

  /* ---------- fullscreen / keyboard ---------- */

  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {}
  }, []);

  useEffect(() => {
    // deferred: probing the fullscreen API is a one-time external read
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const id = window.setTimeout(
      () => setCanFullscreen(Boolean(document.fullscreenEnabled) && !coarse),
      0,
    );
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener("fullscreenchange", onChange);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      registerActivity();
      // an IME uses Escape/Enter to steer candidates — never act mid-composition
      if (event.isComposing) return;
      if (event.key === "Escape") {
        if (encounterKey) {
          clearEncounterTimers();
          encStageRef.current = null;
          setBubble(null);
          setEncounterKey(null);
        } else if (searchOpen) {
          setSearchOpen(false);
          setQuery("");
        } else if (mirrorOpen) setMirrorOpen(false);
        else if (dexOpen) setDexOpen(false);
        else if (shopOpen) setShopOpen(false);
        else if (settingsOpen) setSettingsOpen(false);
        else if (writeOpenRef.current) closeWrite();
        return;
      }
      const target = event.target as HTMLElement | null;
      const isControl =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;
      if (isControl) return;
      if (event.key === "/") {
        event.preventDefault();
        setSearchOpen(true);
        window.setTimeout(() => searchInputRef.current?.focus(), 50);
      } else if (event.key === "n" || event.key === "N") {
        event.preventDefault();
        if (writeOpenRef.current) closeWrite();
        else openWrite();
      } else if (event.key === "b" || event.key === "B") {
        event.preventDefault();
        hum().click();
        setShopOpen((v) => !v);
      } else if (event.key === "[") {
        event.preventDefault();
        jumpMonth(-1);
      } else if (event.key === "]") {
        event.preventDefault();
        jumpMonth(1);
      } else if (event.key === "z" || event.key === "Z") {
        event.preventDefault();
        setZen((v) => !v);
      } else if (event.key === "c" || event.key === "C") {
        event.preventDefault();
        hum().click();
        setDexOpen((v) => !v);
      } else if (event.key === "m" || event.key === "M") {
        event.preventDefault();
        hum().click();
        setMirrorOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeWrite, dexOpen, hum, jumpMonth, mirrorOpen, openWrite, registerActivity, searchOpen, settingsOpen, shopOpen, encounterKey, clearEncounterTimers]);

  /* ---------- render ---------- */

  const empty = cityPlan.lots.length === 0;

  const rootClass = [
    "city-app",
    writeOpen ? "writing" : "",
    bubble ? "talking" : "",
    compassOpen ? "compass-open" : "",
    uiVisible || writeOpen || settingsOpen ? "ui-visible" : "ui-hidden",
    introDone ? "intro-done" : "intro-running",
    zen ? "zen" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <main className={rootClass}>
      <div className="city-field">
        {gl3d ? (
          <City3D
            plan={cityPlan}
            focus={focusFile}
            matches={matches}
            intro={intro}
            extras={extras}
            decor={decor}
            skin={game.skin}
            weather={effectiveWeather}
            writeMode={writeOpen}
            goMonth={goMonth}
            ceremony={ceremony}
            levelCap={levelCap}
            level={level}
            streak={bestStreak}
            commissions={works}
            placements={placements}
            billboard={Boolean(game.billboard)}
            quest={quest ? { key: quest.key, done: quest.done } : null}
            onBillboardTap={() => {
              const b = game.billboard;
              if (!b) return;
              hum().click();
              setBubble({
                key: "__board__",
                name: t("board.name"),
                text: `\u201c${b.text}\u201d — ${b.date}`,
                until: Date.now() + 14000,
              });
            }}
            ariaLabel={t("city.aria")}
            onHover={(file, x, y) => setHover(file ? { file, x, y } : null)}
            onOpen={(file) => {
              // a tower is background too, while someone is talking to you
              if (encounterKey) return;
              if (window.matchMedia("(pointer: coarse)").matches && touchPick !== file) {
                setTouchPick(file);
                return;
              }
              setTouchPick(null);
              openWrite(file);
            }}
            onCreatureTap={onCreatureTap}
            onGroundTap={onGroundTap}
            encounterKey={encounterKey}
            onEncounterMeet={onEncounterMeet}
            look={game.look}
            emote={emote}
            onFail={() => setGl3d(false)}
          />
        ) : (
          <div className="no-gl">
            <strong>{t("nogl.title")}</strong>
            <span>{t("nogl.body")}</span>
          </div>
        )}
        {levelToast && (
          <div className="levelup-toast" role="status">
            {t("levelup.line")}
          </div>
        )}
        {questToast && !levelToast && (
          <div className="levelup-toast" role="status">
            {t("quest.delivered")}
          </div>
        )}
        {worksToast && (
          <div className="levelup-toast" role="status">
            {t("works.done.toast")}
          </div>
        )}
        {moveMode && (
          <div className="move-banner" role="status">
            <span>
              {t("move.banner.pre")}
              {commissionDef(moveMode)
                ? t("comm." + moveMode + ".name")
                : t("shop." + moveMode + ".name")}
              {t("move.banner.post")}
            </span>
            <button type="button" onClick={() => setMoveMode(null)} aria-label={t("common.close")}>
              ×
            </button>
          </div>
        )}
        {replayOn && replayDate && (
          <div className="move-banner" role="status">
            <span>{t("rings.watching")} {replayDate}</span>
            <button
              type="button"
              onClick={() => {
                setReplayOn(false);
              }}
              aria-label={t("common.close")}
            >
              ×
            </button>
          </div>
        )}
        {moveToast && (
          <div className="levelup-toast" role="status">
            {moveToast}
          </div>
        )}
        {touchPick && !writeOpen && (
          <div className="pick-chip" role="dialog">
            <strong>{touchPick.replace(/\.md$/, "")}</strong>
            <em>
              {metrics.find((m) => m.file === touchPick)?.words ?? 0}
              {t("notes.wordunit")}
            </em>
            <button
              type="button"
              className="pick-open"
              onClick={() => {
                const f = touchPick;
                setTouchPick(null);
                openWrite(f);
              }}
            >
              {t("pick.open")}
            </button>
            <button type="button" onClick={() => setTouchPick(null)} aria-label={t("common.close")}>
              ×
            </button>
          </div>
        )}
        {foundToast && (
          <div className="levelup-toast" role="status">
            {t("found.toast")}
          </div>
        )}
        {swApply && !writeOpen && (
          <div className="levelup-toast sw-toast" role="status">
            <span>{t("sw.line")}</span>
            <button type="button" onClick={swApply}>{t("sw.do")}</button>
            <button type="button" onClick={() => setSwApply(null)}>{t("sw.later")}</button>
          </div>
        )}
        {bubble && (
          <div
            className="city-bubble city-bubble--docked"
            aria-live="polite"
            onClick={() => {
              // during a meeting the bubble itself turns the page;
              // outside one, a tap simply puts the notice away
              if (encounterKey) advanceEncounter();
              else if (!bubble.choices) setBubble(null);
            }}
          >
            <strong>{bubble.name}</strong>
            <span>{bubble.text}</span>
            {bubble.choices && (
              <div className="bubble-choices">
                {bubble.choices.map((c) => (
                  <button key={c.label} type="button" onClick={c.pick}>
                    {c.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {hover && !writeOpen && (
          <div
            className="city-label"
            style={{ left: hover.x, top: hover.y - 34 }}
            aria-hidden="true"
          >
            {hover.file === "__billboard__" ? t("board.name") : hover.file.replace(/\.md$/, "")}
          </div>
        )}
        {empty && introDone && !welcomeOpen && (
          <button type="button" className="city-first" onClick={() => openWrite()}>
            <span className="first-foundation" aria-hidden="true" />
            {t("city.first")}
          </button>
        )}
        {welcomeOpen && introDone && (
          <div className="welcome-card" role="dialog" aria-label="Tata">
            <p>{t("welcome.l1")}</p>
            <p>{t("welcome.l2")}</p>
            {(() => {
              if (nativeAvailable()) return <p>{t("welcome.l3.native")}</p>;
              // a phone browser cannot reach a desktop Obsidian — that
              // promise stays where it can be kept
              if (window.matchMedia("(max-width: 720px)").matches) return null;
              return <p>{t("welcome.l3")}</p>;
            })()}
            <div className="welcome-actions">
              <button
                type="button"
                className="welcome-write"
                onClick={() => {
                  setWelcomeOpen(false);
                  window.localStorage.setItem("tata.visited", "1");
                  setWelcomeOpen(false);
                  openWrite();
                }}
              >
                {t("welcome.write")}
              </button>
              <button
                type="button"
                onClick={() => {
                  // looking at the sample must not burn the welcome for later
                  window.location.search = "?demo=40";
                }}
              >
                {t("welcome.demo")}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="grain" aria-hidden="true" />

      <div className={"intro-veil" + (introDone ? " done" : "")} aria-hidden={introDone}>
        <h1 className="intro-brand">Tata</h1>
        <p className="intro-line">Signal becomes structure.</p>
      </div>

      <header className="topbar immersion-ui">
        <div className="brand">
          <button
            type="button"
            className="brand-you"
            onClick={() => setIdOpen(true)}
            title={t("id.title")}
            aria-label={t("id.title")}
          >
            <PixelIcon rows={youRows} size={30} pal={AMBER_PAL} />
          </button>
          <div className="brand-col">
          <span className="brand-eyebrow" aria-hidden="true">Tata</span>
          <span className="brand-word">{game.name || t("mirror.name.placeholder")}</span>
          {!empty && (
            <span className="brand-ledger" aria-hidden="true">
              LV {level} · {Math.floor(balance)} W · {streakOf(metrics, today)}
              {t("hud.nights")}
            </span>
          )}
          <button
            type="button"
            className={"signal" + (synced === "live" ? " live" : "")}
            onClick={() => {
              if (synced !== "live") {
                openWrite();
                setRequestSetup(Date.now());
              }
            }}
            title={synced === "live" ? t("signal.title.connected") : t("signal.title.connect")}
          >
            <i />
            {synced === "live" ? t("signal.receiving") : loadConfig() ? t("signal.reconnecting") : t("signal.connect")}
          </button>
          </div>
        </div>
        <div className="topbar-actions">
          <button
            type="button"
            onClick={() => {
              hum().click();
              if (searchOpen) {
                setSearchOpen(false);
                setQuery("");
              } else {
                setSearchOpen(true);
                window.setTimeout(() => searchInputRef.current?.focus(), 50);
              }
            }}
            className={searchOpen ? "active" : ""}
            aria-label={t("topbar.search")}
          >
            <span className="icon-search" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => { hum().click(); setSettingsOpen(!settingsOpen); }}
            className={settingsOpen ? "active" : ""}
            aria-label={t("topbar.settings")}
            aria-expanded={settingsOpen}
          >
            <span className="icon-dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
          </button>
        </div>
      </header>

      {searchOpen && (
        <div className="search-veil immersion-ui">
          <div className="search-box">
            <input
              ref={searchInputRef}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.nativeEvent.isComposing) return; // picking a candidate, not submitting
                if (event.key === "Enter" && matches && matches.size > 0) {
                  const best = metrics
                    .filter((m) => matches.has(m.file))
                    .sort((a, b) => b.mtime - a.mtime)[0];
                  if (best) {
                    openWrite(best.file);
                    setSearchOpen(false);
                    setQuery("");
                  }
                }
              }}
              placeholder={t("search.placeholder")}
              spellCheck={false}
              aria-label={t("search.aria")}
            />
            <button
              type="button"
              onClick={() => {
                setSearchOpen(false);
                setQuery("");
              }}
              aria-label={t("common.close")}
            >
              ×
            </button>
          </div>
          {matches && matches.size > 0 && (
            <div className="search-results">
              {metrics
                .filter((m) => matches.has(m.file))
                .sort((a, b) => b.mtime - a.mtime)
                .slice(0, 12)
                .map((m) => (
                  <button
                    key={m.file}
                    type="button"
                    onClick={() => {
                      openWrite(m.file);
                      setSearchOpen(false);
                      setQuery("");
                    }}
                  >
                    <strong>{m.file.replace(/\.md$/, "")}</strong>
                    <em>
                      {m.words}
                      {t("notes.wordunit")}
                    </em>
                  </button>
                ))}
            </div>
          )}
          {query.trim() !== "" && matches && matches.size === 0 && (
            <p className="search-empty">{t("search.empty")}</p>
          )}
        </div>
      )}

      {!writeOpen && (
        <>
        <button
          type="button"
          className="dpad-summon immersion-ui"
          onClick={() => {
            hum().click();
            registerActivity();
            setCompassOpen((v) => !v);
          }}
          aria-label={t("compass.aria")}
          aria-expanded={compassOpen}
        >
          <PixelIcon rows={COMPASS_ROSE} size={22} />
        </button>
        <nav
          className="dpad immersion-ui"
          aria-label={t("topbar.settings")}
          onClickCapture={() => setCompassOpen(false)}
        >
          <PixelIcon rows={COMPASS_RING} size={148} pal={BOOK_PAL_PAGE} />
          <button
            type="button"
            className="dpad-btn dpad-up"
            onClick={() => {
              openWrite();
              setRequestToday(Date.now());
            }}
            title={t("today.title")}
            aria-label={t("notes.today")}
          >
            <PixelIcon rows={BACKPACK_ICON} size={24} />
          </button>
          <button
            type="button"
            className="dpad-btn dpad-left"
            onClick={() => {
              openWrite();
              setRequestArchive(Date.now());
            }}
            aria-label={t("notes.archive")}
            title={t("notes.archive")}
          >
            <PixelIcon rows={CABINET_ICON} size={20} />
          </button>
          <button
            type="button"
            className="dpad-btn dpad-right"
            onClick={() => {
              hum().click();
              setMirrorOpen(true);
            }}
            aria-label={t("registry.mirror")}
            title={t("registry.mirror")}
          >
            <PixelIcon rows={MIRROR_ICON} size={20} />
          </button>
          <button
            type="button"
            className="dpad-btn dpad-down"
            onClick={() => {
              hum().click();
              setShopOpen(!shopOpen);
            }}
            aria-label={t("topbar.depot")}
            title={t("topbar.depot")}
          >
            <PixelIcon rows={DEPOT_PX} size={20} />
          </button>
          <button
            type="button"
            className="dpad-btn dpad-core"
            onClick={() => {
              hum().click();
              setDexOpen(!dexOpen);
            }}
            aria-label={t("topbar.registry")}
            title={t("topbar.registry")}
          >
            {(game.letters ?? []).some((l) => !l.read) && (
              <span className="unread-dot" aria-hidden="true" />
            )}
            <PixelIcon rows={REGISTRY_PX} size={18} />
          </button>
        </nav>
        </>
      )}

      {idOpen && (
        <div className="letter-veil" role="dialog" aria-label={t("id.title")} onClick={() => setIdOpen(false)}>
          <div className="id-card" onClick={(e) => e.stopPropagation()}>
            <div className="id-head">
              <span className="id-issuer">TATA · {t("id.title")}</span>
              <span className="id-seal" aria-hidden="true">✦</span>
            </div>
            <div className="id-body">
              <div className="id-photo">
                <PixelIcon rows={youRows} size={72} pal={AMBER_PAL} />
              </div>
              <div className="id-fields">
                <strong>{game.name || t("mirror.name.placeholder")}</strong>
                {game.name && <em>{t("id.subtitle")}</em>}
                <span>
                  {t("id.since")} {citizen.first} · {t("id.day.pre")}{citizen.resident}{t("id.day.post")}
                </span>
                <span>
                  {citizen.pages}{t("id.pages")} · {citizen.nights}{t("id.nights")} · {t("id.best")}{citizen.best}{t("hud.nights")}
                </span>
                <span>
                  LV {level} · {Math.floor(balance)} W · {t("id.known.pre")}{citizen.known}{t("id.known.post")}
                </span>
                {(() => {
                  const lp = levelProgress(earned);
                  return (
                    <div className="lv-bar" aria-hidden="true" title={`${lp.into} / ${lp.need} W`}>
                      <i style={{ width: `${Math.min(100, (lp.into / lp.need) * 100)}%` }} />
                    </div>
                  );
                })()}
              </div>
            </div>
            <div className="id-foot">
              <span className="id-barcode" aria-hidden="true" />
              <span className="id-serial">NO. {citizen.serial}</span>
              <button
                type="button"
                onClick={() => {
                  setIdOpen(false);
                  setMirrorOpen(true);
                }}
              >
                {t("id.dress")}
              </button>
            </div>
          </div>
        </div>
      )}
      {letterOpen && (
        <div className="letter-veil" role="dialog" aria-label={t("letters.title")} onClick={() => setLetterOpen(null)}>
          <div className="letter-paper" onClick={(e) => e.stopPropagation()}>
            <pre>
              {bodyOf(letterOpen, (game.letters ?? []).find((l) => l.id === letterOpen)?.date ?? "")}
            </pre>
            <div className="letter-actions">
              {synced === "live" && (
                <button type="button" onClick={() => exportLetter(letterOpen)}>
                  {t("letters.export")}
                </button>
              )}
              <button type="button" onClick={() => setLetterOpen(null)}>
                {t("common.close")}
              </button>
            </div>
          </div>
        </div>
      )}
      {monthListOpen && !writeOpen && (
        <div
          className="month-list immersion-ui"
          role="dialog"
          aria-label={t("months.list")}
          ref={(el) => {
            // a month opens on its newest page, not January of the scroll
            if (el) el.scrollTop = el.scrollHeight;
          }}
        >
          <div className="month-jump">
            {cityPlan.blocks.map((b, i) => (
              <button
                key={b.month}
                type="button"
                className={i === monthIx ? "active" : ""}
                onClick={() => {
                  setMonthIx(i);
                  setGoMonth({ x: b.x, z: b.z, n: Date.now() });
                }}
              >
                {b.month}
              </button>
            ))}
          </div>
          {metrics
            .filter((m) => m.date.startsWith(cityPlan.blocks[Math.max(0, monthIx)]?.month ?? "----"))
            .sort((a2, b2) => (a2.date < b2.date ? -1 : 1))
            .map((m) => (
              <button
                key={m.file}
                type="button"
                onClick={() => {
                  setMonthListOpen(false);
                  openWrite(m.file);
                }}
              >
                <span>{m.date.slice(8)}</span>
                <strong>{m.file.replace(/\.md$/, "")}</strong>
                <em>{m.words}{t("notes.wordunit")}</em>
              </button>
            ))}
          {metrics.filter((m) =>
            m.date.startsWith(cityPlan.blocks[Math.max(0, monthIx)]?.month ?? "----"),
          ).length === 0 && <p>{t("months.empty")}</p>}
          <CityMinimap
            plan={cityPlan}
            activeMonth={cityPlan.blocks[Math.max(0, monthIx)]?.month ?? null}
            todayFile={metrics.find((m) => m.date === today && / (Today|Tonight)\.md$/.test(m.file))?.file ?? null}
            onPickMonth={(i) => {
              const b = cityPlan.blocks[i];
              setMonthIx(i);
              if (b) setGoMonth({ x: b.x, z: b.z, n: Date.now() });
            }}
            onPickLot={(file) => {
              setMonthListOpen(false);
              openWrite(file);
            }}
          />
        </div>
      )}
      {isDemoCity && (
        <button
          type="button"
          className="demo-exit immersion-ui"
          onClick={() => {
            window.location.search = "";
          }}
        >
          {t("demo.exit")}
        </button>
      )}
      {gl3d && !empty && !writeOpen && cityPlan.blocks.length > 0 && (
        <div className="month-dock immersion-ui" aria-label={t("months.aria")}>
          <button type="button" onClick={() => jumpMonth(-1)} aria-label={t("months.earlier")}>
            ◀
          </button>
          <button
            type="button"
            className={"month-label" + (monthListOpen ? " active" : "")}
            onClick={() => {
              hum().click();
              setMonthListOpen((v) => !v);
            }}
            aria-expanded={monthListOpen}
            aria-label={t("months.list")}
          >
            {cityPlan.blocks[Math.max(0, monthIx)]?.month ?? ""}
          </button>
          <button type="button" onClick={() => jumpMonth(1)} aria-label={t("months.later")}>
            ▶
          </button>
        </div>
      )}

      <Clock />



      <NotesPanel
        onPutAway={onPutAway}
        requestArchive={requestArchive}
        open={writeOpen}
        onClose={closeWrite}
        onPin={pinSentence}
        requestOpen={requestOpen}
        requestToday={requestToday}
        lang={lang}
        backlinks={backlinks}
        onOpenTag={(tag) => {
          setSearchOpen(true);
          setQuery(`#${tag}`);
        }}
        requestSetup={requestSetup}
        recent={recent}
        pages={allPages}
        onConnected={onConnected}
        cityLive={synced === "live"}
        onWords={onWords}
        onSaved={onSaved}
        onActiveFile={setFocusFile}
        t={t}
      />

      <aside
        className="settings-panel dex-panel"
        aria-label={t("registry.title")}
        aria-hidden={!dexOpen}
        inert={!dexOpen}
      >
        <div className="panel-heading">
          <span>{t("registry.title")}</span>
          <button type="button" onClick={() => setDexOpen(false)} aria-label={t("common.close")}>
            ×
          </button>
        </div>
        <div className="dex-actions">
          <button
            type="button"
            className="dex-mirror"
            onClick={() => {
              setDexOpen(false);
              setMirrorOpen(true);
            }}
          >
            {t("registry.mirror")}
          </button>
          <button
            type="button"
            className="dex-mirror"
            onClick={() => {
              setDexOpen(false);
              hum().click();
              setReplayOn(true);
            }}
          >
            {t("registry.rings")}
          </button>
        </div>
        <div className="dex-items">
          <div className="dex-grid">
            {dex.map((d) => (
              <button
                key={d.id}
                type="button"
                className={"dex-tile" + (d.n > 0 ? " found" : "") + (dexPick === d.id ? " picked" : "")}
                onClick={() => setDexPick((v) => (v === d.id ? null : d.id))}
                aria-label={d.n > 0 ? d.name : t("registry.unknown")}
              >
                {d.n > 0 && d.icon ? <PixelIcon rows={d.icon} size={24} /> : <i>{d.n > 0 ? "◆" : "?"}</i>}
              </button>
            ))}
          </div>
          {(() => {
            const d = dex.find((x) => x.id === dexPick);
            if (!d) return null;
            return (
              <p className="dex-caption">
                <strong>{d.n > 0 ? d.name : t("registry.unknown")}</strong>
                {d.n > 0 ? ` — ${d.line} · ${t("registry.standing")}${d.n}` : ` — ${t("registry.notbuilt")}`}
              </p>
            );
          })()}
        </div>
        {knownResidents.length > 0 && (
          <>
            <div className="panel-heading dex-sub">
              <span>{t("registry.neighbours")}</span>
            </div>
            <div className="dex-items">
              <div className="dex-grid">
                {knownResidents.map((r) => (
                  <button
                    key={r.key}
                    type="button"
                    className={"dex-tile found" + (neighbourPick === r.key ? " picked" : "")}
                    onClick={() => setNeighbourPick((v) => (v === r.key ? null : r.key))}
                    aria-label={r.name}
                  >
                    {r.kind === "person" ? (
                      <PixelIcon
                        rows={(npcSheet[`npc${r.seed % 12}_S_i`] ?? youRows).slice(0, 7)}
                        size={30}
                      />
                    ) : (
                      <PixelIcon rows={r.kind === "cat" ? iconOf("cats")! : iconOf("dog")!} size={22} />
                    )}
                  </button>
                ))}
              </div>
              {(() => {
                const i = knownResidents.findIndex((x) => x.key === neighbourPick);
                if (i < 0) return null;
                const r = knownResidents[i];
                const numeral = knownResidents.some((o, j) => o.name === r.name && j < i)
                  ? ` ${"Ⅱ Ⅲ Ⅳ Ⅴ".split(" ")[Math.min(3, knownResidents.filter((o, j) => o.name === r.name && j < i).length - 1)] ?? "Ⅴ"}`
                  : "";
                return (
                  <p className="dex-caption">
                    <strong>{r.name}{numeral}</strong>
                    {r.prof ? ` · ${t("prof." + r.prof)}` : ""} — {"\u25a0".repeat(r.tier)}
                    {"\u25a1".repeat(4 - r.tier)} {tierName(r.tier, lang)}
                  </p>
                );
              })()}
            </div>
          </>
        )}
        {(game.letters ?? []).length > 0 && (
          <>
            <div className="panel-heading dex-sub">
              <span>{t("letters.title")}</span>
            </div>
            <div className="dex-items">
              {(game.letters ?? []).map((l) => (
                <button
                  key={l.id}
                  type="button"
                  className={"dex-item found letter-row" + (l.read ? "" : " unread")}
                  onClick={() => {
                    setLetterOpen(l.id);
                    setGame((prev) => {
                      if ((prev.letters ?? []).find((x) => x.id === l.id)?.read) return prev;
                      const next: GameState = {
                        ...prev,
                        letters: (prev.letters ?? []).map((x) =>
                          x.id === l.id ? { ...x, read: true } : x,
                        ),
                        updatedAt: Date.now(),
                      };
                      void saveGameState(next, clientRef.current);
                      return next;
                    });
                  }}
                >
                  <strong>
                    {l.id.startsWith("month-")
                      ? `${t("letters.archive")} · ${l.id.slice(6)}`
                      : l.id.startsWith("capsule-")
                        ? `${t("letters.capsule")} · ${l.id.slice(8).replace(/\.md$/, "")}`
                        : `${commissionDef(l.id)?.caretaker} · ${t("comm." + l.id + ".name")}`}
                  </strong>
                  <em>{l.date}</em>
                </button>
              ))}
            </div>
          </>
        )}
      </aside>

      <MirrorPanel
        open={mirrorOpen}
        look={game.look}
        owned={game.owned}
        watts={earned - game.spent}
        onClose={() => setMirrorOpen(false)}
        onUnlock={unlockPart}
        onWear={wearLook}
        name={game.name ?? ""}
        onName={(next) => {
          setGame((prev) => {
            const g2: GameState = { ...prev, name: next, updatedAt: Date.now() };
            void saveGameState(g2, clientRef.current);
            return g2;
          });
        }}
        t={t}
      />

      <aside
        className="settings-panel shop-panel"
        aria-label={t("topbar.depot")}
        aria-hidden={!shopOpen}
        inert={!shopOpen}
      >
        <div className="panel-heading">
          <span>{t("topbar.depot")}</span>
          <button type="button" onClick={() => setShopOpen(false)} aria-label={t("common.close")}>
            ×
          </button>
        </div>
        {/* the shelves scroll indoors; heading and counter keep their posts */}
        <div className="depot-scroll">
        <div className="depot-balance">
          <b>{balance}</b>
          <span>
            {t("depot.balance.watts")} · {t("depot.balance.level")} {level} · {t("depot.balance.skyline")} {levelCap} {t("depot.balance.floors")}
          </span>
        </div>
        <div className="depot-orders" aria-label={t("orders.aria")}>
          {orders.map((o) => (
            <span key={o.id} className={o.done ? "done" : ""}>
              {o.done ? "■" : "□"} {t("order." + o.id) !== "order." + o.id ? t("order." + o.id) : o.name}{" "}
              <b>+{o.bonus}</b>
            </span>
          ))}
        </div>
        <div className="depot-items">
          {CATALOG.map((item) => {
            const owned = game.owned.includes(item.id);
            const affordable = balance >= item.cost;
            const locked = (item.minLevel ?? 0) > level;
            const active =
              (item.kind === "weather" && game.weather === item.id) ||
              (item.kind === "skin" && game.skin === item.id);
            const stashed = (game.stashed ?? []).includes(item.id);
            const clickable = owned
              ? item.kind === "weather" ||
                (item.kind === "skin" && !active) ||
                item.kind === "decor" ||
                item.kind === "creature"
              : affordable && !locked;
            const movable = owned && (item.id === "fountain" || item.id === "observatory");
            const itemName =
              t("shop." + item.id + ".name") !== "shop." + item.id + ".name"
                ? t("shop." + item.id + ".name")
                : item.name;
            const itemLine =
              t("shop." + item.id + ".line") !== "shop." + item.id + ".line"
                ? t("shop." + item.id + ".line")
                : item.line;
            void itemLine; void movable; void clickable; // the counter's business now
            return (
              // a tile is a shelf: the goods, the name, the price. The one
              // sentence each item owns waits at the counter below, so fifty
              // products stay a wall of squares, never a scroll of prose.
              <button
                key={item.id}
                type="button"
                className={
                  "depot-item" +
                  (owned ? " owned" : "") +
                  (active ? " active" : "") +
                  (stashed ? " stashed" : "") +
                  (!owned && (locked || !affordable) ? " locked" : "") +
                  (depotPick === item.id ? " picked" : "")
                }
                aria-pressed={depotPick === item.id}
                onClick={() => {
                  hum().click();
                  setDepotPick(item.id);
                }}
              >
                {(() => {
                  const ic = iconOf(item.id);
                  return ic ? <PixelIcon rows={ic} /> : null;
                })()}
                <strong>{itemName}</strong>
                <span>
                  {active
                    ? t("depot.state.tonight")
                    : owned
                      ? (item.kind === "decor" || item.kind === "creature")
                        ? stashed
                          ? t("depot.state.stashed")
                          : t("depot.state.shown")
                        : t("depot.state.owned")
                      : locked
                        ? `${t("depot.balance.level")} ${item.minLevel}`
                        : `${item.cost} ${t("depot.unit.w")}`}
                </span>
              </button>
            );
          })}
        </div>
        <div className="panel-heading dex-sub">
          <span>{t("works.title")}</span>
        </div>
        <div className="depot-items">
          {COMMISSION_CATALOG.map((def) => {
            const mine = (game.commissions ?? []).find((c) => c.id === def.id);
            const prog = mine && nowTs ? progressOf(mine, nowTs) : 0;
            const affordable = balance >= def.cost;
            const locked = def.minLevel > level;
            return (
              <button
                key={def.id}
                type="button"
                className={
                  "depot-item" +
                  (mine ? " owned" : "") +
                  (!mine && (locked || !affordable) ? " locked" : "") +
                  (depotPick === def.id ? " picked" : "")
                }
                aria-pressed={depotPick === def.id}
                onClick={() => {
                  hum().click();
                  setDepotPick(def.id);
                }}
              >
                {(() => {
                  const ic = iconOf(def.id);
                  return ic ? <PixelIcon rows={ic} /> : null;
                })()}
                <strong>{t("comm." + def.id + ".name")}</strong>
                <span>
                  {mine
                    ? prog >= 1
                      ? t("works.open")
                      : `${t("works.building")} ${Math.min(
                          def.days,
                          Math.floor(prog * def.days) + 1,
                        )}/${def.days}`
                    : locked
                      ? `${t("depot.balance.level")} ${def.minLevel}`
                      : `${def.cost} W · ${def.days} ${t("works.days")}`}
                </span>
              </button>
            );
          })}
        </div>
        </div>
        {(() => {
          /* the counter: the picked tile's sentence, and its one verb */
          const cat = CATALOG.find((i) => i.id === depotPick);
          const def = cat ? undefined : COMMISSION_CATALOG.find((d) => d.id === depotPick);
          if (cat) {
            const owned = game.owned.includes(cat.id);
            const affordable = balance >= cat.cost;
            const locked = (cat.minLevel ?? 0) > level;
            const active =
              (cat.kind === "weather" && game.weather === cat.id) ||
              (cat.kind === "skin" && game.skin === cat.id);
            const stashed = (game.stashed ?? []).includes(cat.id);
            const clickable = owned
              ? cat.kind === "weather" ||
                (cat.kind === "skin" && !active) ||
                cat.kind === "decor" ||
                cat.kind === "creature"
              : affordable && !locked;
            const movable = owned && (cat.id === "fountain" || cat.id === "observatory");
            const name = t("shop." + cat.id + ".name") !== "shop." + cat.id + ".name" ? t("shop." + cat.id + ".name") : cat.name;
            const line = t("shop." + cat.id + ".line") !== "shop." + cat.id + ".line" ? t("shop." + cat.id + ".line") : cat.line;
            return (
              <div className="depot-counter">
                <div className="counter-words">
                  <strong>{name}</strong>
                  <em>{line}</em>
                </div>
                {movable && !stashed && (
                  <button
                    type="button"
                    className="move-chip"
                    onClick={() => {
                      hum().click();
                      setMoveMode(cat.id);
                      setShopOpen(false);
                    }}
                  >
                    {t("depot.move")}
                  </button>
                )}
                <button type="button" className="counter-act" disabled={!clickable} onClick={() => buy(cat.id)}>
                  {active
                    ? t("depot.state.tonight")
                    : owned
                      ? (cat.kind === "decor" || cat.kind === "creature")
                        ? stashed
                          ? t("depot.state.stashed")
                          : t("depot.state.shown")
                        : t("depot.state.owned")
                      : locked
                        ? `${t("depot.balance.level")} ${cat.minLevel}`
                        : `${cat.cost} ${t("depot.unit.w")}`}
                </button>
              </div>
            );
          }
          if (def) {
            const mine = (game.commissions ?? []).find((c) => c.id === def.id);
            const prog = mine && nowTs ? progressOf(mine, nowTs) : 0;
            const affordable = balance >= def.cost;
            const locked = def.minLevel > level;
            return (
              <div className="depot-counter">
                <div className="counter-words">
                  <strong>{t("comm." + def.id + ".name")}</strong>
                  <em>{t("comm." + def.id + ".line")}</em>
                </div>
                {mine && prog >= 1 && (
                  <button
                    type="button"
                    className="move-chip"
                    onClick={() => {
                      hum().click();
                      setMoveMode(def.id);
                      setShopOpen(false);
                    }}
                  >
                    {t("depot.move")}
                  </button>
                )}
                <button
                  type="button"
                  className="counter-act"
                  disabled={Boolean(mine) || locked || !affordable}
                  onClick={() => orderCommission(def.id)}
                >
                  {mine
                    ? prog >= 1
                      ? t("works.open")
                      : `${t("works.building")} ${Math.min(def.days, Math.floor(prog * def.days) + 1)}/${def.days}`
                    : locked
                      ? `${t("depot.balance.level")} ${def.minLevel}`
                      : `${def.cost} W · ${def.days} ${t("works.days")}`}
                </button>
              </div>
            );
          }
          return null;
        })()}
      </aside>

      <aside
        className="settings-panel"
        aria-label={t("topbar.settings")}
        aria-hidden={!settingsOpen}
        inert={!settingsOpen}
      >
        <div className="panel-heading">
          <span>{t("topbar.settings")}</span>
          <button type="button" onClick={() => setSettingsOpen(false)} aria-label={t("common.close")}>
            ×
          </button>
        </div>
        <DebugPanel />
        <div className="panel-toggles">
          {/* three shelves: the room, your words, the small print */}
          <p className="settings-sec">{t("settings.sec.env")}</p>
          {canFullscreen && (
            // on phones the app already fills the glass — the row is noise
            <label className="row-fullscreen">
              <span>{t("topbar.fullscreen.enter")}</span>
              <button
                type="button"
                className={"toggle" + (isFullscreen ? " on" : "")}
                onClick={toggleFullscreen}
                aria-pressed={isFullscreen}
              >
                <i />
              </button>
            </label>
          )}
          <label>
            <span>{t("topbar.hum.on")}</span>
            <button
              type="button"
              className={"toggle" + (humOn ? " on" : "")}
              onClick={toggleHum}
              aria-pressed={humOn}
            >
              <i />
            </button>
          </label>
          <label>
            <span>{t("settings.chime")}</span>
            <button
              type="button"
              className={"toggle" + (chimeOn ? " on" : "")}
              onClick={() => setChimeOn(!chimeOn)}
              aria-pressed={chimeOn}
            >
              <i />
            </button>
          </label>
          <label>
            <span>{t("settings.language")}</span>
            <span className="lang-switch">
              <button
                type="button"
                className={"mirror-opt" + (lang === "en" ? " active" : "")}
                aria-pressed={lang === "en"}
                onClick={() => changeLang("en")}
              >
                EN
              </button>
              <button
                type="button"
                className={"mirror-opt" + (lang === "zh" ? " active" : "")}
                aria-pressed={lang === "zh"}
                onClick={() => changeLang("zh")}
              >
                中文
              </button>
            </span>
          </label>
          <p className="settings-sec">{t("settings.sec.pages")}</p>
          <button type="button" className="panel-export" onClick={() => void exportPages()}>
            {t("settings.export")}
          </button>
          <label className="panel-export">
            {t("settings.import")}
            <input
              type="file"
              accept=".zip"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void importPages(f);
              }}
            />
          </label>
          <p className="settings-sec">{t("settings.sec.about")}</p>
          <button
            type="button"
            className="panel-export"
            aria-expanded={fbOpen}
            onClick={() => setFbOpen((v) => !v)}
          >
            {t("settings.feedback")}
          </button>
          {fbOpen && (
            <div className="feedback-box">
              <textarea
                value={fbText}
                onChange={(e) => setFbText(e.target.value)}
                rows={4}
                maxLength={2000}
                placeholder={t("feedback.placeholder")}
                spellCheck={false}
              />
              <button
                type="button"
                className="panel-export feedback-send"
                disabled={!fbText.trim()}
                onClick={() => {
                  // no server of ours in between: the words ride the
                  // visitor's own mail, addressed to the city hall.
                  // mailto fails SILENTLY where no mail app is set up, so
                  // the clipboard always gets a copy and the desk says so.
                  const text = fbText.trim();
                  // the receipt prints before the courier leaves — a blocked
                  // mailto must not also swallow the acknowledgement
                  setFbNote(t("feedback.handed"));
                  window.setTimeout(() => setFbNote(null), 7000);
                  try {
                    void navigator.clipboard?.writeText(`${text}\n\n→ hello@tata.page`);
                  } catch {
                    /* no clipboard, no ceremony */
                  }
                  try {
                    window.location.href = `mailto:hello@tata.page?subject=${encodeURIComponent(
                      "Tata",
                    )}&body=${encodeURIComponent(text)}`;
                  } catch {
                    /* some webviews refuse the scheme — the clipboard copy stands */
                  }
                }}
              >
                {t("feedback.send")}
              </button>
              {fbNote && <em className="feedback-note">{fbNote}</em>}
            </div>
          )}
          {/* guideline 5.1.1(i): the policy must be reachable from inside */}
          <a
            className="panel-export panel-privacy"
            href="https://tata.page/privacy/"
            target="_blank"
            rel="noreferrer"
          >
            {t("settings.privacy")}
          </a>
        </div>
        <div className="panel-shortcuts">
          <span><b>← → ↑ ↓</b> {t("shortcuts.pan")}</span>
          <span><b>Q E</b> {t("shortcuts.rotate")}</span>
          <span><b>[ ]</b> {t("shortcuts.months")}</span>
          <span><b>/</b> {t("shortcuts.search")}</span>
          <span><b>N</b> {t("shortcuts.write")}</span>
          <span><b>B</b> {t("shortcuts.depot")}</span>
          <span><b>C</b> {t("shortcuts.registry")}</span>
          <span><b>M</b> {t("shortcuts.mirror")}</span>
          <span><b>Z</b> {t("shortcuts.zen")}</span>
          <span><b>Esc</b> {t("shortcuts.close")}</span>
        </div>
      </aside>
    </main>
  );
}

function Clock() {
  const [time, setTime] = useState("");
  const [date, setDate] = useState("");

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setTime(now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }));
      setDate(
        now.toLocaleDateString("en-GB", { weekday: "long", month: "short", day: "numeric" }),
      );
    };
    tick();
    const id = window.setInterval(tick, 20000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="night-clock immersion-ui" aria-hidden="true">
      <b>{time}</b>
      <span>{date}</span>
    </div>
  );
}
