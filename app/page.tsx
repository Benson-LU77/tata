"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { City3D } from "./components/city3d";
import { NotesPanel } from "./components/notes";
import { Hum } from "./lib/hum";
import { planCity } from "./lib/city/plan";
import { demoMetrics, loadCityMetrics, dateOf } from "./lib/city/metrics";
import type { NoteMetric } from "./lib/city/metrics";
import { ObsidianClient, loadConfig } from "./lib/obsidian";
import { cityCache } from "./lib/drafts";
import { bestStreakOf, earnedWatts, levelFromWatts, orderBonus, skylineCap, streakBonus, streakOf, workOrders } from "./lib/game/watts";
import { dateAtCell, floorsOf } from "./lib/city/plan";
import { CATALOG, EMPTY_STATE, loadGameState, saveGameState } from "./lib/game/shop";
import type { GameState } from "./lib/game/shop";
import { greet, tierOf, nameOf, lineFor, tierName } from "./lib/game/bonds";
import type { CreatureKind } from "./lib/city/residents";
import { hash32 } from "./lib/city/layout";
import { MirrorPanel } from "./components/mirror";
import { professionOf } from "./lib/city/npc";
import {
  COMMISSION_CATALOG,
  commissionDef,
  letterBody,
  monthlyLetterBody,
  progressOf,
  resolveCommissions,
} from "./lib/game/commissions";
import { REPLY_LINES } from "./lib/game/bonds-lines";
import { iconOf } from "./lib/game/icons";
import { PixelIcon } from "./components/pixel-icon";
import { loadLang, saveLang, makeT } from "./lib/i18n";
import type { Lang } from "./lib/i18n";

/** frozen archetype verdicts — module-level so render stays pure while the
 *  map quietly grows; persisted to localStorage after each plan */
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

