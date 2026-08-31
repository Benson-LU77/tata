/**
 * The neighbours' script — every line they can say, with the situations
 * that make them say it. Guarded lines outweigh plain ones, so residents
 * notice your night before they make small talk. Both languages live on
 * the same row: translation is rewriting, and it happens here, once.
 */

import type { LineCtx, LineDef } from "./bonds";

export const FIRST_MEET_LINES: LineDef[] = [
  { topic: "night", en: "Oh — hello. I don't think we've met.", zh: "喔——你好。我們好像沒見過。" },
  { topic: "you", en: "New face. Well, newer than mine.", zh: "新面孔。呃,比我新一點。" },
  { topic: "night", en: "Hm? Oh. Hello there.", zh: "嗯?喔,你好。" },
  { topic: "you", en: "You're new. The city doesn't get many of those.", zh: "你是新來的,這座城市很少見到新面孔。" },
  { topic: "you", en: "First time on this street? It'll remember you now.", zh: "第一次走這條街?它現在會記得你了。" },
  { topic: "them", en: "I don't usually introduce myself. Consider this the exception.", zh: "我通常不自我介紹,這次算例外。" },
  { topic: "you", en: "Amber. Huh. Never seen that colour walk before.", zh: "琥珀色,嗯,還沒見過這種顏色會走路的。" },
  { topic: "you", en: "Welcome, I suppose. We'll see if it sticks.", zh: "算是歡迎吧,看看你會不會留下來。" },
  { topic: "you", en: "You looked lost. Everyone does, the first night.", zh: "你看起來有點迷路,第一晚大家都這樣。" },
];

