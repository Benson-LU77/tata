/**
 * What you can say back.
 *
 * A conversation is two people on the same subject. Every neighbour's
 * line carries a topic; the replies you are offered answer THAT topic,
 * and their closer answers your reply. Warmth unlocks with the bond:
 * things you would only say to a friend wait until you have one.
 *
 * Leaving needs no button: tapping away has always ended the meeting,
 * and the resident never minds.
 */

import type { Tier, Topic } from "./bonds";

export type ReplyDef = {
  /** topics this answers; omitted = answers anything */
  topics?: Topic[];
  /** minimum bond tier — the warmth you have earned */
  tier?: Tier;
  reply: { en: string; zh: string };
  /** how they answer YOUR words, not the void */
  closers: { en: string; zh: string }[];
};

export const REPLIES: ReplyDef[] = [
  /* ---------------- night — the hour, the quiet ---------------- */
  {
    topics: ["night"],
    reply: { en: "Quiet suits it.", zh: "安靜挺好的。" },
    closers: [
      { en: "Doesn't it. Loud cities forget things faster.", zh: "對吧。吵的城市忘性大。" },
      { en: "It's the only hour that tells the truth.", zh: "只有這個時辰不說謊。" },
    ],
  },
  {
    topics: ["night"],
    reply: { en: "Couldn't sleep either.", zh: "我也睡不著。" },
    closers: [
      { en: "Then we're both doing this on purpose.", zh: "那我們都是故意的。" },
      { en: "Nobody out here is out here by accident.", zh: "會在這個時間出現的人,沒有一個是意外。" },
    ],
  },
  {
    topics: ["night"],
    tier: 3,
    reply: { en: "I come out at this hour on purpose.", zh: "我是特地挑這個時間出來的。" },
    closers: [
      { en: "I know. I started doing the same.", zh: "我知道。我後來也開始這樣了。" },
      { en: "So the street has two regulars now.", zh: "那這條街現在有兩個常客了。" },
    ],
  },

  /* ---------------- city — streets, towers, growing ------------- */
  {
    topics: ["city"],
    reply: { en: "It keeps growing.", zh: "它一直在長。" },
    closers: [
      { en: "Bit by bit. Nobody notices the day it happened.", zh: "一點一點的。沒人記得是哪一天長的。" },
      { en: "And in the right direction, for once.", zh: "而且難得是往好的方向長。" },
    ],
  },
  {
    topics: ["city"],
    reply: { en: "I hadn't noticed.", zh: "我沒注意到。" },
    closers: [
      { en: "You will, next time you come round this corner.", zh: "下次繞過這個轉角你就會了。" },
      { en: "That's fine. It grows whether or not anyone's watching.", zh: "沒關係。有沒有人看,它都在長。" },
    ],
  },
  {
    topics: ["city"],
    tier: 2,
    reply: { en: "You know every street here, don't you.", zh: "這裡每條街你都認得吧。" },
    closers: [
      { en: "Every kerb. It's not a large talent.", zh: "每一塊路緣。這不是什麼大本事。" },
      { en: "I knew them before they were streets.", zh: "它們還不是街的時候我就認得了。" },
    ],
  },

  /* ---------------- writing — pages, streaks, windows ----------- */
  {
    topics: ["writing"],
    reply: { en: "I wrote a little.", zh: "我寫了一點。" },
    closers: [
      { en: "I knew it. A lit window looks different when someone's writing behind it.", zh: "我就知道。有人在後面寫字的窗,亮起來的樣子不一樣。" },
      { en: "'A little' builds this whole town, you know.", zh: "「一點」就夠了——這整座城都是「一點」蓋起來的。" },
    ],
  },
  {
    topics: ["writing"],
    reply: { en: "Not tonight.", zh: "今晚沒有。" },
    closers: [
      { en: "Then tonight is for walking. The page will keep.", zh: "那今晚就用來走路。紙不會跑掉。" },
      { en: "Fine by me. The street's better company than a blank page.", zh: "我覺得沒差。空白的紙沒有這條街好聊。" },
    ],
  },
  {
    topics: ["writing"],
    reply: { en: "Harder than it looks.", zh: "比看起來難。" },
    closers: [
      { en: "Everything worth a building is.", zh: "值得蓋成樓的事都這樣。" },
      { en: "And yet there's a skyline out there. Explain that.", zh: "可是外面有一整條天際線。你怎麼解釋。" },
    ],
  },
  {
    topics: ["writing"],
    tier: 3,
    reply: { en: "Some nights the page wins.", zh: "有些晚上是紙贏了。" },
    closers: [
      { en: "It's allowed to. It plays a long game.", zh: "它可以贏。它玩的是長局。" },
      { en: "Then you come back tomorrow and it forgets it ever won.", zh: "然後你明天再來,它就忘記自己贏過了。" },
    ],
  },

  /* ---------------- weather ------------------------------------ */
  {
    topics: ["weather"],
    reply: { en: "I like it like this.", zh: "我喜歡這樣的天氣。" },
    closers: [
      { en: "Then you're in the right city.", zh: "那你來對城市了。" },
      { en: "Good. It wasn't going to stop for either of us.", zh: "很好。反正它也不會為我們誰停下來。" },
    ],
  },
  {
    topics: ["weather"],
    reply: { en: "You'll catch cold out here.", zh: "你在外面會著涼。" },
    closers: [
      { en: "I've been out in worse. Much worse. Ask me sometime.", zh: "我淋過更糟的。糟很多。改天問我。" },
      { en: "Kind of you. I'm mostly weatherproof by now.", zh: "你人真好。我現在差不多防水了。" },
    ],
  },
  {
    topics: ["weather"],
    reply: { en: "It'll pass.", zh: "會過去的。" },
    closers: [
      { en: "Everything here does. That's the arrangement.", zh: "這裡的一切都會。這是約定好的。" },
      { en: "Eventually. The streets don't seem to mind waiting.", zh: "遲早。街道好像不介意等。" },
    ],
  },

  /* ---------------- you — being noticed ------------------------ */
  {
    topics: ["you"],
    reply: { en: "You've been watching.", zh: "你一直在看啊。" },
    closers: [
      { en: "It's a small street. Watching is the local sport.", zh: "街很小。看人是這裡的全民運動。" },
      { en: "Only the interesting parts. There have been a few.", zh: "只看有趣的部分。而且真的有幾段。" },
    ],
  },
  {
    topics: ["you"],
    reply: { en: "Guilty.", zh: "被你說中了。" },
    closers: [
      { en: "No charge. It's a good habit.", zh: "不罰。這是個好習慣。" },
      { en: "Everyone here is guilty of something. Yours is mild.", zh: "這裡每個人都有罪。你的算輕的。" },
    ],
  },
  {
    topics: ["you"],
    reply: { en: "Is that a good thing?", zh: "這算好事嗎?" },
    closers: [
      { en: "Around here it is. Being noticed means you stayed.", zh: "在這裡算。被記住表示你留下來了。" },
      { en: "It's a thing. Good comes later, usually.", zh: "算是件事。好通常晚一點才來。" },
    ],
  },
  {
    topics: ["you"],
    tier: 3,
    reply: { en: "I'd hoped somebody had.", zh: "我本來就希望有人注意到。" },
    closers: [
      { en: "Somebody did. Somebody's been keeping count.", zh: "有人注意到了。而且一直在數。" },
      { en: "That's what a city is for, in the end.", zh: "說到底,城市就是幹這個用的。" },
    ],
  },

  {
    topics: ["you"],
    reply: { en: "Somebody's paying attention.", zh: "有人很用心在看。" },
    closers: [
      { en: "Somebody has to. The lamps only do light.", zh: "總得有人做。路燈只負責亮。" },
      { en: "It passes the century.", zh: "這樣一個世紀比較好過。" },
    ],
  },
  {
    topics: ["you"],
    reply: { en: "I'm still working out how to answer that.", zh: "我還在想怎麼回你。" },
    closers: [
      { en: "Take your time. I'm not going anywhere.", zh: "慢慢想。我又不會走。" },
      { en: "Then don't. Some things sit better unanswered.", zh: "那就別回。有些話放著比較好。" },
    ],
  },

  /* ---------------- them — their life, trade, memory ----------- */
  {
    topics: ["them"],
    reply: { en: "Tell me more.", zh: "多說一點。" },
    closers: [
      { en: "Another night. It's a long story and the lamps are tired.", zh: "改天吧。故事很長,路燈也累了。" },
      { en: "You asked. Nobody asks. I'll remember that.", zh: "你問了。沒有人問的。我會記得。" },
    ],
  },
  {
    topics: ["them"],
    reply: { en: "You've been here a long time.", zh: "你在這裡很久了。" },
    closers: [
      { en: "Longer than the buildings, some of them.", zh: "有些樓還沒我久。" },
      { en: "Long enough to stop counting. That's the good part.", zh: "久到不數了。這是好的部分。" },
    ],
  },
  {
    topics: ["them"],
    reply: { en: "I didn't know that.", zh: "我不知道這件事。" },
    closers: [
      { en: "Now you do. Carry it around, it's light.", zh: "現在你知道了。帶著吧,不重。" },
      { en: "Most people don't. Most people don't stop.", zh: "多數人不知道。多數人不會停下來。" },
    ],
  },
  {
    topics: ["them"],
    tier: 2,
    reply: { en: "You never told me that before.", zh: "你以前沒說過這個。" },
    closers: [
      { en: "You hadn't been around long enough before.", zh: "以前你來得還不夠久。" },
      { en: "I tell it once every few hundred nights. You caught it.", zh: "我每幾百個晚上才講一次。被你碰上了。" },
    ],
  },

  /* ---------------- universal — answer anything ---------------- */
  {
    reply: { en: "Good night for it.", zh: "今晚不錯。" },
    closers: [
      { en: "It is. Nights like this deserve a slower walk.", zh: "是啊。這種晚上,值得走慢一點。" },
      { en: "Tomorrow might top it. Doubt it, though.", zh: "明晚說不定更好——不過我懷疑。" },
    ],
  },
  {
    reply: { en: "Just walking.", zh: "隨便走走。" },
    closers: [
      { en: "Best kind of walking. Destinations are overrated.", zh: "隨便走走最好。目的地都被高估了。" },
      { en: "Then take the long way. It earned it.", zh: "那就繞遠路吧,這條街值得。" },
    ],
  },
  {
    reply: { en: "See you around.", zh: "回頭見。" },
    closers: [
      { en: "You will. I'm reliably here.", zh: "會的。我很可靠地一直在這。" },
      { en: "Count on it. Same street, same me.", zh: "一定。同一條街,同一個我。" },
    ],
  },
  {
    tier: 4,
    reply: { en: "Glad you're still here.", zh: "還好你還在。" },
    closers: [
      { en: "Where would I go. This is the whole map.", zh: "我能去哪。這裡就是整張地圖了。" },
      { en: "Likewise. You've become part of the route.", zh: "我也是。你已經是路線的一部分了。" },
    ],
  },
];

