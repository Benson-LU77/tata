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
  { en: "You're new. The city doesn't get many of those.", zh: "你是新來的,這座城市很少見到新面孔。" },
  { en: "First time on this street? It'll remember you now.", zh: "第一次走這條街?它現在會記得你了。" },
  { en: "I don't usually introduce myself. Consider this the exception.", zh: "我通常不自我介紹,這次算例外。" },
  { en: "Amber. Huh. Never seen that colour walk before.", zh: "琥珀色,嗯,還沒見過這種顏色會走路的。" },
  { en: "Welcome, I suppose. We'll see if it sticks.", zh: "算是歡迎吧,看看你會不會留下來。" },
  { en: "You looked lost. Everyone does, the first night.", zh: "你看起來有點迷路,第一晚大家都這樣。" },
];

export const LINES: LineDef[] = [
  /* ---- tier 1 · familiar ---- */
  { tier: 1, en: "Evening.", zh: "晚安。" },
  { tier: 1, en: "Nice night for it.", zh: "今晚很適合走走。" },
  { tier: 1, en: "The towers grew again, did you see?", zh: "高樓又長高了,你看見了嗎。" },
  { tier: 1, en: "Mind the kerb.", zh: "小心路緣。" },
  { tier: 1, en: "You're the amber one, aren't you.", zh: "你就是那個琥珀色的吧。" },
  { tier: 1, en: "Quiet tonight.", zh: "今晚很安靜。" },
  { tier: 1, en: "Cold roof tonight.", zh: "屋頂今晚有點涼。" },
  { tier: 1, en: "The stairs still creak. Some things don't change.", zh: "樓梯還是會吱嘎響,有些事沒變。" },
  { tier: 1, en: "Saw a shooting star. Might've been a satellite.", zh: "看到一顆流星,也可能只是衛星。" },
  { tier: 1, en: "The corner shop never opens. Never closes either.", zh: "轉角那間店從不開門,但也沒關過。" },
  { tier: 1, en: "Watch the gap between the blocks.", zh: "小心街區之間的縫。" },
  { tier: 1, en: "Someone's window flickered. Not yours.", zh: "有扇窗閃了一下,不是你的。" },
  { tier: 1, en: "The air tastes like static tonight.", zh: "今晚空氣裡有股靜電味。" },
  { tier: 1, en: "Long way round, but you made it.", zh: "繞了遠路,但你到了。" },
  { tier: 1, en: "The cats have a meeting. You're not invited.", zh: "貓開會,你沒被邀。" },
  { tier: 1, en: "Same street, new dust.", zh: "還是那條街,不同的灰塵。" },
  { tier: 1, en: "I nodded. You nodded back. That's the whole conversation, some nights.", zh: "我點頭,你也點頭。有些夜晚,對話就到這裡。" },
  { tier: 1, en: "Careful, the pavement's still soft where it grew.", zh: "小心,人行道新生的那塊還沒硬。" },
  { tier: 1, en: "Nobody's out. Except you. Except me.", zh: "沒什麼人,除了你,除了我。" },
  { tier: 1, en: "The city hums lower after midnight.", zh: "過了午夜,城市的嗡嗡聲會變低。" },
  { tier: 1, en: "You walk like you've got somewhere to be. You don't, do you.", zh: "你走路像有地方要去,其實沒有,對吧。" },
  { tier: 1, en: "Watch your step. The whole street's new since Tuesday.", zh: "小心腳下,整條街從星期二起就是新的。" },
  { tier: 1, en: "The lamp on the corner blinks in code. Nobody's cracked it.", zh: "轉角那盞燈用密碼閃,沒人破解過。" },
  { tier: 1, en: "Some buildings lean in like they're listening.", zh: "有些樓會微微傾身,像在聽你說話。" },

  /* ---- tier 2 · acquainted ---- */
  { tier: 2, en: "You again! Good.", zh: "又是你!真好。" },
  { tier: 2, en: "I saved you a spot on the bench. There is no bench. Still.", zh: "我幫你留了位子。其實沒有長椅。沒關係。" },
  { tier: 2, en: "The lights were pretty last night.", zh: "昨晚的燈光很美。" },
  { tier: 2, en: "I counted the streetlamps today. Lost count.", zh: "我數過路燈,數到一半就忘了。" },
  { tier: 2, en: "Heard a new building settle. Sounded like yours.", zh: "聽見一棟新建築落成的聲音,聽起來像是你的。" },
  { tier: 2, en: "The dog chased Mochi again. Nobody won.", zh: "那隻狗又追著 Mochi 跑了,誰也沒贏。" },
  { tier: 2, en: "You smell like rain and ink.", zh: "你身上有雨和墨水的味道。" },
  { tier: 2, en: "I saved the good gossip for you. It's not much.", zh: "好八卦我留給你了,其實也沒多少。" },
  { tier: 2, en: "The bakery that isn't there smelled like something today.", zh: "那間不存在的麵包店,今天飄出了味道。" },
  { tier: 2, en: "You walk past the same bench every time. I've noticed.", zh: "你每次都經過同一張長椅,我注意到了。" },
  { tier: 2, en: "Someone asked about you. I said 'the amber one.' They knew.", zh: "有人問起你,我說「那個琥珀色的」,他們就懂了。" },
  { tier: 2, en: "I saved you the last quiet corner.", zh: "我幫你留了最安靜的那個角落。" },
  { tier: 2, en: "The city rearranged the alleys again. Yours stayed put.", zh: "城市又重排了巷弄,你的那條沒動。" },
  { tier: 2, en: "Half the street knows your walk by now.", zh: "這條街有一半的人認得你的腳步聲了。" },
  { tier: 2, en: "You look tired. Good tired, I think.", zh: "你看起來很累,是那種好的累。" },
  { tier: 2, en: "I was going to wave. You beat me to it.", zh: "我本來要揮手,你先動了。" },
  { tier: 2, en: "The dog still talks about you. In dog.", zh: "那隻狗還在念你,用狗話。" },
  { tier: 2, en: "Funny how a stranger becomes a Tuesday.", zh: "陌生人變成「每週二」的樣子,說來奇怪。" },
  { tier: 2, en: "You're predictable. I mean that kindly.", zh: "你很好猜,我是說好的那種。" },
  { tier: 2, en: "The lamplight found you first tonight.", zh: "今晚燈光先找到你的。" },
  { tier: 2, en: "I kept a seat warm. Metaphorically. There's no seat.", zh: "我幫你把位子焐熱了,比喻上啦,根本沒位子。" },
  { tier: 2, en: "You've got a look about you tonight. Can't place it.", zh: "你今晚有種說不上來的樣子。" },
  { tier: 2, en: "Third time this week I've seen that jacket. It suits the walk.", zh: "這禮拜第三次看到那件外套了,很搭你走路的樣子。" },
  { tier: 2, en: "I remember you before you had a name here.", zh: "我記得你,在這裡還沒有名字之前。" },

  /* ---- tier 3 · friend ---- */
  { tier: 3, en: "There you are. I was starting to wonder.", zh: "你來了。我開始擔心了。" },
  { tier: 3, en: "I told the neighbours about you. Only good things.", zh: "我跟鄰居提過你,都是好話。" },
  { tier: 3, en: "Some nights I just watch the galaxy band turn.", zh: "有些夜晚,我只是看著銀河緩緩轉動。" },
  { tier: 3, en: "If you ever stop walking this street, it'll feel wrong.", zh: "要是哪天你不再走這條街,會覺得不對勁。" },
  { tier: 3, en: "I like the city best right before you arrive.", zh: "我最喜歡你到來前一刻的這座城市。" },
  { tier: 3, en: "Don't stay away too long. The street gets ideas.", zh: "別離開太久,這條街會亂想。" },
  { tier: 3, en: "I made up a story about where you go when you're not here. It's a good one.", zh: "我編了個故事,講你不在的時候去了哪裡,還不錯。" },
  { tier: 3, en: "The other buildings ask about you. I don't tell them everything.", zh: "其他樓會問起你,我沒全說。" },
  { tier: 3, en: "You've got a favourite bench now. I noticed before you did.", zh: "你現在有張喜歡的長椅了,我比你先發現。" },
  { tier: 3, en: "Half this city grew because you kept coming back.", zh: "這座城市有一半是因為你一直回來才長出來的。" },
  { tier: 3, en: "I don't worry when you're late. Much.", zh: "你晚到我不會擔心,不太會。" },
  { tier: 3, en: "You could stop showing up and I'd still leave the light on. For a while.", zh: "你就算不再來,我還是會留著燈,一陣子。" },
  { tier: 3, en: "There's a version of this street that only exists because you walk it.", zh: "這條街有一種樣子,只在你走過的時候才存在。" },
  { tier: 3, en: "I don't say this to everyone. Glad you're here.", zh: "這句我不對每個人說。很高興你在。" },
  { tier: 3, en: "You're not a stranger's shape anymore. You have edges now.", zh: "你不再是陌生人的輪廓了,你現在有了自己的樣子。" },
  { tier: 3, en: "The quiet's better with someone else awake in it.", zh: "有別人也醒著的時候,安靜會比較好一點。" },
  { tier: 3, en: "I used to talk to the streetlamp before you. Don't tell it.", zh: "認識你之前,我都跟路燈說話,別告訴它。" },
  { tier: 3, en: "You've earned the shortcut. I'll show you sometime.", zh: "你已經夠格走捷徑了,改天帶你去。" },
  { tier: 3, en: "Some nights I save the best sky for when you'd like it.", zh: "有些夜晚,我把最好的天空留到你會喜歡的時候。" },
  { tier: 3, en: "I stopped counting the days. I just know it's a lot.", zh: "我不數天數了,只知道很多。" },
  { tier: 3, en: "You make the empty corners feel less empty. Don't let it go to your head.", zh: "你讓空蕩的角落沒那麼空,別得意。" },

  /* ---- tier 4 · family ---- */
  { tier: 4, en: "Welcome home.", zh: "歡迎回家。" },
  { tier: 4, en: "You don't have to say anything. It's fine.", zh: "什麼都不用說,沒關係的。" },
  { tier: 4, en: "I remember when this block was two buildings tall.", zh: "我還記得這個街區只有兩棟樓的時候。" },
  { tier: 4, en: "The city keeps your light on. So do I.", zh: "這座城市為你留著燈,我也是。" },
  { tier: 4, en: "You don't knock anymore. You shouldn't have to.", zh: "你現在不敲門了,本來就不必。" },
  { tier: 4, en: "This city would notice if you were gone. So would I.", zh: "你要是不在了,這座城市會發現,我也會。" },
  { tier: 4, en: "I don't perform for you anymore. This is just — us.", zh: "我不再對你表演什麼了,這就只是——我們。" },
  { tier: 4, en: "You're not amber to me anymore. You're just you.", zh: "對我來說你已經不是琥珀色了,你就是你。" },
  { tier: 4, en: "The city and I kept a room. It's this whole street, really.", zh: "這座城市跟我幫你留了個房間,其實是整條街。" },
  { tier: 4, en: "Come home whenever the notes run dry. Or don't. We'll still be here.", zh: "筆記寫不出來的時候就回來,或者不回來也行,我們都在。" },
  { tier: 4, en: "I stopped being surprised you came back. I just expect it now, quietly.", zh: "我早就不驚訝你會回來了,現在只是靜靜地等著。" },
  { tier: 4, en: "There's no version of this city without you in it. I checked.", zh: "這座城市沒有你的樣子,我試想過,不存在。" },
  { tier: 4, en: "You could tell me nothing forever and I'd still keep the light on.", zh: "你什麼都不說也沒關係,我還是會留著燈。" },
  { tier: 4, en: "Family doesn't need a reason to wave.", zh: "家人揮手不需要理由。" },
  { tier: 4, en: "I don't ask where you've been. I just say welcome home.", zh: "我不問你去了哪裡,只說歡迎回家。" },
  { tier: 4, en: "This street grew around the shape of you staying.", zh: "這條街是繞著你會留下的樣子長出來的。" },
  { tier: 4, en: "Some nights I forget you're not from here. That feels right.", zh: "有些夜晚我會忘記你不是這裡出生的,這樣感覺很對。" },
  { tier: 4, en: "You've outlasted three lampposts and one mayor. Welcome home, regardless.", zh: "你比三根路燈跟一任市長都撐得久,不管怎樣,歡迎回家。" },
  { tier: 4, en: "I don't need the streak, the pages, any of it. Just you, showing up.", zh: "我不需要連續天數,不需要頁數,只要你,出現就好。" },
  { tier: 4, en: "Whatever tonight was, it's over now. You're home.", zh: "不管今晚發生了什麼,都過去了,你到家了。" },
  { tier: 4, en: "The whole galaxy band could go out and I'd still know this street by heart. Because of you.", zh: "就算整條銀河帶熄滅,我還是認得這條街,因為有你。" },
  { tier: 4, en: "You don't need an occasion. Come in.", zh: "你不需要理由,進來吧。" },

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
  {
    tier: 2,
    when: (c) => c.streak >= 14,
    en: "Two weeks straight. I stopped being surprised, started being proud.",
    zh: "連續兩週了,我不再驚訝,只是驕傲。",
  },
  {
    tier: 3,
    when: (c) => c.streak >= 30,
    en: "A month of lit windows. That's not a habit anymore, that's just you.",
    zh: "整整一個月的燈火,這已經不是習慣了,這就是你。",
  },
  {
    tier: 3,
    when: (c) => c.daysSinceGreet >= 30,
    en: "A month gone. The street kept your spot anyway.",
    zh: "一個月不見了,這條街還是替你留著位置。",
  },
  {
    tier: 1,
    when: (c) => c.totalNotes >= 50,
    en: "Fifty-some pages out there now. The towers feel it.",
    zh: "外頭已經有五十來頁了,高樓感覺得到。",
  },
  {
    tier: 2,
    when: (c) => c.totalNotes >= 365,
    en: "A year's worth of pages, give or take. This city is basically made of them.",
    zh: "差不多一年份的頁數了,這座城市根本是拿它們蓋的。",
  },
  {
    tier: 1,
    when: (c) => c.hour >= 5 && c.hour < 8,
    en: "Up before the towers finish stretching.",
    zh: "你比高樓睡醒得還早。",
  },
  {
    tier: 1,
    when: (c) => c.hour >= 5 && c.hour < 8,
    en: "The night shift's clocking out. So are you, it looks like.",
    zh: "夜班要下班了,看樣子你也是。",
  },
  {
    tier: 2,
    when: (c) => c.weather === "rain" && !c.wroteTonight,
    en: "Rain, and an empty page. Rough combination.",
    zh: "下雨,又沒有寫,這組合不太好受。",
  },
  {
    tier: 2,
    when: (c) => c.weather === "rain",
    en: "I like you better wet. Don't ask me to explain that.",
    zh: "你淋濕的樣子我還挺喜歡的,別問我為什麼。",
  },
  {
    tier: 2,
    when: (c) => c.weather === "snow",
    en: "Whatever's up there is running out of ideas. Snow, again.",
    zh: "上面那位大概沒梗了,又下雪。",
  },
  {
    tier: 2,
    when: (c) => c.weather === "fog",
    en: "Careful — the fog took the corner shop. It does that.",
    zh: "小心——霧把轉角那間店收走了,它常這樣。",
  },
  {
    tier: 3,
    when: (c) => c.wroteTonight && c.streak >= 7,
    en: "A week in, and tonight too. You're not stopping, are you.",
    zh: "一週過去了,今晚也沒斷,你是不打算停了吧。",
  },
  {
    tier: 2,
    when: (c) => !c.wroteTonight && c.hour >= 1 && c.hour < 5,
    en: "Up this late with nothing written. The page can wait. Can you?",
    zh: "這麼晚了還沒寫,頁面等得起,你呢。",
  },
  {
    tier: 1,
    when: (c) => c.daysSinceGreet >= 7,
    en: "Been a week. The lamppost missed you more than I did. Slightly.",
    zh: "一星期沒見了,路燈比我更想你一點點。",
  },
  {
    tier: 2,
    when: (c) => c.streak >= 3,
    en: "Three nights. I'm not saying it's a pattern. I'm saying I noticed.",
    zh: "三個晚上了,我不是說這是規律,只是我注意到了。",
  },
  {
    tier: 2,
    when: (c) => c.totalNotes >= 100,
    en: "A hundred pages, and the city's still finding room for more.",
    zh: "上百頁了,這座城市還在找地方放。",
  },
  {
    tier: 3,
    when: (c) => c.wroteTonight,
    en: "You wrote something tonight. I can tell by how you're standing.",
    zh: "你今晚寫了東西,從你站著的樣子就看得出來。",
  },
  {
    tier: 1,
    when: (c) => !c.wroteTonight,
    en: "Nothing tonight? Fine. The page isn't going anywhere.",
    zh: "今晚沒寫?沒關係,頁面又不會跑。",
  },
  {
    tier: 1,
    when: (c) => c.weather === "fog",
    en: "Can't see the far towers. Trust that they're still there.",
    zh: "看不到遠處的高樓,但要相信它們還在。",
  },
  {
    tier: 1,
    when: (c) => c.weather === "snow",
    en: "The whole city's gone quiet under it.",
    zh: "整座城市在雪下安靜了下來。",
  },
];