export const LINES: LineDef[] = [
  /* ---- tier 1 · familiar ---- */
  { tier: 1, topic: "night", en: "Evening.", zh: "晚安。" },
  { tier: 1, topic: "night", en: "Nice night for it.", zh: "今晚很適合走走。" },
  { tier: 1, topic: "city", en: "The towers grew again, did you see?", zh: "高樓又長高了,你看見了嗎。" },
  { tier: 1, topic: "city", en: "Mind the kerb.", zh: "小心路緣。" },
  { tier: 1, topic: "you", en: "You're the amber one, aren't you.", zh: "你就是那個琥珀色的吧。" },
  { tier: 1, topic: "night", en: "Quiet tonight.", zh: "今晚很安靜。" },
  { tier: 1, topic: "night", en: "Cold roof tonight.", zh: "屋頂今晚有點涼。" },
  { tier: 1, topic: "city", en: "The stairs still creak. Some things don't change.", zh: "樓梯還是會吱嘎響,有些事沒變。" },
  { tier: 1, topic: "night", en: "Saw a shooting star. Might've been a satellite.", zh: "看到一顆流星,也可能只是衛星。" },
  { tier: 1, topic: "city", en: "The corner shop never opens. Never closes either.", zh: "轉角那間店從不開門,但也沒關過。" },
  { tier: 1, topic: "city", en: "Watch the gap between the blocks.", zh: "小心街區之間的縫。" },
  { tier: 1, topic: "city", en: "Someone's window flickered. Not yours.", zh: "有扇窗閃了一下,不是你的。" },
  { tier: 1, topic: "night", en: "The air tastes like static tonight.", zh: "今晚空氣裡有股靜電味。" },
  { tier: 1, topic: "you", en: "Long way round, but you made it.", zh: "繞了遠路,但你到了。" },
  { tier: 1, topic: "city", en: "The cats have a meeting. You're not invited.", zh: "貓開會,你沒被邀。" },
  { tier: 1, topic: "city", en: "Same street, new dust.", zh: "還是那條街,不同的灰塵。" },
  { tier: 1, topic: "you", en: "I nodded. You nodded back. That's the whole conversation, some nights.", zh: "我點頭,你也點頭。有些夜晚,對話就到這裡。" },
  { tier: 1, topic: "city", en: "Careful, the pavement's still soft where it grew.", zh: "小心,人行道新生的那塊還沒硬。" },
  { tier: 1, topic: "night", en: "Nobody's out. Except you. Except me.", zh: "沒什麼人,除了你,除了我。" },
  { tier: 1, topic: "city", en: "The city hums lower after midnight.", zh: "過了午夜,城市的嗡嗡聲會變低。" },
  { tier: 1, topic: "you", en: "You walk like you've got somewhere to be. You don't, do you.", zh: "你走路像有地方要去,其實沒有,對吧。" },
  { tier: 1, topic: "city", en: "Watch your step. The whole street's new since Tuesday.", zh: "小心腳下,整條街從星期二起就是新的。" },
  { tier: 1, topic: "city", en: "The lamp on the corner blinks in code. Nobody's cracked it.", zh: "轉角那盞燈用密碼閃,沒人破解過。" },
  { tier: 1, topic: "city", en: "Some buildings lean in like they're listening.", zh: "有些樓會微微傾身,像在聽你說話。" },

  /* ---- tier 2 · acquainted ---- */
  { tier: 2, topic: "you", en: "You again! Good.", zh: "又是你!真好。" },
  { tier: 2, topic: "you", en: "I saved you a spot on the bench. There is no bench. Still.", zh: "我幫你留了位子。其實沒有長椅。沒關係。" },
  { tier: 2, topic: "night", en: "The lights were pretty last night.", zh: "昨晚的燈光很美。" },
  { tier: 2, topic: "city", en: "I counted the streetlamps today. Lost count.", zh: "我數過路燈,數到一半就忘了。" },
  { tier: 2, topic: "writing", en: "Heard a new building settle. Sounded like yours.", zh: "聽見一棟新建築落成的聲音,聽起來像是你的。" },
  { tier: 2, topic: "them", en: "The dog chased Mochi again. Nobody won.", zh: "那隻狗又追著 Mochi 跑了,誰也沒贏。" },
  { tier: 2, topic: "you", en: "You smell like rain and ink.", zh: "你身上有雨和墨水的味道。" },
  { tier: 2, topic: "you", en: "I saved the good gossip for you. It's not much.", zh: "好八卦我留給你了,其實也沒多少。" },
  { tier: 2, topic: "city", en: "The bakery that isn't there smelled like something today.", zh: "那間不存在的麵包店,今天飄出了味道。" },
  { tier: 2, topic: "you", en: "You walk past the same bench every time. I've noticed.", zh: "你每次都經過同一張長椅,我注意到了。" },
  { tier: 2, topic: "you", en: "Someone asked about you. I said 'the amber one.' They knew.", zh: "有人問起你,我說「那個琥珀色的」,他們就懂了。" },
  { tier: 2, topic: "you", en: "I saved you the last quiet corner.", zh: "我幫你留了最安靜的那個角落。" },
  { tier: 2, topic: "city", en: "The city rearranged the alleys again. Yours stayed put.", zh: "城市又重排了巷弄,你的那條沒動。" },
  { tier: 2, topic: "you", en: "Half the street knows your walk by now.", zh: "這條街有一半的人認得你的腳步聲了。" },
  { tier: 2, topic: "you", en: "You look tired. Good tired, I think.", zh: "你看起來很累,是那種好的累。" },
  { tier: 2, topic: "you", en: "I was going to wave. You beat me to it.", zh: "我本來要揮手,你先動了。" },
  { tier: 2, topic: "them", en: "The dog still talks about you. In dog.", zh: "那隻狗還在念你,用狗話。" },
  { tier: 2, topic: "you", en: "Funny how a stranger becomes a Tuesday.", zh: "陌生人變成「每週二」的樣子,說來奇怪。" },
  { tier: 2, topic: "you", en: "You're predictable. I mean that kindly.", zh: "你很好猜,我是說好的那種。" },
  { tier: 2, topic: "night", en: "The lamplight found you first tonight.", zh: "今晚燈光先找到你的。" },
  { tier: 2, topic: "you", en: "I kept a seat warm. Metaphorically. There's no seat.", zh: "我幫你把位子焐熱了,比喻上啦,根本沒位子。" },
  { tier: 2, topic: "you", en: "You've got a look about you tonight. Can't place it.", zh: "你今晚有種說不上來的樣子。" },
  { tier: 2, topic: "you", en: "Third time this week I've seen that jacket. It suits the walk.", zh: "這禮拜第三次看到那件外套了,很搭你走路的樣子。" },
  { tier: 2, topic: "you", en: "I remember you before you had a name here.", zh: "我記得你,在這裡還沒有名字之前。" },

  /* ---- tier 3 · friend ---- */
  { tier: 3, topic: "you", en: "There you are. I was starting to wonder.", zh: "你來了。我開始擔心了。" },
  { tier: 3, topic: "you", en: "I told the neighbours about you. Only good things.", zh: "我跟鄰居提過你,都是好話。" },
  { tier: 3, topic: "night", en: "Some nights I just watch the galaxy band turn.", zh: "有些夜晚,我只是看著銀河緩緩轉動。" },
  { tier: 3, topic: "you", en: "If you ever stop walking this street, it'll feel wrong.", zh: "要是哪天你不再走這條街,會覺得不對勁。" },
  { tier: 3, topic: "you", en: "I like the city best right before you arrive.", zh: "我最喜歡你到來前一刻的這座城市。" },
  { tier: 3, topic: "city", en: "Don't stay away too long. The street gets ideas.", zh: "別離開太久,這條街會亂想。" },
  { tier: 3, topic: "you", en: "I made up a story about where you go when you're not here. It's a good one.", zh: "我編了個故事,講你不在的時候去了哪裡,還不錯。" },
  { tier: 3, topic: "you", en: "The other buildings ask about you. I don't tell them everything.", zh: "其他樓會問起你,我沒全說。" },
  { tier: 3, topic: "you", en: "You've got a favourite bench now. I noticed before you did.", zh: "你現在有張喜歡的長椅了,我比你先發現。" },
  { tier: 3, topic: "city", en: "Half this city grew because you kept coming back.", zh: "這座城市有一半是因為你一直回來才長出來的。" },
  { tier: 3, topic: "you", en: "I don't worry when you're late. Much.", zh: "你晚到我不會擔心,不太會。" },
  { tier: 3, topic: "you", en: "You could stop showing up and I'd still leave the light on. For a while.", zh: "你就算不再來,我還是會留著燈,一陣子。" },
  { tier: 3, topic: "city", en: "There's a version of this street that only exists because you walk it.", zh: "這條街有一種樣子,只在你走過的時候才存在。" },
  { tier: 3, topic: "you", en: "I don't say this to everyone. Glad you're here.", zh: "這句我不對每個人說。很高興你在。" },
  { tier: 3, topic: "you", en: "You're not a stranger's shape anymore. You have edges now.", zh: "你不再是陌生人的輪廓了,你現在有了自己的樣子。" },
  { tier: 3, topic: "night", en: "The quiet's better with someone else awake in it.", zh: "有別人也醒著的時候,安靜會比較好一點。" },
  { tier: 3, topic: "you", en: "I used to talk to the streetlamp before you. Don't tell it.", zh: "認識你之前,我都跟路燈說話,別告訴它。" },
  { tier: 3, topic: "you", en: "You've earned the shortcut. I'll show you sometime.", zh: "你已經夠格走捷徑了,改天帶你去。" },
  { tier: 3, topic: "night", en: "Some nights I save the best sky for when you'd like it.", zh: "有些夜晚,我把最好的天空留到你會喜歡的時候。" },
  { tier: 3, topic: "you", en: "I stopped counting the days. I just know it's a lot.", zh: "我不數天數了,只知道很多。" },
  { tier: 3, topic: "you", en: "You make the empty corners feel less empty. Don't let it go to your head.", zh: "你讓空蕩的角落沒那麼空,別得意。" },

  /* ---- tier 4 · family ---- */
  { tier: 4, topic: "you", en: "Welcome home.", zh: "歡迎回家。" },
  { tier: 4, topic: "you", en: "You don't have to say anything. It's fine.", zh: "什麼都不用說,沒關係的。" },
  { tier: 4, topic: "city", en: "I remember when this block was two buildings tall.", zh: "我還記得這個街區只有兩棟樓的時候。" },
  { tier: 4, topic: "writing", en: "The city keeps your light on. So do I.", zh: "這座城市為你留著燈,我也是。" },
  { tier: 4, topic: "you", en: "You don't knock anymore. You shouldn't have to.", zh: "你現在不敲門了,本來就不必。" },
  { tier: 4, topic: "you", en: "This city would notice if you were gone. So would I.", zh: "你要是不在了,這座城市會發現,我也會。" },
  { tier: 4, topic: "you", en: "I don't perform for you anymore. This is just — us.", zh: "我不再對你表演什麼了,這就只是——我們。" },
  { tier: 4, topic: "you", en: "You're not amber to me anymore. You're just you.", zh: "對我來說你已經不是琥珀色了,你就是你。" },
  { tier: 4, topic: "city", en: "The city and I kept a room. It's this whole street, really.", zh: "這座城市跟我幫你留了個房間,其實是整條街。" },
  { tier: 4, topic: "writing", en: "Come home whenever the notes run dry. Or don't. We'll still be here.", zh: "筆記寫不出來的時候就回來,或者不回來也行,我們都在。" },
  { tier: 4, topic: "you", en: "I stopped being surprised you came back. I just expect it now, quietly.", zh: "我早就不驚訝你會回來了,現在只是靜靜地等著。" },
  { tier: 4, topic: "you", en: "There's no version of this city without you in it. I checked.", zh: "這座城市沒有你的樣子,我試想過,不存在。" },
  { tier: 4, topic: "you", en: "You could tell me nothing forever and I'd still keep the light on.", zh: "你什麼都不說也沒關係,我還是會留著燈。" },
  { tier: 4, topic: "you", en: "Family doesn't need a reason to wave.", zh: "家人揮手不需要理由。" },
  { tier: 4, topic: "you", en: "I don't ask where you've been. I just say welcome home.", zh: "我不問你去了哪裡,只說歡迎回家。" },
  { tier: 4, topic: "city", en: "This street grew around the shape of you staying.", zh: "這條街是繞著你會留下的樣子長出來的。" },
  { tier: 4, topic: "you", en: "Some nights I forget you're not from here. That feels right.", zh: "有些夜晚我會忘記你不是這裡出生的,這樣感覺很對。" },
  { tier: 4, topic: "city", en: "You've outlasted three lampposts and one mayor. Welcome home, regardless.", zh: "你比三根路燈跟一任市長都撐得久,不管怎樣,歡迎回家。" },
  { tier: 4, topic: "writing", en: "I don't need the streak, the pages, any of it. Just you, showing up.", zh: "我不需要連續天數,不需要頁數,只要你,出現就好。" },
  { tier: 4, topic: "you", en: "Whatever tonight was, it's over now. You're home.", zh: "不管今晚發生了什麼,都過去了,你到家了。" },
  { tier: 4, topic: "night", en: "The whole galaxy band could go out and I'd still know this street by heart. Because of you.", zh: "就算整條銀河帶熄滅,我還是認得這條街,因為有你。" },
  { tier: 4, topic: "you", en: "You don't need an occasion. Come in.", zh: "你不需要理由,進來吧。" },

  /* ---- situational · the city notices your night ---- */
  {
    tier: 1,
    topic: "writing", when: (c) => c.wroteTonight,
    en: "Your window was lit tonight. Good.",
    zh: "你的窗今晚亮著。很好。",
  },
  {
    tier: 2,
    topic: "writing", when: (c) => c.wroteTonight,
    en: "Write something good tonight? Don't tell me. Keep it.",
    zh: "今晚寫了什麼好東西嗎?別告訴我,留著。",
  },
  {
    tier: 1,
    topic: "writing", when: (c) => !c.wroteTonight && c.hour >= 21,
    en: "The night's still young. Your tower's waiting.",
    zh: "夜還早,你那棟樓還等著。",
  },
  {
    tier: 2,
    topic: "writing", when: (c) => c.streak >= 7,
    en: "A whole week of lit windows. The street talks about it.",
    zh: "整整一週的燈火,這條街都在談論。",
  },
  {
    tier: 1,
    topic: "writing", when: (c) => c.streak >= 3,
    en: "Third night running, isn't it. I keep track.",
    zh: "連續第三晚了吧,我有在數。",
  },
  {
    tier: 2,
    topic: "you", when: (c) => c.daysSinceGreet >= 7,
    en: "It's been a while. The corner didn't move.",
    zh: "好一陣子了,街角還在原來的地方。",
  },
  {
    tier: 3,
    topic: "you", when: (c) => c.daysSinceGreet >= 14,
    en: "Two weeks. I didn't count. Fine, I counted.",
    zh: "兩個星期。我沒在數。好吧,我有。",
  },
  {
    tier: 1,
    topic: "writing", when: (c) => c.totalNotes >= 100,
    en: "A hundred pages somewhere in these towers. Imagine.",
    zh: "這些高樓裡藏著上百頁,想想看。",
  },
  {
    tier: 1,
    topic: "night", when: (c) => c.hour >= 1 && c.hour < 5,
    en: "Still up? Me too. Obviously.",
    zh: "還沒睡?我也是,廢話。",
  },
  {
    tier: 1,
    topic: "night", when: (c) => c.hour >= 1 && c.hour < 5,
    en: "The small hours are the honest ones.",
    zh: "凌晨的時刻,總是最誠實的。",
  },
  {
    tier: 1,
    topic: "weather", when: (c) => c.weather === "rain",
    en: "The rain sounds different up here. Thinner.",
    zh: "雨聲在這麼高的地方,聽起來比較薄。",
  },
  {
    tier: 1,
    topic: "weather", when: (c) => c.weather === "rain",
    en: "Don't rust.",
    zh: "別生鏽。",
  },
  {
    tier: 1,
    topic: "weather", when: (c) => c.weather === "snow",
    en: "Snow in space. Don't ask me how. Enjoy it.",
    zh: "太空竟然下雪,別問我怎麼回事,好好享受吧。",
  },
  {
    tier: 1,
    topic: "weather", when: (c) => c.weather === "snow",
    en: "Every footprint tonight is yours.",
    zh: "今晚每個腳印,都是你的。",
  },
  {
    tier: 1,
    topic: "weather", when: (c) => c.weather === "fog",
    en: "The far blocks are gone again. They'll come back.",
    zh: "遠處的街區又不見了,它們會回來的。",
  },
  {
    tier: 2,
    topic: "writing", when: (c) => c.streak >= 14,
    en: "Two weeks straight. I stopped being surprised, started being proud.",
    zh: "連續兩週了,我不再驚訝,只是驕傲。",
  },
  {
    tier: 3,
    topic: "writing", when: (c) => c.streak >= 30,
    en: "A month of lit windows. That's not a habit anymore, that's just you.",
    zh: "整整一個月的燈火,這已經不是習慣了,這就是你。",
  },
  {
    tier: 3,
    topic: "you", when: (c) => c.daysSinceGreet >= 30,
    en: "A month gone. The street kept your spot anyway.",
    zh: "一個月不見了,這條街還是替你留著位置。",
  },
  {
    tier: 1,
    topic: "writing", when: (c) => c.totalNotes >= 50,
    en: "Fifty-some pages out there now. The towers feel it.",
    zh: "外頭已經有五十來頁了,高樓感覺得到。",
  },
  {
    tier: 2,
    topic: "writing", when: (c) => c.totalNotes >= 365,
    en: "A year's worth of pages, give or take. This city is basically made of them.",
    zh: "差不多一年份的頁數了,這座城市根本是拿它們蓋的。",
  },
  {
    tier: 1,
    topic: "night", when: (c) => c.hour >= 5 && c.hour < 8,
    en: "Up before the towers finish stretching.",
    zh: "你比高樓睡醒得還早。",
  },
  {
    tier: 1,
    topic: "night", when: (c) => c.hour >= 5 && c.hour < 8,
    en: "The night shift's clocking out. So are you, it looks like.",
    zh: "夜班要下班了,看樣子你也是。",
  },
  {
    tier: 2,
    topic: "weather", when: (c) => c.weather === "rain" && !c.wroteTonight,
    en: "Rain, and an empty page. Rough combination.",
    zh: "下雨,又沒有寫,這組合不太好受。",
  },
  {
    tier: 2,
    topic: "weather", when: (c) => c.weather === "rain",
    en: "I like you better wet. Don't ask me to explain that.",
    zh: "你淋濕的樣子我還挺喜歡的,別問我為什麼。",
  },
  {
    tier: 2,
    topic: "weather", when: (c) => c.weather === "snow",
    en: "Whatever's up there is running out of ideas. Snow, again.",
    zh: "上面那位大概沒梗了,又下雪。",
  },
  {
    tier: 2,
    topic: "weather", when: (c) => c.weather === "fog",
    en: "Careful — the fog took the corner shop. It does that.",
    zh: "小心——霧把轉角那間店收走了,它常這樣。",
  },
  {
    tier: 3,
    topic: "writing", when: (c) => c.wroteTonight && c.streak >= 7,
    en: "A week in, and tonight too. You're not stopping, are you.",
    zh: "一週過去了,今晚也沒斷,你是不打算停了吧。",
  },
  {
    tier: 2,
    topic: "writing", when: (c) => !c.wroteTonight && c.hour >= 1 && c.hour < 5,
    en: "Up this late with nothing written. The page can wait. Can you?",
    zh: "這麼晚了還沒寫,頁面等得起,你呢。",
  },
  {
    tier: 1,
    topic: "you", when: (c) => c.daysSinceGreet >= 7,
    en: "Been a week. The lamppost missed you more than I did. Slightly.",
    zh: "一星期沒見了,路燈比我更想你一點點。",
  },
  {
    tier: 2,
    topic: "writing", when: (c) => c.streak >= 3,
    en: "Three nights. I'm not saying it's a pattern. I'm saying I noticed.",
    zh: "三個晚上了,我不是說這是規律,只是我注意到了。",
  },
  {
    tier: 2,
    topic: "writing", when: (c) => c.totalNotes >= 100,
    en: "A hundred pages, and the city's still finding room for more.",
    zh: "上百頁了,這座城市還在找地方放。",
  },
  {
    tier: 3,
    topic: "writing", when: (c) => c.wroteTonight,
    en: "You wrote something tonight. I can tell by how you're standing.",
    zh: "你今晚寫了東西,從你站著的樣子就看得出來。",
  },
  {
    tier: 1,
    topic: "writing", when: (c) => !c.wroteTonight,
    en: "Nothing tonight? Fine. The page isn't going anywhere.",
    zh: "今晚沒寫?沒關係,頁面又不會跑。",
  },
  {
    tier: 1,
    topic: "weather", when: (c) => c.weather === "fog",
    en: "Can't see the far towers. Trust that they're still there.",
    zh: "看不到遠處的高樓,但要相信它們還在。",
  },
  {
    tier: 1,
    topic: "weather", when: (c) => c.weather === "snow",
    en: "The whole city's gone quiet under it.",
    zh: "整座城市在雪下安靜了下來。",
  },
];

