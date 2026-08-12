/**
 * The Mirror's wardrobe — your figure as layered parts. The base is the
 * bare amber walker (9 frames, coat pixels written as 'c'); hats, hair
 * and accessories are small patches over the shoulders-up rows (0..8),
 * which is why one drawing per direction is enough: the walk cycle only
 * ever animates below row 8.
 *
 * Patch character set (never reaches the atlas — compose resolves it):
 *   '.' keep what's underneath   '_' erase to transparent
 *   'c' coat tone                't' coat trim, one step brighter
 *   '0'-'7' literal palette greys ('0' is the outline, as everywhere)
 */

export type Dir = "S" | "E" | "N";
export type PartSlot = "hat" | "hair" | "acc";

export type Patch = { top: number; rows: string[] };

export type Part = {
  id: string;
  slot: PartSlot;
  name: string;
  line: string;
  /** Watts to unlock; 0 = yours from the start */
  cost: number;
  art: Partial<Record<Dir, Patch>>;
};

/** bare figure — no hat rows; the top of the head closes at row 3 */
export const YOU_BASE: Record<string, string[]> = {
  you_S_i: [
    "........",
    "........",
    "........",
    "..0000..",
    ".066660.",
    "06166160",
    "06666660",
    ".066660.",
    ".00cc00.",
    "05ccct50",
    "05ccct50",
    ".0ccct0.",
    ".00.00..",
  ],
  you_S_a: [
    "........",
    "........",
    "........",
    "..0000..",
    ".066660.",
    "06166160",
    "06666660",
    ".066660.",
    ".00cc00.",
    "05ccct00",
    "00ccct50",
    ".0ccct0.",
    ".00.10..",
  ],
  you_S_b: [
    "........",
    "........",
    "........",
    "..0000..",
    ".066660.",
    "06166160",
    "06666660",
    ".066660.",
    ".00cc00.",
    "00ccct50",
    "05ccct00",
    ".0ccct0.",
    "..01.00.",
  ],
  you_E_i: [
    "........",
    "........",
    "........",
    "..0000..",
    ".066660.",
    ".066160.",
    ".066660.",
    "..06600.",
    "..0cc0..",
    ".0ccct0.",
    ".05ccc0.",
    "..0cc0..",
    "..0000..",
  ],
  you_E_a: [
    "........",
    "........",
    "........",
    "..0000..",
    ".066660.",
    ".066160.",
    ".066660.",
    "..06600.",
    "..0cc0..",
    ".0ccct0.",
    ".5ccc05.",
    "..0cc0..",
    ".00..00.",
  ],
  you_E_b: [
    "........",
    "........",
    "........",
    "..0000..",
    ".066660.",
    ".066160.",
    ".066660.",
    "..06600.",
    "..0cc0..",
    ".0ccct0.",
    ".50ccc5.",
    "..0cc0..",
    ".00..00.",
  ],
  you_N_i: [
    "........",
    "........",
    "........",
    "..0000..",
    ".011110.",
    "01111110",
    "01111110",
    ".011110.",
    ".00cc00.",
    "05ccct50",
    "05ccct50",
    ".0ccct0.",
    ".00.00..",
  ],
  you_N_a: [
    "........",
    "........",
    "........",
    "..0000..",
    ".011110.",
    "01111110",
    "01111110",
    ".011110.",
    ".00cc00.",
    "05ccct00",
    "00ccct50",
    ".0ccct0.",
    ".00.10..",
  ],
  you_N_b: [
    "........",
    "........",
    "........",
    "..0000..",
    ".011110.",
    "01111110",
    "01111110",
    ".011110.",
    ".00cc00.",
    "00ccct50",
    "05ccct00",
    ".0ccct0.",
    "..01.00.",
  ],
};