export default function Home() {
  const [metrics, setMetrics] = useState<NoteMetric[]>([]);
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
  const [uiVisible, setUiVisible] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [canFullscreen, setCanFullscreen] = useState(true);
  const [humOn, setHumOn] = useState(false);
  const [chimeOn, setChimeOn] = useState(true);
  const [synced, setSynced] = useState<"live" | "cached" | "local">("local");
  const [gl3d, setGl3d] = useState(true);
  const [shopOpen, setShopOpen] = useState(false);
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
  const [encounterKey, setEncounterKey] = useState<string | null>(null);
  const encTimersRef = useRef<number[]>([]);
  const encStageRef = useRef<"their" | "reply" | null>(null);
  const encReplyRef = useRef<string>("");
  const [bubble, setBubble] = useState<{ key: string; name: string; text: string; until: number } | null>(null);
  const [emote, setEmote] = useState<{ key: string; icon: string; until: number } | null>(null);
  const [lang, setLang] = useState<Lang>("en");
  const t = useMemo(() => makeT(lang), [lang]);

  const humRef = useRef<Hum | null>(null);
  const clientRef = useRef<ObsidianClient | null>(null);
  const idleTimerRef = useRef<number | null>(null);
  const writeOpenRef = useRef(false);
  const wordsThrottleRef = useRef(0);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const bondSaveTimerRef = useRef<number | null>(null);
  const bondSaveStateRef = useRef<GameState | null>(null);

  const hum = useCallback(() => {
    humRef.current ??= new Hum();
    return humRef.current;
  }, []);

  const lastSyncRef = useRef(0);

  /** re-pull metrics from Obsidian; safe to call any time */
  const resync = useCallback(() => {
    if (new URLSearchParams(window.location.search).get("demo")) return;
    const config = loadConfig();
    if (config && !clientRef.current) clientRef.current = new ObsidianClient(config);
    lastSyncRef.current = Date.now();
    void loadCityMetrics(clientRef.current, (fresh) => {
      setMetrics(fresh);
      setSynced("live");
    }).then((quick) => {
      setMetrics((prev) => (prev.length > 0 ? prev : quick));
      setSynced((prev) => (prev === "live" ? prev : clientRef.current ? "cached" : "local"));
    });
  }, []);

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

  /* the notes panel just connected — adopt the client for the city too */
  const onConnected = useCallback(() => {
    const config = loadConfig();
    if (!config) return;
    clientRef.current = new ObsidianClient(config);
    resync();
    void loadGameState(clientRef.current).then((state) => setGame(state));
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
    void Promise.resolve().then(() => {
      const now = Date.now();
      setNowTs(now);
      const demo = new URLSearchParams(window.location.search).get("demo");
      if (demo) {
        setMetrics(demoMetrics(Number(demo) || 50, now));
        setSynced("local");
        return;
      }
      const config = loadConfig();
      const client = config ? new ObsidianClient(config) : null;
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
    () => planCity(metrics, dayTs, ARCH_PINS),
    [metrics, dayTs],
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
  const dex = useMemo(() => {
    const count = (a: number) => cityPlan.lots.filter((l) => l.arch === a).length;
    return [
      { id: 10, name: t("dex.lighthouse.name"), line: t("dex.lighthouse.line"), n: count(10) },
      { id: 11, name: t("dex.arch.name"), line: t("dex.arch.line"), n: count(11) },
      { id: 12, name: t("dex.chapel.name"), line: t("dex.chapel.line"), n: count(12) },
    ];
  }, [cityPlan.lots, t]);

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

  /** a click during the meeting turns the conversation one page */
  const lastAdvanceRef = useRef(0);
  const advanceEncounter = useCallback(() => {
    // double-fired pointer events must not skip a page of dialogue
    if (Date.now() - lastAdvanceRef.current < 650) return;
    lastAdvanceRef.current = Date.now();
    if (encStageRef.current === "their") {
      encStageRef.current = "reply";
      hum().click();
      setBubble({
        key: "you:0",
        name: "you",
        text: encReplyRef.current,
        until: Date.now() + 30000,
      });
    } else {
      clearEncounterTimers();
      encStageRef.current = null;
      setBubble(null);
      setEncounterKey(null);
    }
  }, [clearEncounterTimers, hum]);

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
      // start the walk — the greeting happens when you actually arrive
      clearEncounterTimers();
      encStageRef.current = null;
      setBubble(null);
      hum().click();
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
      if (nextBonds !== game.bonds) {
        const next: GameState = { ...game, bonds: nextBonds, updatedAt: now };
        setGame(next);
        scheduleBondSave(next);
      }
      const name = nameOf(kind, hit.seed);
      const sinceGreet = had
        ? Math.round((now - new Date(had.last + "T00:00:00").getTime()) / 86400000)
        : 0;
      const line = lineFor(
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
        },
        Math.random(),
        lang,
      );
      setBubble({ key: hit.key, name: had ? name : "someone", text: line, until: now + 30000 });
      setEmote({
        key: hit.key,
        icon: !had ? "emote_dots" : tierAfter > tierBefore ? "emote_heart" : "emote_wave",
        until: now + 1600,
      });
      hum().greet(hit.seed);
      if (tierAfter > tierBefore) hum().settle();
      // the exchange advances on your click; a long failsafe closes it
      const reply = REPLY_LINES[Math.floor(Math.random() * REPLY_LINES.length)];
      encReplyRef.current = lang === "zh" ? reply.zh : reply.en;
      encStageRef.current = "their";
      encTimersRef.current.push(window.setTimeout(() => setEncounterKey(null), 30000));
    },
    [game, hum, scheduleBondSave, lang, metrics, effectiveWeather],
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
    (id: string, date: string) =>
      id.startsWith("month-")
        ? monthlyLetterBody(id.slice(6), monthStats(id.slice(6)), lang)
        : letterBody(id, { months: cityPlan.blocks.length, pages: metrics.length, date }, lang),
    [monthStats, cityPlan.blocks.length, metrics.length, lang],
  );

  const exportLetter = useCallback(
    (id: string) => {
      const client = clientRef.current;
      const letter = (game.letters ?? []).find((l) => l.id === id);
      if (!client || !letter) return;
      void client.write(`Letters/${letter.date} ${id}.md`, bodyOf(id, letter.date) + "\n").catch(() => {});
    },
    [game.letters, bodyOf],
  );

  const extras = useMemo(
    () => ({
      cats: game.owned.includes("cats") ? 4 : 0,
      birds: game.owned.includes("birds") ? 6 : 0,
      dogs: game.owned.includes("dog") ? 1 : 0,
    }),
    [game.owned],
  );
  const decor = useMemo(
    () => ({
      lamps: game.owned.includes("lamps"),
      trees: game.owned.includes("trees"),
      fountain: game.owned.includes("fountain"),
      harbor: game.owned.includes("harbor"),
      viaduct: game.owned.includes("viaduct"),
      observatory: game.owned.includes("observatory"),
      sister: game.owned.includes("sister"),
      comet: game.owned.includes("comet"),
    }),
    [game.owned],
  );

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

  /* ---------- intro ---------- */

  useEffect(() => {
    const seen = window.localStorage.getItem("tata.visited");
    window.localStorage.setItem("tata.visited", "1");
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
    idleTimerRef.current = window.setTimeout(() => setUiVisible(false), 6000);
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

  const openWrite = useCallback((file?: string) => {
    clearEncounterTimers();
    setEncounterKey(null);
    setBubble(null);
    writeOpenRef.current = true;
    setWriteOpen(true);
    setUiVisible(true);
    if (file) setRequestOpen({ file, n: Date.now() });
  }, [clearEncounterTimers]);

  const onGroundTap = useCallback(
    (x: number, z: number) => {
      if (encounterKey) {
        advanceEncounter();
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
      if (!date || !today || date > today) return; // the future stays empty
      const existing = metrics.filter((m) => m.date === date);
      if (existing.length > 0) {
        openWrite(existing.sort((a2, b2) => b2.mtime - a2.mtime)[0].file);
      } else {
        // backfill: a page for a day that stayed dark — the bridge's true path
        hum().click();
        openWrite(date === today ? `${date} Today.md` : `${date}.md`);
      }
    },
    [cityPlan.blocks, metrics, today, openWrite, hum, encounterKey, advanceEncounter],
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
    const id = window.setTimeout(() => setCanFullscreen(Boolean(document.fullscreenEnabled)), 0);
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
            onHover={(file, x, y) => setHover(file ? { file, x, y } : null)}
            onOpen={(file) => openWrite(file)}
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
        {worksToast && (
          <div className="levelup-toast" role="status">
            {t("works.done.toast")}
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
          <div className="city-bubble city-bubble--docked" aria-live="polite">
            <strong>{bubble.name}</strong>
            <span>{bubble.text}</span>
          </div>
        )}
        {hover && !writeOpen && (
          <div
            className="city-label"
            style={{ left: hover.x, top: hover.y - 34 }}
            aria-hidden="true"
          >
            {hover.file.replace(/\.md$/, "")}
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
            <p>{t("welcome.l3")}</p>
            <div className="welcome-actions">
              <button
                type="button"
                className="welcome-write"
                onClick={() => {
                  setWelcomeOpen(false);
                  openWrite();
                }}
              >
                {t("welcome.write")}
              </button>
              <button
                type="button"
                onClick={() => {
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
          <span className="brand-word">Tata</span>
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
        <div className="topbar-actions">
          <button
            type="button"
            onClick={toggleHum}
            className={humOn ? "active" : ""}
            aria-label={humOn ? t("topbar.hum.mute") : t("topbar.hum.on")}
            aria-pressed={humOn}
          >
            <span className="icon-hum" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
          </button>
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
            onClick={() => { hum().click(); setShopOpen(!shopOpen); }}
            className={shopOpen ? "active" : ""}
            aria-label={t("topbar.depot")}
            aria-expanded={shopOpen}
          >
            <span className="icon-depot" aria-hidden="true">
              <i />
            </span>
          </button>
          <button
            type="button"
            onClick={() => { hum().click(); setDexOpen(!dexOpen); }}
            className={dexOpen ? "active" : ""}
            aria-label={t("topbar.registry")}
            aria-expanded={dexOpen}
          >
            {(game.letters ?? []).some((l) => !l.read) && (
              <span className="unread-dot" aria-hidden="true" />
            )}
            <span className="icon-registry" aria-hidden="true">
              <i />
              <i />
            </span>
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
          {canFullscreen && (
            <button
              type="button"
              onClick={toggleFullscreen}
              className={isFullscreen ? "active" : ""}
              aria-label={isFullscreen ? t("topbar.fullscreen.exit") : t("topbar.fullscreen.enter")}
            >
              <span className="icon-fullscreen" aria-hidden="true" />
            </button>
          )}
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
        <button
          type="button"
          className="tonight-cta immersion-ui"
          onClick={() => {
            openWrite();
            setRequestToday(Date.now());
          }}
          title={t("today.title")}
        >
          {t("notes.today")}
        </button>
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
        <div className="month-list immersion-ui" role="dialog" aria-label={t("months.list")}>
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
        </div>
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

      {!empty && (
        <div className="city-hud immersion-ui" aria-hidden="true">
          <span>{Math.floor(balance)} W</span>
          <span>
            {streakOf(metrics, today)}
            {t("hud.nights")}
          </span>
          <span>LV {level}</span>
        </div>
      )}

      <NotesPanel
        open={writeOpen}
        onClose={closeWrite}
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
        <div className="dex-items">
          {dex.map((d) => (
            <div key={d.id} className={"dex-item" + (d.n > 0 ? " found" : "")}>
              <strong>{d.n > 0 ? d.name : t("registry.unknown")}</strong>
              <em>{d.line}</em>
              <span>{d.n > 0 ? `${t("registry.standing")}${d.n}` : t("registry.notbuilt")}</span>
            </div>
          ))}
        </div>
        {knownResidents.length > 0 && (
          <>
            <div className="panel-heading dex-sub">
              <span>{t("registry.neighbours")}</span>
            </div>
            <div className="dex-items">
              {knownResidents.map((r) => (
                <div key={r.key} className="dex-item found">
                  <strong>
                    {r.name}
                    {r.prof && <span className="dex-prof"> · {t("prof." + r.prof)}</span>}
                  </strong>
                  <em>
                    {"\u25a0".repeat(r.tier)}
                    {"\u25a1".repeat(4 - r.tier)} {tierName(r.tier, lang)}
                  </em>
                </div>
              ))}
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
                      : `${commissionDef(l.id)?.caretaker} · ${t("comm." + l.id + ".name")}`}
                  </strong>
                  <em>{l.date}</em>
                </button>
              ))}
            </div>
          </>
        )}
        <p className="depot-note">{t("registry.footer")}</p>
      </aside>

      <MirrorPanel
        open={mirrorOpen}
        look={game.look}
        owned={game.owned}
        watts={earned - game.spent}
        onClose={() => setMirrorOpen(false)}
        onUnlock={unlockPart}
        onWear={wearLook}
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
            const clickable = owned
              ? item.kind === "weather" || (item.kind === "skin" && !active)
              : affordable && !locked;
            const itemName =
              t("shop." + item.id + ".name") !== "shop." + item.id + ".name"
                ? t("shop." + item.id + ".name")
                : item.name;
            const itemLine =
              t("shop." + item.id + ".line") !== "shop." + item.id + ".line"
                ? t("shop." + item.id + ".line")
                : item.line;
            return (
              <button
                key={item.id}
                type="button"
                className={"depot-item" + (owned ? " owned" : "") + (active ? " active" : "")}
                disabled={!clickable}
                onClick={() => buy(item.id)}
              >
                {(() => {
                  const ic = iconOf(item.id);
                  return ic ? <PixelIcon rows={ic} /> : null;
                })()}
                <strong>{itemName}</strong>
                <em>{itemLine}</em>
                <span>
                  {active
                    ? t("depot.state.tonight")
                    : owned
                      ? t("depot.state.owned")
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
                  (!mine && (locked || !affordable) ? " locked" : "")
                }
                disabled={Boolean(mine) || locked || !affordable}
                onClick={() => orderCommission(def.id)}
              >
                {(() => {
                  const ic = iconOf(def.id);
                  return ic ? <PixelIcon rows={ic} /> : null;
                })()}
                <strong>{t("comm." + def.id + ".name")}</strong>
                <em>{t("comm." + def.id + ".line")}</em>
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
        <p className="depot-note">{t("depot.footer")}</p>
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
        <div className="panel-toggles">
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