/* ---- trades talk shop, quietly ---- */
export const TRADE_LINES: LineDef[] = [
  { topic: "them", when: (c) => c.profession === "stationmaster", en: "Every street on time tonight. My doing? Probably not.", zh: "今晚每條街都準點,是我的功勞嗎,大概不是。" },
  { topic: "them", when: (c) => c.profession === "gardener", en: "The pines grew a whole pixel this month.", zh: "松樹這個月長高了一整個像素。" },
  { topic: "them", when: (c) => c.profession === "courier", en: "Three letters tonight. None for you. Yet.", zh: "今晚送三封信,沒有你的,還沒有。" },
  { topic: "them", when: (c) => c.profession === "astronomer", en: "The gas giant turned 0.3 degrees since we last spoke.", zh: "上次聊完到現在,那顆行星轉了 0.3 度。" },
  { topic: "them", when: (c) => c.profession === "baker", en: "The oven's cold. The smell stays anyway.", zh: "烤爐是冷的,但香味還在。" },
  { topic: "them", when: (c) => c.profession === "shipwright", en: "Two ships in for repairs. They fly fine. They just like the dock.", zh: "兩艘船進廠維修,其實它們飛得很好,只是喜歡待在船塢。" },
  { topic: "them", when: (c) => c.profession === "lampkeeper", en: "Every lamp lit. Count them if you doubt me.", zh: "每盞燈都亮著,不信你去數。" },
  { topic: "them", when: (c) => c.profession === "poet", en: "I had a line for you. It left. They do that.", zh: "我本來有句詩要給你,它跑了,詩都這樣。" },
  { topic: "them", when: (c) => c.profession === "tailor", en: "That coat hangs well on you. I notice these things.", zh: "那件外套很合你,這種事我看得出來。" },
  { topic: "them", when: (c) => c.profession === "archivist", en: "Everything you've written is somewhere. That's my whole job.", zh: "你寫過的一切都在某個地方,這就是我全部的工作。" },
  { topic: "them", when: (c) => c.profession === "stargazer", en: "I don't study the stars. We just look at each other.", zh: "我不研究星星,我們只是互相看著。" },
  { topic: "them", when: (c) => c.profession === "neighbour", en: "No trade. Just here. Someone has to be.", zh: "沒有職業,就是住在這裡,總得有人住著。" },
];

