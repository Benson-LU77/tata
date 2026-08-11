/**
 * The neighbours' script — every line they can say, with the situations
 * that make them say it. Guarded lines outweigh plain ones, so residents
 * notice your night before they make small talk. Both languages live on
 * the same row: translation is rewriting, and it happens here, once.
 */

import type { LineDef } from "./bonds";

export const FIRST_MEET_LINES: LineDef[] = [
  { en: "Oh — hello. I don't think we've met.", zh: "喔——你好。我們好像沒見過。" },
  { en: "New face. Well, newer than mine.", zh: "新面孔。呃,比我新一點。" },
  { en: "Hm? Oh. Hello there.", zh: "嗯?喔,你好。" },
];

export const LINES: LineDef[] = [
  /* ---- tier 1 · familiar ---- */
  { tier: 1, en: "Evening.", zh: "晚安。" },
  { tier: 1, en: "Nice night for it.", zh: "今晚很適合走走。" },
  { tier: 1, en: "The towers grew again, did you see?", zh: "高樓又長高了,你看見了嗎。" },
  { tier: 1, en: "Mind the kerb.", zh: "小心路緣。" },
  { tier: 1, en: "You're the amber one, aren't you.", zh: "你就是那個琥珀色的吧。" },
  { tier: 1, en: "Quiet tonight.", zh: "今晚很安靜。" },

  /* ---- tier 2 · acquainted ---- */
  { tier: 2, en: "You again! Good.", zh: "又是你!真好。" },
  { tier: 2, en: "I saved you a spot on the bench. There is no bench. Still.", zh: "我幫你留了位子。其實沒有長椅。沒關係。" },
  { tier: 2, en: "The lights were pretty last night.", zh: "昨晚的燈光很美。" },
  { tier: 2, en: "I counted the streetlamps today. Lost count.", zh: "我數過路燈,數到一半就忘了。" },
  { tier: 2, en: "Heard a new building settle. Sounded like yours.", zh: "聽見一棟新建築落成的聲音,聽起來像是你的。" },
  { tier: 2, en: "The dog chased Mochi again. Nobody won.", zh: "那隻狗又追著 Mochi 跑了,誰也沒贏。" },

  /* ---- tier 3 · friend ---- */
  { tier: 3, en: "There you are. I was starting to wonder.", zh: "你來了。我開始擔心了。" },
  { tier: 3, en: "I told the neighbours about you. Only good things.", zh: "我跟鄰居提過你,都是好話。" },
  { tier: 3, en: "Some nights I just watch the galaxy band turn.", zh: "有些夜晚,我只是看著銀河緩緩轉動。" },
  { tier: 3, en: "If you ever stop walking this street, it'll feel wrong.", zh: "要是哪天你不再走這條街,會覺得不對勁。" },
  { tier: 3, en: "I like the city best right before you arrive.", zh: "我最喜歡你到來前一刻的這座城市。" },

  /* ---- tier 4 · family ---- */
  { tier: 4, en: "Welcome home.", zh: "歡迎回家。" },
  { tier: 4, en: "You don't have to say anything. It's fine.", zh: "什麼都不用說,沒關係的。" },
  { tier: 4, en: "I remember when this block was two buildings tall.", zh: "我還記得這個街區只有兩棟樓的時候。" },
  { tier: 4, en: "The city keeps your light on. So do I.", zh: "這座城市為你留著燈,我也是。" },

  /* ---- situational · the city notices your night ---- */
  {
    tier: 1,
    when: (c) => c.wroteTonight,
    en: "Your window was lit tonight. Good.",
    zh: "你的窗今晚亮著。很好。",
  },
  {
    tier: 2,
    when: (c) => c.wroteTonight,
    en: "Write something good tonight? Don't tell me. Keep it.",
    zh: "今晚寫了什麼好東西嗎?別告訴我,留著。",
  },
  {
    tier: 1,
    when: (c) => !c.wroteTonight && c.hour >= 21,
    en: "The night's still young. Your tower's waiting.",
    zh: "夜還早,你那棟樓還等著。",
  },
  {
    tier: 2,
    when: (c) => c.streak >= 7,
    en: "A whole week of lit windows. The street talks about it.",
    zh: "整整一週的燈火,這條街都在談論。",
  },
  {
    tier: 1,
    when: (c) => c.streak >= 3,
    en: "Third night running, isn't it. I keep track.",
    zh: "連續第三晚了吧,我有在數。",
  },
  {
    tier: 2,
    when: (c) => c.daysSinceGreet >= 7,
    en: "It's been a while. The corner didn't move.",
    zh: "好一陣子了,街角還在原來的地方。",
  },
  {
    tier: 3,
    when: (c) => c.daysSinceGreet >= 14,
    en: "Two weeks. I didn't count. Fine, I counted.",
    zh: "兩個星期。我沒在數。好吧,我有。",
  },
  {
    tier: 1,
    when: (c) => c.totalNotes >= 100,
    en: "A hundred pages somewhere in these towers. Imagine.",
    zh: "這些高樓裡藏著上百頁,想想看。",
  },
  {
    tier: 1,
    when: (c) => c.hour >= 1 && c.hour < 5,
    en: "Still up? Me too. Obviously.",
    zh: "還沒睡?我也是,廢話。",
  },
  {
    tier: 1,
    when: (c) => c.hour >= 1 && c.hour < 5,
    en: "The small hours are the honest ones.",
    zh: "凌晨的時刻,總是最誠實的。",
  },
  {
    tier: 1,
    when: (c) => c.weather === "rain",
    en: "The rain sounds different up here. Thinner.",
    zh: "雨聲在這麼高的地方,聽起來比較薄。",
  },
  {
    tier: 1,
    when: (c) => c.weather === "rain",
    en: "Don't rust.",
    zh: "別生鏽。",
  },
  {
    tier: 1,
    when: (c) => c.weather === "snow",
    en: "Snow in space. Don't ask me how. Enjoy it.",
    zh: "太空竟然下雪,別問我怎麼回事,好好享受吧。",
  },
  {
    tier: 1,
    when: (c) => c.weather === "snow",
    en: "Every footprint tonight is yours.",
    zh: "今晚每個腳印,都是你的。",
  },
  {
    tier: 1,
    when: (c) => c.weather === "fog",
    en: "The far blocks are gone again. They'll come back.",
    zh: "遠處的街區又不見了,它們會回來的。",
  },
];

export const CAT_LINE_DEFS: LineDef[] = [
  { en: "...", zh: "……" },
  { en: "mrr.", zh: "喵。" },
  { en: "(slow blink)", zh: "(緩緩眨眼)" },
  { en: "(watches you, approves)", zh: "(盯著你,一副認可的樣子)" },
  { tier: 3, en: "(leans, very slightly, against your leg)", zh: "(非常輕地,靠了一下你的腳)" },
  {
    when: (c) => c.weather === "rain",
    en: "(judges the rain)",
    zh: "(對雨表示不滿)",
  },
];

export const DOG_LINE_DEFS: LineDef[] = [
  { en: "(tail thumps)", zh: "(尾巴用力搖)" },
  { en: "woof.", zh: "汪。" },
  { en: "(spins once)", zh: "(原地轉一圈)" },
  { en: "(presents nothing, proudly)", zh: "(驕傲地叼來什麼都沒有的東西)" },
  { tier: 2, en: "(remembers you. definitely remembers you)", zh: "(記得你。絕對記得你)" },
  {
    when: (c) => c.weather === "snow",
    en: "(bites the snow. loses.)",
    zh: "(咬了一口雪,輸了。)" ,
  },
];