export const PARTS: Part[] = [
  {
    id: "hat.none",
    slot: "hat",
    name: "Bare head",
    line: "The stars can see you thinking.",
    cost: 0,
    art: {},
  },
  {
    id: "hat.tophat",
    slot: "hat",
    name: "Top hat",
    line: "The classic. The city knew you by it.",
    cost: 0,
    art: {
      S: { top: 0, rows: [".00000..", ".0ccc0..", "0ccccc0."] },
      E: { top: 0, rows: [".00000..", ".0ccc0..", ".0cccc00"] },
      N: { top: 0, rows: [".00000..", ".0ccc0..", "0ccccc0."] },
    },
  },
  {
    id: "hat.beanie",
    slot: "hat",
    name: "Beanie",
    line: "Space is cold. Ears first.",
    cost: 0,
    art: {
      S: { top: 2, rows: ["..0000..", ".0ccct0."] },
      E: { top: 2, rows: ["..0000..", ".0ccct0."] },
      N: { top: 2, rows: ["..0000..", ".0ccct0."] },
    },
  },
  {
    id: "hat.cap",
    slot: "hat",
    name: "Field cap",
    line: "Brim forward. Deadlines behind.",
    cost: 45,
    art: {
      S: { top: 2, rows: ["..0000..", ".0cccct0"] },
      E: { top: 2, rows: ["..0000..", ".0ccctt0"] },
      N: { top: 2, rows: ["..0000..", ".0ccct0."] },
    },
  },
  {
    id: "hat.hood",
    slot: "hat",
    name: "Hood",
    line: "For nights that ask for fewer edges.",
    cost: 70,
    art: {
      S: { top: 1, rows: ["..0000..", ".0ccct0.", "0cc00cc0", "0c0..0c0"] },
      E: { top: 1, rows: ["..0000..", ".0ccct0.", "0cc000c0", "0c0..0c0"] },
      N: { top: 1, rows: ["..0000..", ".0ccct0.", "0cccccc0", "0c0..0c0"] },
    },
  },
  {
    id: "hair.short",
    slot: "hair",
    name: "Short crop",
    line: "Low maintenance. High output.",
    cost: 0,
    art: {},
  },
  {
    id: "hair.fringe",
    slot: "hair",
    name: "Fringe",
    line: "A line of night over the eyes.",
    cost: 0,
    art: {
      S: { top: 4, rows: [".011110."] },
      E: { top: 4, rows: [".011110."] },
    },
  },
  {
    id: "hair.bob",
    slot: "hair",
    name: "Bob",
    line: "Frames the face; the face frames the city.",
    cost: 40,
    art: {
      S: { top: 4, rows: [".011110.", "01166110"] },
      E: { top: 4, rows: [".011110.", ".011160."] },
    },
  },
  {
    id: "hair.long",
    slot: "hair",
    name: "Long",
    line: "It remembers every gust you walked through.",
    cost: 60,
    art: {
      S: { top: 4, rows: [".011110.", "01166110", "01666610", "01666610"] },
      E: { top: 4, rows: [".011110.", ".011160.", ".011660.", ".011600."] },
      N: { top: 4, rows: [".011110.", "01111110", "01111110", "01111110"] },
    },
  },
  {
    id: "hair.ponytail",
    slot: "hair",
    name: "Ponytail",
    line: "Practical in zero wind. Still swings.",
    cost: 30,
    art: {
      S: { top: 2, rows: ["..0000..", ".011110."] },
      E: { top: 2, rows: ["..0000..", ".011110.", "......1.", "......1.", ".....1.."] },
      N: { top: 2, rows: ["..0000..", ".011110.", "...11...", "...11...", "...1...."] },
    },
  },
  {
    id: "hair.twintails",
    slot: "hair",
    name: "Twin tails",
    line: "Twice the silhouette.",
    cost: 30,
    art: {
      S: { top: 2, rows: ["..0000..", "01111110", "1......1", "1......1"] },
      E: { top: 2, rows: ["..0000..", ".011110.", ".1......", ".1......"] },
      N: { top: 2, rows: ["..0000..", "01111110", "1......1", "1......1"] },
    },
  },
  {
    id: "hair.bun",
    slot: "hair",
    name: "Bun",
    line: "All the thinking, tied up neatly.",
    cost: 30,
    art: {
      S: { top: 2, rows: ["..0000..", ".011110."] },
      E: { top: 1, rows: ["...011..", "..0000..", ".011110."] },
      N: { top: 1, rows: ["..0110..", "..0000..", ".011110."] },
    },
  },
  {
    id: "hat.strawhat",
    slot: "hat",
    name: "Straw hat",
    line: "Grown for sun this island doesn't have.",
    cost: 45,
    art: {
      S: { top: 2, rows: ["..0000..", "05555550"] },
      E: { top: 2, rows: ["..0000..", "05555550"] },
      N: { top: 2, rows: ["..0000..", "05555550"] },
    },
  },
  {
    id: "hat.toque",
    slot: "hat",
    name: "Baker's toque",
    line: "Rises like good dough.",
    cost: 45,
    art: {
      S: { top: 1, rows: [".07770..", ".077700.", "..0000.."] },
      E: { top: 1, rows: ["..0770..", ".077700.", "..0000.."] },
      N: { top: 1, rows: [".07770..", ".077700.", "..0000.."] },
    },
  },
  {
    id: "hat.goggles",
    slot: "hat",
    name: "Goggles",
    line: "For welding. For style. Mostly style.",
    cost: 45,
    art: {
      S: { top: 2, rows: ["..0000..", ".011110.", "01771770"] },
      E: { top: 2, rows: ["..0000..", ".011110.", ".017710."] },
      N: { top: 2, rows: ["..0000..", ".011110.", "01111110"] },
    },
  },
  {
    id: "acc.satchel",
    slot: "acc",
    name: "Satchel",
    line: "Letters in, letters out.",
    cost: 40,
    art: {
      S: { top: 8, rows: ["..1..11."] },
      E: { top: 8, rows: ["..1.11.."] },
      N: { top: 8, rows: [".11..1.."] },
    },
  },
  {
    id: "acc.apron",
    slot: "acc",
    name: "Apron",
    line: "Soil is proof of work.",
    cost: 40,
    art: {
      S: { top: 8, rows: [".05555.0".replace(".0", "0.")] },
      E: { top: 8, rows: ["..0550.."] },
    },
  },
  {
    id: "acc.none",
    slot: "acc",
    name: "Nothing extra",
    line: "You, undecorated.",
    cost: 0,
    art: {},
  },
  {
    id: "acc.scarf",
    slot: "acc",
    name: "Scarf",
    line: "One loop for warmth, one for style.",
    cost: 40,
    art: {
      S: { top: 7, rows: [".0tttt0.", ".00tt00."] },
      E: { top: 7, rows: ["..0tt00.", "..0tt0.."] },
      N: { top: 7, rows: [".0tttt0.", ".00tt00."] },
    },
  },
];