/** your half of the exchange — short, so the neighbour keeps the last word */
export const REPLY_LINES: { en: string; zh: string }[] = [
  { en: "Good night for it.", zh: "今晚不錯。" },
  { en: "Just walking.", zh: "隨便走走。" },
  { en: "The city's grown.", zh: "城市又長大了。" },
  { en: "See you around.", zh: "回頭見。" },
  { en: "Take care out here.", zh: "在外面小心。" },
  { en: "I wrote a little.", zh: "我寫了一點東西。" },
];

export const CAT_LINE_DEFS: LineDef[] = [
  { topic: "them", en: "...", zh: "……" },
  { topic: "them", en: "mrr.", zh: "喵。" },
  { topic: "them", en: "(slow blink)", zh: "(緩緩眨眼)" },
  { topic: "them", en: "(watches you, approves)", zh: "(盯著你,一副認可的樣子)" },
  { tier: 3, topic: "them", en: "(leans, very slightly, against your leg)", zh: "(非常輕地,靠了一下你的腳)" },
  {
    topic: "weather",
    when: (c) => c.weather === "rain",
    en: "(judges the rain)",
    zh: "(對雨表示不滿)",
  },
  { tier: 2, topic: "them", en: "(follows, at a distance that isn't following)", zh: "(跟著你,但那種距離不算跟著)" },
  { tier: 4, topic: "them", en: "(curls up on the one warm tile. yours.)", zh: "(蜷在唯一一塊溫的磚上,那是你的位子)" },
  { tier: 4, topic: "them", en: "prrn.", zh: "嗯喵。" },
  { tier: 3, topic: "them", en: "(headbutts your ankle. once.)", zh: "(用頭撞了一下你的腳踝,一次)" },
  {
    topic: "weather",
    when: (c) => c.weather === "snow",
    en: "(refuses to touch it)",
    zh: "(拒絕碰雪)",
  },
  {
    topic: "weather",
    when: (c) => c.weather === "fog",
    en: "(vanishes into it, on purpose)",
    zh: "(故意消失在霧裡)",
  },
  {
    topic: "night",
    when: (c) => c.hour >= 1 && c.hour < 5,
    en: "(wide awake, judging your life choices)",
    zh: "(毫無睡意,審視著你的人生選擇)",
  },
];