/**
 * Two replies that answer what was just said, warmth-gated by the bond.
 * Topic-matched first; universal lines fill any gap so there is never a
 * meeting without an answer. Deterministic given `roll`. `exclude` keeps
 * a second round from repeating what round one already said.
 */
/**
 * fmix32 — a real avalanche hash. A plain multiply-and-take-the-fraction
 * resonates with evenly spaced rolls and can hand back the same answer
 * every single time; this does not.
 */
function scramble(x: number, salt: number): number {
  let h = (Math.floor(Math.abs(x) * 4294967296) ^ Math.imul(salt, 2654435761)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function repliesFor(
  topic: Topic | undefined,
  tier: Tier,
  roll: number,
  exclude: ReplyDef[] = [],
): ReplyDef[] {
  const earned = (r: ReplyDef) => (r.tier ?? 0) <= tier && !exclude.includes(r);
  const onTopic = REPLIES.filter(
    (r) => earned(r) && topic !== undefined && r.topics?.includes(topic),
  );
  const universal = REPLIES.filter((r) => earned(r) && !r.topics);

  const pick = (pool: ReplyDef[], n: number, salt: number): ReplyDef[] => {
    const out: ReplyDef[] = [];
    const rest = [...pool];
    for (let i = 0; i < n && rest.length > 0; i += 1) {
      const at = Math.floor(scramble(roll, salt * 31 + i) * rest.length);
      out.push(rest.splice(Math.min(at, rest.length - 1), 1)[0]);
    }
    return out;
  };

  /* one on-topic, one wildcard: the answer lands, the mood stays loose */
  const chosen = [...pick(onTopic, 1, 1), ...pick(universal, 1, 2)];
  if (chosen.length < 2) {
    const spare = [...onTopic, ...universal].filter((r) => !chosen.includes(r));
    chosen.push(...pick(spare, 2 - chosen.length, 3));
  }
  return chosen;
}

/** their closer for a reply you actually chose */
export function closerFor(reply: ReplyDef, roll: number, lang: "en" | "zh"): string {
  const at = Math.floor(scramble(roll, 977) * reply.closers.length);
  const c = reply.closers[Math.min(at, reply.closers.length - 1)];
  return lang === "zh" ? c.zh : c.en;
}
