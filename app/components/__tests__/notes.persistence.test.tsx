/**
 * Characterization tests for the notes persistence layer — written BEFORE
 * the doc-store extraction, so the extraction can prove it changed nothing.
 *
 * Every scenario here is the shape of a real or near-miss data-loss
 * incident. If one goes red, a page of the user's words is at risk.
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotesPanel } from "../notes";
import { vault, resetVault } from "../../test/fake-vault";
import { drafts } from "../../lib/drafts";

vi.mock("../../lib/obsidian", () => ({
  DEFAULT_OBSIDIAN_URL: "http://127.0.0.1:27123",
  ObsidianClient: class {
    constructor() {
      // every panel in the tests talks to the same in-memory vault
      // eslint-disable-next-line no-constructor-return
      return vault;
    }
  },
  loadConfig: () => ({ url: "http://127.0.0.1:27123", key: "test-key", folder: "" }),
  saveConfig: () => {},
}));

vi.mock("../editor", () => ({
  // the persistence layer under test never touches CodeMirror: a plain
  // textarea with the same contract stands in for it
  MarkdownEditor: ({
    value,
    onChange,
    onBlur,
    onReady,
  }: {
    value: string;
    onChange: (next: string) => void;
    onBlur: () => void;
    onReady: (api: unknown) => void;
  }) => {
    onReady({ toggle() {}, getSelection: () => "", focus() {}, cursorToEnd() {} });
    return (
      <textarea
        data-testid="page"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
      />
    );
  },
}));

const pad = (n: number) => String(n).padStart(2, "0");
function todayName() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} Today.md`;
}

const noop = () => {};
function openPanel(extra: Partial<Parameters<typeof NotesPanel>[0]> = {}) {
  const onSaved = vi.fn();
  const utils = render(
    <NotesPanel
      open
      onClose={noop}
      requestOpen={null}
      onWords={noop}
      onSaved={onSaved}
      onActiveFile={noop}
      t={(k: string) => k}
      {...extra}
    />,
  );
  return { ...utils, onSaved };
}

/** advance fake timers AND drain the microtask/IDB queue behind them */
async function settle(ms = 600) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function page(): HTMLTextAreaElement {
  return screen.getByTestId("page") as HTMLTextAreaElement;
}

async function type(text: string) {
  fireEvent.change(page(), { target: { value: text } });
  await settle(500); // past the 400ms draft debounce
}

/** run the 4s autosave and let the write round-trip finish */
async function autosave() {
  await settle(4200);
  await settle(100);
}

async function wipeDrafts() {
  const all = await drafts.all();
  await Promise.all(all.map((d) => drafts.remove(d.file)));
}

beforeEach(async () => {
  resetVault();
  await wipeDrafts(); // real timers: fake-indexeddb needs the event loop
  // fake ONLY the component's timers — the fake IndexedDB keeps the real
  // event loop, so draft reads resolve without timer advancement
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
});

afterEach(async () => {
  cleanup();
  vi.useRealTimers();
  await wipeDrafts();
});

describe("opening today", () => {
  it("continues an existing page instead of replacing it", async () => {
    vault.set(todayName(), "昨晚寫到一半的句子。\n");
    openPanel();
    await settle();
    expect(page().value).toContain("昨晚寫到一半的句子。");
  });

  it("gives a blank page ONLY when the vault says 404", async () => {
    openPanel();
    await settle();
    expect(page().value).toMatch(/^> \d{2}:\d{2}/); // the fresh seed
  });

  it("a dropped wire is an error, never a silent blank save", async () => {
    vault.set(todayName(), "今天已經有字了。\n");
    vault.failReads = true;
    openPanel();
    await settle();
    await autosave();
    // whatever the editor shows, the vault keeps the words and sees no write
    expect(vault.contentOf(todayName())).toContain("今天已經有字了。");
    expect(vault.writes.length).toBe(0);
    expect(screen.getByText("notes.error.open")).toBeTruthy();
  });
});

describe("saving", () => {
  it("an ordinary edit lands in the vault", async () => {
    openPanel();
    await settle();
    await type(page().value + "今晚的第一句。\n");
    await autosave();
    expect(vault.contentOf(todayName())).toContain("今晚的第一句。");
  });

  it("survives a vault that reports no mtime (old plugin)", async () => {
    vault.set(todayName(), "既有內容。\n");
    vault.hideMtime = true;
    openPanel();
    await settle();
    await type(page().value + "補一句。\n");
    await autosave();
    expect(vault.contentOf(todayName())).toContain("補一句。");
  });

  it("offline words wait in the journal, then reach the vault", async () => {
    vault.offline = true;
    openPanel();
    await settle();
    await type("離線寫的字,不能不見。\n");
    const parked = await drafts.all();
    expect(parked.some((d) => d.content.includes("離線寫的字"))).toBe(true);
    vault.offline = false;
    await autosave();
    await autosave(); // offline flush marks status; next tick pushes
    expect(vault.contentOf(todayName())).toContain("離線寫的字,不能不見。");
  });
});