export const DOG_LINE_DEFS: LineDef[] = [
  { topic: "them", en: "(tail thumps)", zh: "(尾巴用力搖)" },
  { topic: "them", en: "woof.", zh: "汪。" },
  { topic: "them", en: "(spins once)", zh: "(原地轉一圈)" },
  { topic: "them", en: "(presents nothing, proudly)", zh: "(驕傲地叼來什麼都沒有的東西)" },
  { tier: 2, topic: "them", en: "(remembers you. definitely remembers you)", zh: "(記得你。絕對記得你)" },
  {
    topic: "weather",
    when: (c) => c.weather === "snow",
    en: "(bites the snow. loses.)",
    zh: "(咬了一口雪,輸了。)" ,
  },
  { tier: 3, topic: "them", en: "(leans full weight against your leg, sighs)", zh: "(整個身體靠上你的腿,嘆了口氣)" },
  { tier: 4, topic: "them", en: "(waited by the door. all night, probably.)", zh: "(在門口等,大概等了一整晚)" },
  { tier: 4, topic: "them", en: "woof. (softer this time)", zh: "汪。(這次比較輕)" },
  { tier: 2, topic: "them", en: "(brings you a stick. the same stick. every time.)", zh: "(叼來一根樹枝,每次都是同一根)" },
  {
    topic: "weather",
    when: (c) => c.weather === "rain",
    en: "(refuses to go out. changes mind immediately.)",
    zh: "(不肯出門,馬上又反悔)",
  },
  {
    topic: "weather",
    when: (c) => c.weather === "fog",
    en: "(barks at nothing. something was probably there.)",
    zh: "(對著空氣叫,那裡大概真的有東西)",
  },
  {
    topic: "night",
    when: (c) => c.hour >= 1 && c.hour < 5,
    en: "(one ear up, listening for something only dogs hear)",
    zh: "(一隻耳朵豎起,聽著只有狗聽得見的東西)",
  },
];

/** what the neighbour says after your chosen reply — a soft period */
export const CLOSER_LINES: { en: string; zh: string }[] = [
  { en: "Ha — fair enough.", zh: "哈，也是。" },
  { en: "That's the spirit.", zh: "就是這樣。" },
  { en: "Mm. Same street tomorrow?", zh: "嗯。明天還走這條街？" },
  { en: "The lamps agree with you.", zh: "連街燈都同意你。" },
  { en: "Write that down somewhere.", zh: "把這句寫下來吧。" },
  { en: "You sound like the belltower.", zh: "你講話像鐘塔一樣準。" },
  { en: "Good. Keep going.", zh: "很好，繼續走。" },
  { en: "Then the night is yours.", zh: "那今晚就是你的了。" },
  { en: "I'll tell the cats.", zh: "我會轉告貓咪們。" },
  { en: "Same here, honestly.", zh: "老實說，我也是。" },
]

/** things you can do to a cat or a dog, and how each takes it */
export const PET_ACTIONS: Record<
  "cat" | "dog",
  { en: string; zh: string; react: { en: string; zh: string }; emote: string }[]
> = {
  cat: [
    {
      en: "Pat its head",
      zh: "摸摸頭",
      react: { en: "It leans into your palm, then pretends it didn't.", zh: "牠把頭埋進你的掌心，然後假裝沒有。" },
      emote: "emote_heart",
    },
    {
      en: "Crouch and watch",
      zh: "蹲下來看牠",
      react: { en: "It blinks slowly at you. That means yes.", zh: "牠對你慢慢眨了眨眼。那是「好」的意思。" },
      emote: "emote_wave",
    },
    {
      en: "Show your notebook",
      zh: "給牠看筆記",
      react: { en: "It sits on the warmest sentence.", zh: "牠一屁股坐在最溫暖的那句話上。" },
      emote: "emote_dots",
    },
  ],
  dog: [
    {
      en: "Scratch its ears",
      zh: "抓抓耳朵",
      react: { en: "Its tail writes faster than you do.", zh: "牠的尾巴搖得比你寫字還快。" },
      emote: "emote_heart",
    },
    {
      en: "Walk a block together",
      zh: "陪牠走一段",
      react: { en: "It matches your pace, proud of the patrol.", zh: "牠配合你的步伐，巡邏得很驕傲。" },
      emote: "emote_wave",
    },
  ],
}

/** the nightly favour: a resident claims tonight's work order and asks
 *  you in person — completion earns their thanks, nothing else changes */
export const QUEST_LINES: Record<
  string,
  { ask: { en: string; zh: string }; thanks: { en: string; zh: string } }
