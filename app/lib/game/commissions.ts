/**
 * Commissions — public works the city builds for Watts, on real time.
 * You place an order; scaffolding rises over real days; when it opens, a
 * named caretaker moves in and writes you a letter (stored in tata.json,
 * never written into the vault — export is always your own hand).
 *
 * Pure module. Time comes in as UTC milliseconds from the caller; merge
 * is commutative and idempotent: earliest placement wins, completion is
 * the earliest observed, a claimed reward stays claimed.
 */

export type CommissionDef = {
  id: string;
  cost: number;
  /** real days of construction */
  days: number;
  minLevel: number;
  /** the caretaker who moves in when it opens */
  caretaker: string;
};

export const COMMISSION_CATALOG: CommissionDef[] = [
  { id: "library", cost: 800, days: 3, minLevel: 2, caretaker: "Vesper" },
  { id: "greenhouse", cost: 1200, days: 4, minLevel: 3, caretaker: "Fern" },
  { id: "teahouse", cost: 1600, days: 5, minLevel: 4, caretaker: "Oolong" },
  { id: "belltower", cost: 2200, days: 7, minLevel: 5, caretaker: "Toll" },
  { id: "skybridge", cost: 3000, days: 10, minLevel: 7, caretaker: "Span" },
  { id: "planetarium", cost: 5200, days: 14, minLevel: 9, caretaker: "Orrery" },
];

export type Commission = {
  id: string;
  /** month-block index the works stand beside */
  block: number;
  /** UTC ms when the order was placed */
  placedAt: number;
  /** UTC ms when completion was first observed (stamped once) */
  completedAt: number | null;
  /** the letter has been issued */
  rewardClaimed: boolean;
};

const DAY_MS = 86400000;

export function commissionDef(id: string): CommissionDef | undefined {
  return COMMISSION_CATALOG.find((c) => c.id === id);
}

/** 0..1 — how far the scaffolding has climbed */
export function progressOf(c: Commission, nowMs: number): number {
  const def = commissionDef(c.id);
  if (!def) return 1;
  return Math.max(0, Math.min(1, (nowMs - c.placedAt) / (def.days * DAY_MS)));
}

export type ResolvedCommissions = {
  built: { id: string; block: number }[];
  scaffolds: { id: string; block: number; progress: number }[];
};

/** pure: what stands where, given a moment in time */
export function resolveCommissions(list: Commission[], nowMs: number): ResolvedCommissions {
  const built: ResolvedCommissions["built"] = [];
  const scaffolds: ResolvedCommissions["scaffolds"] = [];
  for (const c of list) {
    const p = progressOf(c, nowMs);
    if (p >= 1) built.push({ id: c.id, block: c.block });
    else scaffolds.push({ id: c.id, block: c.block, progress: p });
  }
  return { built, scaffolds };
}

/** union by id — earliest placement wins, completion never un-happens */
export function mergeCommissions(
  a: Commission[] | undefined,
  b: Commission[] | undefined,
): Commission[] {
  const out = new Map<string, Commission>();
  for (const c of [...(a ?? []), ...(b ?? [])]) {
    const prev = out.get(c.id);
    if (!prev) {
      out.set(c.id, { ...c });
      continue;
    }
    out.set(c.id, {
      id: c.id,
      block: prev.placedAt <= c.placedAt ? prev.block : c.block,
      placedAt: Math.min(prev.placedAt, c.placedAt),
      completedAt:
        prev.completedAt !== null && c.completedAt !== null
          ? Math.min(prev.completedAt, c.completedAt)
          : (prev.completedAt ?? c.completedAt),
      rewardClaimed: prev.rewardClaimed || c.rewardClaimed,
    });
  }
  return [...out.values()];
}

/* ---------------- letters — issued on opening day ------------------- */

export type Letter = {
  /** commission id doubles as the letter id */
  id: string;
  /** YYYY-MM-DD the doors opened */
  date: string;
  read: boolean;
};

export function mergeLetters(a: Letter[] | undefined, b: Letter[] | undefined): Letter[] {
  const out = new Map<string, Letter>();
  for (const l of [...(a ?? []), ...(b ?? [])]) {
    const prev = out.get(l.id);
    out.set(
      l.id,
      prev
        ? { id: l.id, date: prev.date < l.date ? prev.date : l.date, read: prev.read || l.read }
        : { ...l },
    );
  }
  return [...out.values()];
}

