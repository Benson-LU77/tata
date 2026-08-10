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
import { earnedWatts, levelFromWatts, orderBonus, skylineCap, streakOf, workOrders } from "./lib/game/watts";
import { floorsOf } from "./lib/city/plan";
import { CATALOG, EMPTY_STATE, loadGameState, saveGameState } from "./lib/game/shop";
import type { GameState } from "./lib/game/shop";

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
  const [uiVisible, setUiVisible] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
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

  const humRef = useRef<Hum | null>(null);
  const clientRef = useRef<ObsidianClient | null>(null);
  const idleTimerRef = useRef<number | null>(null);
  const writeOpenRef = useRef(false);
  const wordsThrottleRef = useRef(0);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

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

  const cityPlan = useMemo(() => planCity(metrics, nowTs), [metrics, nowTs]);

  /* ---------- watts & the depot ---------- */

  const today = useMemo(() => {
    if (!nowTs) return "";
    const d = new Date(nowTs);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }, [nowTs]);
  const earned = useMemo(() => earnedWatts(metrics) + orderBonus(metrics), [metrics]);
  const balance = earned - game.spent;
  const level = useMemo(() => levelFromWatts(earned), [earned]);
  const levelCap = skylineCap(level);
  const streak = useMemo(() => streakOf(metrics, today), [metrics, today]);
  const orders = useMemo(() => workOrders(metrics, today), [metrics, today]);
  const allPages = useMemo(() => metrics.map((m) => m.file), [metrics]);
  const recent = useMemo(
    () => [...metrics].sort((a, b) => b.mtime - a.mtime).slice(0, 6).map((m) => m.file),
    [metrics],
  );
  const dex = useMemo(() => {
    const count = (a: number) => cityPlan.lots.filter((l) => l.arch === a).length;
    return [
      { id: 10, name: "Lighthouse", line: "The first page after seven days away.", n: count(10) },
      { id: 11, name: "Arch", line: "A page written for a past empty day.", n: count(11) },
      { id: 12, name: "Chapel", line: "Written in the smallest hours, 2-4 am.", n: count(12) },
    ];
  }, [cityPlan.lots]);

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
    const t1 = window.setTimeout(() => setIntro(true), 150);
    const t2 = window.setTimeout(() => setIntroDone(true), 2100);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
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
    writeOpenRef.current = true;
    setWriteOpen(true);
    setUiVisible(true);
    if (file) setRequestOpen({ file, n: Date.now() });
  }, []);

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
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      registerActivity();
      if (event.key === "Escape") {
        if (searchOpen) {
          setSearchOpen(false);
          setQuery("");
        } else if (dexOpen) setDexOpen(false);
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
        setDexOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeWrite, dexOpen, jumpMonth, openWrite, registerActivity, searchOpen, settingsOpen, shopOpen]);

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
            weather={game.weather}
            writeMode={writeOpen}
            goMonth={goMonth}
            ceremony={ceremony}
            levelCap={levelCap}
            streak={streak}
            onHover={(file, x, y) => setHover(file ? { file, x, y } : null)}
            onOpen={(file) => openWrite(file)}
            onFail={() => setGl3d(false)}
          />
        ) : (
          <div className="no-gl">
            <strong>This city needs WebGL.</strong>
            <span>Your notes and the editor still work — press N to write.</span>
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
        {empty && introDone && (
          <button type="button" className="city-first" onClick={() => openWrite()}>
            <span className="first-foundation" aria-hidden="true" />
            the first structure
          </button>
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
            title={synced === "live" ? "Connected to Obsidian" : "Connect Obsidian"}
          >
            <i />
            {synced === "live" ? "receiving" : loadConfig() ? "reconnecting" : "connect"}
          </button>
        </div>
        <div className="topbar-actions">
          <button
            type="button"
            onClick={toggleHum}
            className={humOn ? "active" : ""}
            aria-label={humOn ? "Mute hum" : "City hum"}
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
              if (searchOpen) {
                setSearchOpen(false);
                setQuery("");
              } else {
                setSearchOpen(true);
                window.setTimeout(() => searchInputRef.current?.focus(), 50);
              }
            }}
            className={searchOpen ? "active" : ""}
            aria-label="Search"
          >
            <span className="icon-search" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setShopOpen(!shopOpen)}
            className={shopOpen ? "active" : ""}
            aria-label="Depot"
            aria-expanded={shopOpen}
          >
            <span className="icon-depot" aria-hidden="true">
              <i />
            </span>
          </button>
          <button
            type="button"
            onClick={() => setSettingsOpen(!settingsOpen)}
            className={settingsOpen ? "active" : ""}
            aria-label="Settings"
            aria-expanded={settingsOpen}
          >
            <span className="icon-dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
          </button>
          <button
            type="button"
            onClick={toggleFullscreen}
            className={isFullscreen ? "active" : ""}
            aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          >
            <span className="icon-fullscreen" aria-hidden="true" />
          </button>
        </div>
      </header>

      {searchOpen && (
        <div className="search-veil immersion-ui">
          <input
            ref={searchInputRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onBlur={() => {
              // clicking back into the city puts the light away
              window.setTimeout(() => {
                setSearchOpen(false);
                setQuery("");
              }, 120);
            }}
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
            placeholder="light up the city…"
            spellCheck={false}
            aria-label="Search notes"
          />
        </div>
      )}

      {!writeOpen && (
        <button
          type="button"
          className="tonight-cta immersion-ui"
          onClick={() => openWrite()}
          title="Write today's page — N"
        >
          Today
        </button>
      )}

      {gl3d && !empty && !writeOpen && cityPlan.blocks.length > 0 && (
        <div className="month-dock immersion-ui" aria-label="Months">
          <button type="button" onClick={() => jumpMonth(-1)} aria-label="Earlier month">
            ◀
          </button>
          <span>{cityPlan.blocks[Math.max(0, monthIx)]?.month ?? ""}</span>
          <button type="button" onClick={() => jumpMonth(1)} aria-label="Later month">
            ▶
          </button>
        </div>
      )}

      <Clock />

      <NotesPanel
        open={writeOpen}
        onClose={closeWrite}
        requestOpen={requestOpen}
        requestSetup={requestSetup}
        recent={recent}
        pages={allPages}
        onConnected={onConnected}
        cityLive={synced === "live"}
        onWords={onWords}
        onSaved={onSaved}
        onActiveFile={setFocusFile}
      />

      <aside
        className="settings-panel dex-panel"
        aria-label="Registry"
        aria-hidden={!dexOpen}
        inert={!dexOpen}
      >
        <div className="panel-heading">
          <span>Registry</span>
          <button type="button" onClick={() => setDexOpen(false)} aria-label="Close">
            ×
          </button>
        </div>
        <div className="dex-items">
          {dex.map((d) => (
            <div key={d.id} className={"dex-item" + (d.n > 0 ? " found" : "")}>
              <strong>{d.n > 0 ? d.name : "?????"}</strong>
              <em>{d.line}</em>
              <span>{d.n > 0 ? `standing: ${d.n}` : "not yet built"}</span>
            </div>
          ))}
        </div>
        <p className="depot-note">The city remembers how each page was written.</p>
      </aside>

      <aside
        className="settings-panel shop-panel"
        aria-label="Depot"
        aria-hidden={!shopOpen}
        inert={!shopOpen}
      >
        <div className="panel-heading">
          <span>Depot</span>
          <button type="button" onClick={() => setShopOpen(false)} aria-label="Close">
            ×
          </button>
        </div>
        <div className="depot-balance">
          <b>{balance}</b>
          <span>
            watts · level {level} · skyline {levelCap} floors
          </span>
        </div>
        <div className="depot-orders" aria-label="Tonight's work orders">
          {orders.map((o) => (
            <span key={o.id} className={o.done ? "done" : ""}>
              {o.done ? "■" : "□"} {o.name} <b>+{o.bonus}</b>
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
            return (
              <button
                key={item.id}
                type="button"
                className={"depot-item" + (owned ? " owned" : "") + (active ? " active" : "")}
                disabled={!clickable}
                onClick={() => buy(item.id)}
              >
                <strong>{item.name}</strong>
                <em>{item.line}</em>
                <span>
                  {active
                    ? "tonight"
                    : owned
                      ? "in the city"
                      : locked
                        ? `level ${item.minLevel}`
                        : `${item.cost} W`}
                </span>
              </button>
            );
          })}
        </div>
        <p className="depot-note">Everything here is earned. Amber is not for sale.</p>
      </aside>

      <aside
        className="settings-panel"
        aria-label="Settings"
        aria-hidden={!settingsOpen}
        inert={!settingsOpen}
      >
        <div className="panel-heading">
          <span>Settings</span>
          <button type="button" onClick={() => setSettingsOpen(false)} aria-label="Close">
            ×
          </button>
        </div>
        <div className="panel-toggles">
          <label>
            <span>City hum</span>
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
            <span>Settle chime</span>
            <button
              type="button"
              className={"toggle" + (chimeOn ? " on" : "")}
              onClick={() => setChimeOn(!chimeOn)}
              aria-pressed={chimeOn}
            >
              <i />
            </button>
          </label>
        </div>
        <div className="panel-shortcuts">
          <span><b>← → ↑ ↓</b> pan the city</span>
          <span><b>/</b> search</span>
          <span><b>N</b> write</span>
          <span><b>Esc</b> close</span>
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