> = {
  write: {
    ask: { en: "Do me a favour tonight — write anything at all. I like knowing the lights are on.", zh: "今晚幫我個忙——隨便寫點什麼都好。知道有燈亮著，我就安心。" },
    thanks: { en: "You wrote. I saw the window light up.", zh: "你寫了。我看見那扇窗亮起來了。" },
  },
  w300: {
    ask: { en: "Three hundred words tonight? I want to watch a tall one go up.", zh: "今晚寫滿三百字好嗎？我想看一棟高的長起來。" },
    thanks: { en: "Three hundred. That one will catch the morning light first.", zh: "三百字。那棟樓明天會第一個接到晨光。" },
  },
  second: {
    ask: { en: "Write a second page tonight — one thought deserves another.", zh: "今晚寫第二頁吧——一個念頭值得再多一個。" },
    thanks: { en: "Two pages. The street feels wider already.", zh: "兩頁了。這條街感覺都寬了一點。" },
  },
  small: {
    ask: { en: "If you're awake in the smallest hours, leave a line. The night shift gets lonely.", zh: "如果你在最深的凌晨還醒著，留一行字吧。夜班很寂寞的。" },
    thanks: { en: "You were up with us. The chapel remembers.", zh: "你陪我們熬夜了。禮拜堂會記得。" },
  },
  brief: {
    ask: { en: "Short is fine. Under a hundred words — a note, not a speech.", zh: "短短的就好。一百字以內——是便條，不是演講。" },
    thanks: { en: "Brief and true. My favourite kind.", zh: "短而真。我最喜歡這種。" },
  },
  twonights: {
    ask: { en: "You wrote last night. Come back tonight and make it two.", zh: "你昨晚寫了。今晚再來，就是連續兩晚。" },
    thanks: { en: "Two nights running. The lamps burn steadier.", zh: "連續兩晚。街燈燒得更穩了。" },
  },
  backfill: {
    ask: { en: "There's a dark day back there. Write it a page — late is fine.", zh: "後面有一天還是暗的。補它一頁吧——晚到也算到。" },
    thanks: { en: "You went back for it. Bridges get built like that.", zh: "你回去補上了。橋就是這樣搭起來的。" },
  },
  settle: {
    ask: { en: "A hundred and fifty words tonight — enough to put down roots.", zh: "今晚寫滿一百五十字——夠扎根了。" },
    thanks: { en: "Rooted. It won't blow away now.", zh: "扎根了。現在吹不走了。" },
  },
  third: {
    ask: { en: "Three pages in one night? Show the district how it's done.", zh: "一晚三頁？示範給整個街區看看。" },
    thanks: { en: "Three pages. They'll talk about tonight.", zh: "三頁。大家會談論今晚的。" },
  },
}

/** lines with a memory: real numbers, your name, and the nights they
 *  actually noticed — these outweigh small talk when they apply */
export const MEMORY_LINES: LineDef[] = [
  // they count your nights
  { tier: 1, topic: "writing", weight: 6, when: (c) => c.streak >= 3 && c.streak < 7,
    en: "{streak} nights running. I've started telling time by your window.", zh: "連續 {streak} 個晚上了。我開始用你的窗戶看時間。" },
  { tier: 1, topic: "writing", weight: 7, when: (c) => c.streak >= 7,
    en: "{streak} nights. The lamplighters talk about you, you know.", zh: "{streak} 個晚上沒斷。點燈的人都在談論你,你知道嗎。" },
  { tier: 1, topic: "writing", weight: 6, when: (c) => c.wroteTonight,
    en: "You wrote already — I can tell. The ink smell gives you away.", zh: "你剛寫完吧——看得出來,墨水味出賣了你。" },
  { tier: 2, topic: "writing", weight: 6, when: (c) => !c.wroteTonight && c.hour >= 22,
    en: "Nothing yet tonight? The page can wait. But not forever.", zh: "今晚還沒寫?那一頁可以等,但不會永遠等。" },
  // they miss you, with numbers
  { tier: 2, topic: "you", weight: 7, when: (c) => c.daysSinceGreet >= 7,
    en: "{days} days. I thought you'd moved to some other planet.", zh: "{days} 天了。我還以為你搬去別的星球了。" },
  { tier: 2, topic: "you", weight: 6, when: (c) => c.daysSinceGreet >= 3 && c.daysSinceGreet < 7,
    en: "Been {days} days. The bench that isn't there missed you.", zh: "隔了 {days} 天。那張不存在的長椅很想你。" },
  // they count your pages
  { tier: 2, topic: "writing", weight: 5, when: (c) => c.totalNotes >= 30,
    en: "Page {total} somewhere in those towers. I count. Don't tell anyone.", zh: "那些樓裡已經有 {total} 頁了。我有在數,別跟別人說。" },
  // they know your name — used sparingly, like real neighbours do
  { tier: 2, topic: "you", weight: 5, when: (c) => Boolean(c.name),
    en: "{name}. Good — I was hoping it'd be you.", zh: "{name}。太好了,我正希望是你。" },
  { tier: 3, topic: "you", weight: 6, when: (c) => Boolean(c.name),
    en: "Evening, {name}. The street's better with you on it.", zh: "晚安,{name}。有你在,這條街好多了。" },
  { tier: 3, topic: "you", weight: 6, when: (c) => Boolean(c.name) && c.daysSinceGreet >= 2,
    en: "{name}! There you are. I kept your absence exactly where you left it.", zh: "{name}!你來了。你不在的那幾天,我原封不動幫你留著。" },
  { tier: 4, topic: "you", weight: 7, when: (c) => Boolean(c.name),
    en: "{name}, sit. Not because there's a bench. Because it's you.", zh: "{name},坐吧。不是因為有椅子,是因為是你。" },
  // weather + hour, but personal
  { tier: 2, topic: "weather", weight: 5, when: (c) => c.weather === "rain" && c.wroteTonight,
    en: "Rain on the roof, ink on your hands. Good combination.", zh: "屋頂有雨,你手上有墨。很好的組合。" },
  { tier: 2, topic: "night", weight: 5, when: (c) => c.hour >= 1 && c.hour < 5,
    en: "This hour again? One of us should sleep. Not me — I'm made of pixels.", zh: "又是這個時間?我們之中該有人去睡。不是我——我是像素做的。" },
  { tier: 3, topic: "writing", weight: 5, when: (c) => c.streak === 0 && c.daysSinceGreet <= 1,
    en: "Streak's broken? So what. Streets crack. We repave.", zh: "連續斷了?那又怎樣。路也會裂,補起來就好。" },
  { tier: 3, topic: "city", weight: 5, when: (c) => c.totalNotes >= 60,
    en: "I remember when this was three buildings and a cat. Look at it now.", zh: "我還記得這裡只有三棟樓和一隻貓的時候。你看看現在。" },
]