/* ---- trades talk shop, quietly ---- */
export const TRADE_LINES: LineDef[] = [
  { when: (c) => c.profession === "stationmaster", en: "Every street on time tonight. My doing? Probably not.", zh: "今晚每條街都準點,是我的功勞嗎,大概不是。" },
  { when: (c) => c.profession === "gardener", en: "The pines grew a whole pixel this month.", zh: "松樹這個月長高了一整個像素。" },
  { when: (c) => c.profession === "courier", en: "Three letters tonight. None for you. Yet.", zh: "今晚送三封信,沒有你的,還沒有。" },
  { when: (c) => c.profession === "astronomer", en: "The gas giant turned 0.3 degrees since we last spoke.", zh: "上次聊完到現在,那顆行星轉了 0.3 度。" },
  { when: (c) => c.profession === "baker", en: "The oven's cold. The smell stays anyway.", zh: "烤爐是冷的,但香味還在。" },
  { when: (c) => c.profession === "shipwright", en: "Two ships in for repairs. They fly fine. They just like the dock.", zh: "兩艘船進廠維修,其實它們飛得很好,只是喜歡待在船塢。" },
  { when: (c) => c.profession === "lampkeeper", en: "Every lamp lit. Count them if you doubt me.", zh: "每盞燈都亮著,不信你去數。" },
  { when: (c) => c.profession === "poet", en: "I had a line for you. It left. They do that.", zh: "我本來有句詩要給你,它跑了,詩都這樣。" },
  { when: (c) => c.profession === "tailor", en: "That coat hangs well on you. I notice these things.", zh: "那件外套很合你,這種事我看得出來。" },
  { when: (c) => c.profession === "archivist", en: "Everything you've written is somewhere. That's my whole job.", zh: "你寫過的一切都在某個地方,這就是我全部的工作。" },
  { when: (c) => c.profession === "stargazer", en: "I don't study the stars. We just look at each other.", zh: "我不研究星星,我們只是互相看著。" },
  { when: (c) => c.profession === "neighbour", en: "No trade. Just here. Someone has to be.", zh: "沒有職業,就是住在這裡,總得有人住著。" },
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
  { tier: 2, en: "(follows, at a distance that isn't following)", zh: "(跟著你,但那種距離不算跟著)" },
  { tier: 4, en: "(curls up on the one warm tile. yours.)", zh: "(蜷在唯一一塊溫的磚上,那是你的位子)" },
  { tier: 4, en: "prrn.", zh: "嗯喵。" },
  { tier: 3, en: "(headbutts your ankle. once.)", zh: "(用頭撞了一下你的腳踝,一次)" },
  {
    when: (c) => c.weather === "snow",
    en: "(refuses to touch it)",
    zh: "(拒絕碰雪)",
  },
  {
    when: (c) => c.weather === "fog",
    en: "(vanishes into it, on purpose)",
    zh: "(故意消失在霧裡)",
  },
  {
    when: (c) => c.hour >= 1 && c.hour < 5,
    en: "(wide awake, judging your life choices)",
    zh: "(毫無睡意,審視著你的人生選擇)",
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
  { tier: 3, en: "(leans full weight against your leg, sighs)", zh: "(整個身體靠上你的腿,嘆了口氣)" },
  { tier: 4, en: "(waited by the door. all night, probably.)", zh: "(在門口等,大概等了一整晚)" },
  { tier: 4, en: "woof. (softer this time)", zh: "汪。(這次比較輕)" },
  { tier: 2, en: "(brings you a stick. the same stick. every time.)", zh: "(叼來一根樹枝,每次都是同一根)" },
  {
    when: (c) => c.weather === "rain",
    en: "(refuses to go out. changes mind immediately.)",
    zh: "(不肯出門,馬上又反悔)",
  },
  {
    when: (c) => c.weather === "fog",
    en: "(barks at nothing. something was probably there.)",
    zh: "(對著空氣叫,那裡大概真的有東西)",
  },
  {
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