/** the letter itself — rendered fresh from your city, never stored */
export function letterBody(
  id: string,
  ctx: { months: number; pages: number; date: string },
  lang: "en" | "zh",
): string {
  const def = commissionDef(id);
  const name = def?.caretaker ?? "A neighbour";
  const zh: Record<string, string> = {
    library: `寫字的人。\n\n圖書館今天開門了。我把你的 ${ctx.pages} 頁都登記進了目錄——不是抄本,只是記得它們在哪裡。\n這座城市寫了 ${ctx.months} 個月,現在終於有一個地方,讓字可以安靜地站在架上。\n\n門不鎖。夜裡也不鎖。\n\n—— ${name},圖書館`,
    greenhouse: `寫字的人。\n\n溫室的玻璃今天裝上了最後一塊。外面是太空,裡面是潮濕的土。\n我數過了,這座城市有 ${ctx.pages} 頁的字,夠養活很多株安靜的植物。\n\n有空來看看。植物不說話,跟你的筆記處得很好。\n\n—— ${name},溫室`,
    teahouse: `寫字的人。\n\n茶館開張了。第一壺茶給了路過的貓,第二壺留給你。\n${ctx.months} 個月的字,值得有個地方坐下來,不寫。\n\n慢慢來。\n\n—— ${name},茶館`,
    belltower: `寫字的人。\n\n鐘塔今天敲了第一聲。聲音走過 ${ctx.months} 個月的街區,沒有一棟樓漏掉。\n以後每個整點都會敲——不是提醒你寫,是提醒這座城市:有人在這裡寫過。\n\n—— ${name},鐘塔`,
    skybridge: `寫字的人。\n\n天橋合攏了。兩個月份之間,現在可以不落地地走過去。\n工程隊說跨距是 ${ctx.pages} 頁——他們用你的字數算工程,我沒攔。\n\n風大的時候記得扶著。\n\n—— ${name},天橋`,
    planetarium: `寫字的人。\n\n天象館今晚啟用。圓頂裡放的不是別的星空,是這座城市外面那一片——只是慢了一點,好看清楚。\n${ctx.months} 個月,${ctx.pages} 頁。你抬頭的時候,它們都在。\n\n—— ${name},天象館`,
  };
  const en: Record<string, string> = {
    library: `To the one who writes.\n\nThe library opened today. I catalogued all ${ctx.pages} of your pages — not copies, just a memory of where they stand.\nThis city has been writing for ${ctx.months} months. Now the words have somewhere to stand quietly.\n\nThe door doesn't lock. Not at night either.\n\n— ${name}, the library`,
    greenhouse: `To the one who writes.\n\nThe last pane went in today. Space outside, damp soil inside.\nI counted: ${ctx.pages} pages of words in this city. Enough to keep a lot of quiet plants alive.\n\nCome by. Plants don't talk. They get along fine with your notes.\n\n— ${name}, the greenhouse`,
    teahouse: `To the one who writes.\n\nThe teahouse is open. First pot went to a passing cat; the second is yours.\n${ctx.months} months of words deserve a place to sit and not write.\n\nTake your time.\n\n— ${name}, the teahouse`,
    belltower: `To the one who writes.\n\nThe bell rang for the first time today. The sound crossed all ${ctx.months} months of blocks and missed none.\nIt will ring on the hour — not to remind you to write, but to remind the city that someone did.\n\n— ${name}, the belltower`,
    skybridge: `To the one who writes.\n\nThe bridge closed its span today. Two months, walkable without touching ground.\nThe crew measured the span in your pages — ${ctx.pages} of them. I didn't stop them.\n\nHold the rail when the wind is up.\n\n— ${name}, the skybridge`,
    planetarium: `To the one who writes.\n\nThe planetarium opens tonight. The dome shows no foreign sky — just the one outside this city, slowed down enough to read.\n${ctx.months} months. ${ctx.pages} pages. When you look up, they're all there.\n\n— ${name}, the planetarium`,
  };
  return (lang === "zh" ? zh : en)[id] ?? `${name} · ${ctx.date}`;
}