describe("conflict", () => {
  it("both sides extending the same base merges silently — by design", async () => {
    vault.set(todayName(), "共同的開頭。\n");
    openPanel();
    await settle();
    await type("共同的開頭。\n我這邊加的話。\n");
    vault.set(todayName(), "共同的開頭。\nObsidian 那邊改的話。\n");
    await autosave();
    expect(screen.queryByText("notes.conflict.message")).toBeNull();
    const merged = vault.contentOf(todayName())!;
    expect(merged).toContain("Obsidian 那邊改的話。");
    expect(merged).toContain("我這邊加的話。");
  });

  async function makeConflict() {
    // a REAL conflict needs diverged heads — mere extensions auto-merge
    vault.set(todayName(), "共同的開頭。\n");
    const view = openPanel();
    await settle();
    await type("我重寫過的開頭。\n我這邊加的話。\n");
    vault.set(todayName(), "他們重寫過的開頭。\nObsidian 那邊改的話。\n");
    await autosave();
    expect(screen.getByText("notes.conflict.message")).toBeTruthy();
    return view;
  }

  it("taking theirs keeps our words as a tombstone draft", async () => {
    await makeConflict();
    fireEvent.click(screen.getByText("notes.conflict.theirs"));
    await settle();
    expect(page().value).toContain("Obsidian 那邊改的話。");
    const all = await drafts.all();
    const tomb = all.find((d) => / \(tata \d{2}\.\d{2}\)\.md$/.test(d.file));
    expect(tomb, "the set-aside version must survive somewhere").toBeTruthy();
    expect(tomb!.content).toContain("我這邊加的話。");
  });

  it("taking mine overwrites deliberately and only then", async () => {
    await makeConflict();
    fireEvent.click(screen.getByText("notes.conflict.mine"));
    await settle();
    await settle();
    expect(vault.contentOf(todayName())).toContain("我這邊加的話。");
  });

  it("keeping both never replaces an existing copy", async () => {
    await makeConflict();
    fireEvent.click(screen.getByText("notes.conflict.both"));
    await settle();
    await settle();
    const copies = [...vault.files.keys()].filter((n) => n !== todayName());
    expect(copies.length).toBe(1);
    expect(vault.contentOf(copies[0])).toContain("我這邊加的話。");
    expect(vault.contentOf(todayName())).toContain("Obsidian 那邊改的話。");
  });

  it("our own earlier write is recognised, not raised as a conflict", async () => {
    openPanel();
    await settle();
    await type(page().value + "第一段。\n");
    await autosave(); // lands in the vault
    const landed = vault.contentOf(todayName())!;
    // the vault re-stamps our own write (sync tools do this): same words,
    // new mtime — the panel's base is now stale through no fault of ours
    vault.set(todayName(), landed);
    await type(landed + "第二段。\n");
    await autosave();
    expect(screen.queryByText("notes.conflict.message")).toBeNull();
    expect(vault.contentOf(todayName())).toContain("第二段。");
  });
});

describe("opening a specific page", () => {
  it("a panel opened FOR a page shows that page, not today", async () => {
    vault.set(todayName(), "今天的字。\n");
    vault.set("2026-08-16 Today.md", "八月十六的字。\n");
    render(
      <NotesPanel
        open
        onClose={noop}
        requestOpen={{ file: "2026-08-16 Today.md", n: 1 }}
        onWords={noop}
        onSaved={vi.fn()}
        onActiveFile={noop}
        t={(k: string) => k}
      />,
    );
    await settle();
    await settle();
    expect(page().value).toContain("八月十六的字。");
    expect(page().value).not.toContain("今天的字。");
  });

  it("a slow older open never adopts over a newer one", async () => {
    vault.set(todayName(), "今天的字。\n");
    vault.set("2026-08-16 Today.md", "八月十六的字。\n");
    vault.delayReads = 800; // today's opening chain crawls
    const { rerender, onSaved } = openPanel();
    await settle(100); // today's open is now in flight
    rerender(
      <NotesPanel
        open
        onClose={noop}
        requestOpen={{ file: "2026-08-16 Today.md", n: 1 }}
        onWords={noop}
        onSaved={onSaved}
        onActiveFile={noop}
        t={(k: string) => k}
      />,
    );
    await settle(2500); // both chains resolve; the older must be void
    expect(page().value).toContain("八月十六的字。");
    expect(page().value).not.toContain("今天的字。");
  });
});

describe("the 8/21 incident shape", () => {
  it("a save in flight when you switch pages never lands in the new page's file", async () => {
    vault.set("2026-08-18 Today.md", "八月十八的字。\n");
    const { rerender, onSaved } = openPanel();
    await settle();
    await type(page().value + "今天寫的新句子。\n");
    vault.delayWrites = 2000; // the write will hang mid-air
    await settle(4100); // autosave fires, write now in flight
    // mid-flight: open the 8/18 page
    rerender(
      <NotesPanel
        open
        onClose={noop}
        requestOpen={{ file: "2026-08-18 Today.md", n: 1 }}
        onWords={noop}
        onSaved={onSaved}
        onActiveFile={noop}
        t={(k: string) => k}
      />,
    );
    await settle(300); // 8/18 opens while the write is still airborne
    expect(page().value).toContain("八月十八的字。");
    vault.delayWrites = 0;
    await settle(2500); // the in-flight write finally lands
    await settle(4500); // and any follow-up autosave runs
    // the incident: today's words in the 8/18 file. Never again.
    expect(vault.contentOf("2026-08-18 Today.md")).not.toContain("今天寫的新句子。");
    expect(vault.contentOf(todayName())).toContain("今天寫的新句子。");
    // and the open page was not hijacked by the landing write
    expect(page().value).toContain("八月十八的字。");
  });
});