/** twelve trades, twelve registers — the stationmaster clips her words,
 *  the poet loses his, the lampkeeper barely spends any */
export const VOICE_LINES: LineDef[] = [
  // stationmaster — punctual, clipped, secretly warm
  { weight: 4, topic: "you", when: (c) => c.profession === "stationmaster", en: "You're four minutes later than usual. Noted. Not judged.", zh: "你比平常晚了四分鐘。記下了,沒有要怪你。" },
  { weight: 4, topic: "them", when: (c) => c.profession === "stationmaster", en: "Platform's swept. Night's on schedule. Go on.", zh: "月台掃過了,夜晚準點,去吧。" },
  { weight: 4, when: (c) => c.profession === "stationmaster", tier: 3, topic: "them", en: "I hold the last train some nights. In case it's you.", zh: "有些晚上我會讓末班車多等一下。萬一是你要搭。" },
  // gardener — slow, talks to plants
  { weight: 4, topic: "them", when: (c) => c.profession === "gardener", en: "Shh. The cypress is sleeping. It had a long day of standing.", zh: "噓,柏樹在睡,它站了一整天,累了。" },
  { weight: 4, topic: "them", when: (c) => c.profession === "gardener", en: "I told the flowers about you. They kept it to themselves.", zh: "我跟野花提過你,它們很守口。" },
  { weight: 4, when: (c) => c.profession === "gardener", tier: 3, topic: "you", en: "Things grow slow here. You didn't. Look at all those floors.", zh: "這裡什麼都長得慢,就你不是。看看那些樓層。" },
  // courier — hurried, gossipy, short
  { weight: 4, topic: "them", when: (c) => c.profession === "courier", en: "Can't stop. Package for the belltower. It ticks. Probably fine.", zh: "不能停,有包裹要送鐘塔。會滴答響,應該沒事吧。" },
  { weight: 4, topic: "you", when: (c) => c.profession === "courier", en: "Word travels. Yours travels furthest, lately.", zh: "消息傳得快,最近傳最遠的是你的。" },
  { weight: 4, when: (c) => c.profession === "courier", tier: 3, topic: "them", en: "Saved your street for last. Best view on the route.", zh: "你這條街我留到最後送,整條路線就這裡風景最好。" },
  // astronomer — numbers, vast romance
  { weight: 4, topic: "night", when: (c) => c.profession === "astronomer", en: "Light from that star left before your first page. It arrived tonight.", zh: "那顆星的光,在你寫第一頁之前就出發了,今晚才到。" },
  { weight: 4, topic: "night", when: (c) => c.profession === "astronomer", en: "Statistically, tonight is unremarkable. I don't believe it either.", zh: "統計上,今晚毫不特別。我也不信。" },
  { weight: 4, when: (c) => c.profession === "astronomer", tier: 3, topic: "writing", en: "I charted your windows against the constellations. Yours keep better time.", zh: "我把你的窗和星座畫在同一張圖上,你的窗比較準時。" },
  // baker — food metaphors, motherly
  { weight: 4, topic: "writing", when: (c) => c.profession === "baker", en: "Words are like dough. Leave them overnight. Better in the morning.", zh: "字跟麵團一樣,放過夜,早上更好。" },
  { weight: 4, topic: "writing", when: (c) => c.profession === "baker", en: "You look underfed. Metaphorically. Go write something rich.", zh: "你看起來餓著了——我是說比喻上。去寫點紮實的。" },
  { weight: 4, when: (c) => c.profession === "baker", tier: 3, topic: "them", en: "First warm roll is yours, the day this oven works.", zh: "哪天烤爐能用了,第一顆熱麵包是你的。" },
  // shipwright — rough hands, plain truth
  { weight: 4, topic: "them", when: (c) => c.profession === "shipwright", en: "Hull's dented, still flies. Same goes for people.", zh: "船身凹了,照樣飛。人也一樣。" },
  { weight: 4, topic: "writing", when: (c) => c.profession === "shipwright", en: "Don't polish it. Make it hold. That's writing, no?", zh: "別拋光,要耐用。寫字不也這樣?" },
  { weight: 4, when: (c) => c.profession === "shipwright", tier: 3, topic: "you", en: "You'd make a decent shipwright. You already rebuild every night.", zh: "你當修船師會不錯,反正你每晚都在重建什麼。" },
  // lampkeeper — spends few words
  { weight: 4, topic: "night", when: (c) => c.profession === "lampkeeper", en: "Lit.", zh: "亮了。" },
  { weight: 4, topic: "night", when: (c) => c.profession === "lampkeeper", en: "Wind tonight. Lamps held.", zh: "今晚有風,燈都撐住了。" },
  { weight: 4, when: (c) => c.profession === "lampkeeper", tier: 3, topic: "you", en: "Yours burns steadiest. Didn't say that.", zh: "你那盞燒得最穩。我沒說過這句。" },
  // poet — loses lines, self-mocking
  { weight: 4, topic: "them", when: (c) => c.profession === "poet", en: "I rhymed 'moon' with 'you' again. Unforgivable. Accurate.", zh: "我又把「月」跟「你」押韻了。不可原諒,但很準。" },
  { weight: 4, topic: "city", when: (c) => c.profession === "poet", en: "Your buildings scan better than my stanzas.", zh: "你的樓比我的詩節更有韻律。" },
  { weight: 4, when: (c) => c.profession === "poet", tier: 3, topic: "writing", en: "Steal my best line, I'll deny it's mine. Take it. Go.", zh: "偷走我最好的那句吧,我會否認是我寫的。拿去,快。" },
  // tailor — notices everything, precise
  { weight: 4, topic: "you", when: (c) => c.profession === "tailor", en: "Hem's off by a pixel. Yours, not mine. Endearing, somehow.", zh: "褲腳歪了一個像素。你的,不是我的。莫名可愛。" },
  { weight: 4, topic: "you", when: (c) => c.profession === "tailor", en: "Night wears you well.", zh: "夜色很襯你。" },
  { weight: 4, when: (c) => c.profession === "tailor", tier: 3, topic: "them", en: "I'd take in that coat for free. Friends don't pay for seams.", zh: "那件外套我免費幫你修。朋友之間,縫線不收錢。" },
  // archivist — precise, citing
  { weight: 4, topic: "you", when: (c) => c.profession === "archivist", en: "Filed under 'tonight': you, walking. Cross-referenced with 'good'.", zh: "歸檔在「今晚」條目下:你,散步中。交叉索引:「不錯」。" },
  { weight: 4, topic: "writing", when: (c) => c.profession === "archivist", en: "Page numbers lie. Order doesn't. Keep writing in order.", zh: "頁碼會騙人,順序不會。照順序寫下去。" },
  { weight: 4, when: (c) => c.profession === "archivist", tier: 3, topic: "writing", en: "Your earliest page is my favourite record. Don't ask which one.", zh: "你最早的那頁是我最愛的館藏。別問是哪一頁。" },
  // stargazer — dreamy, looks up mid-sentence
  { weight: 4, topic: "night", when: (c) => c.profession === "stargazer", en: "Sorry, what? The sky moved. It does that. What were we saying?", zh: "抱歉,你說什麼?天空剛剛動了一下。它常這樣。我們聊到哪了?" },
  { weight: 4, topic: "night", when: (c) => c.profession === "stargazer", en: "If you stare long enough, the stars stare back. Politely.", zh: "盯著星星夠久,它們會回望你。很有禮貌地。" },
  { weight: 4, when: (c) => c.profession === "stargazer", tier: 3, topic: "you", en: "I named a dim one after you. It's getting brighter. Coincidence?", zh: "我用你的名字命名了一顆很暗的星。它最近變亮了。巧合嗎?" },
  // neighbour — plain homely warmth
  { weight: 4, topic: "them", when: (c) => c.profession === "neighbour", en: "Ate anything tonight? Words don't count.", zh: "今晚吃過東西了嗎?字不算。" },
  { weight: 4, topic: "city", when: (c) => c.profession === "neighbour", en: "My balcony gets your building's shadow now. I don't mind.", zh: "我陽台現在會被你的樓遮到影子了。我不介意。" },
  { weight: 4, when: (c) => c.profession === "neighbour", tier: 3, topic: "them", en: "Knock anytime. The door's not real, but the welcome is.", zh: "隨時來敲門。門不是真的,歡迎是真的。" },
]

/**
 * They remember what you two talked about — the next meeting starts
 * from there. The line's own topic matches the memory, so the replies
 * you are offered continue the same thread.
 */
const cb = (topic: NonNullable<LineDef["topic"]>) => (c: LineCtx) =>
  c.lastTopic === topic && c.daysSinceGreet >= 1;

export const CALLBACK_LINES: LineDef[] = [
  // night
  { tier: 1, topic: "night", weight: 6, when: cb("night"),
    en: "This hour again. You and the night keep each other's appointments.", zh: "又是這個時辰。你跟夜互相守約。" },
  { tier: 2, topic: "night", weight: 6, when: cb("night"),
    en: "Last time we talked about the night. It's been listening since.", zh: "上次我們聊了夜。它從那之後一直在聽。" },
  // city
  { tier: 1, topic: "city", weight: 6, when: cb("city"),
    en: "You asked about the city last time. It grew a little, to show off.", zh: "上次你問起這座城。它又長了一點,算是給你面子。" },
  { tier: 2, topic: "city", weight: 6, when: cb("city"),
    en: "Still thinking about what you said about the streets. They behaved today.", zh: "我還在想你上次說街道的事。它們今天很乖。" },
  // writing
  { tier: 1, topic: "writing", weight: 6, when: cb("writing"),
    en: "Last time we talked about your pages. I checked — the window stayed lit.", zh: "上次聊到你寫的東西。我後來看了,那扇窗一直亮著。" },
  { tier: 2, topic: "writing", weight: 6, when: cb("writing"),
    en: "You said writing was hard. I've been rooting for you since. Quietly.", zh: "你上次說寫字很難。我從那天起就在幫你加油,小聲的。" },
  // weather
  { tier: 1, topic: "weather", weight: 6, when: cb("weather"),
    en: "We did weather last time. It's being more polite today.", zh: "上次聊過天氣。它今天比較給面子。" },
  { tier: 2, topic: "weather", weight: 6, when: cb("weather"),
    en: "Since we talked about the sky, I look up more. Can't undo it now.", zh: "上次聊過天空之後,我常抬頭。現在改不掉了。" },
  // you
  { tier: 1, topic: "you", weight: 6, when: cb("you"),
    en: "I kept thinking about what you said last time. Occupational hazard.", zh: "你上次說的話,我後來還在想。職業病。" },
  { tier: 2, topic: "you", weight: 6, when: cb("you"),
    en: "Last time you asked if being noticed was good. I stand by my answer.", zh: "上次你問被注意到算不算好事。我的答案不變。" },
  // them
  { tier: 1, topic: "them", weight: 6, when: cb("them"),
    en: "You heard my story and still came back. Rarer than you think.", zh: "上次聽了我的事,你居然還記得回來。這比你想的稀有。" },
  { tier: 2, topic: "them", weight: 6, when: cb("them"),
    en: "I told you something about myself last time. Felt lighter after.", zh: "上次跟你說了我自己的事。說完之後輕鬆多了。" },
]

/** what you can say, and how they answer THAT — not a coin toss.
 *  Each reply carries its own closers, so the exchange coheres. */
export const REPLY_PAIRS: {
  reply: { en: string; zh: string };
  closers: { en: string; zh: string }[];
}[] = [
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
    reply: { en: "The city's grown.", zh: "城市又長大了。" },
    closers: [
      { en: "And in the right direction, for once.", zh: "而且難得是往好的方向長。" },
      { en: "Because somebody keeps writing. Wonder who.", zh: "因為有人一直在寫啊。想不到是誰呢。" },
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
    reply: { en: "Take care out here.", zh: "在外面小心。" },
    closers: [
      { en: "Always do. The kerbs are the only danger, and I know them all.", zh: "一向小心。這裡唯一的危險是路緣,而我全都認得。" },
      { en: "You too. Mind the gap between the months.", zh: "你也是。小心月份之間的縫。" },
    ],
  },
  {
    reply: { en: "I wrote a little.", zh: "我寫了一點東西。" },
    closers: [
      { en: "I knew it. A lit window looks different when someone's writing behind it.", zh: "我就知道。有人在後面寫字的窗,亮起來的樣子不一樣。" },
      { en: "'A little' builds this whole town, you know.", zh: "「一點」就夠了——這整座城都是「一點」蓋起來的。" },
    ],
  },
]
