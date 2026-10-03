/**
 * Sample content for the judges' demo (#/preview/...): one visitor's weeks learning Japanese in
 * Osaka and Fukuoka, the story Rhubarb was built around. Hand-written in the house voice, every
 * fact checked, every link and photo real. Never shown as anyone's data: the banner says so.
 */
import { localDay, type PrivacyView } from "./api";
import type { HistoryEntry, LearningProgress } from "@rhubarb/core";
import type { Card, Deck, Evidence, FieldEvidence, Item, LadderLevel, Lesson, LessonBeat, Practice, Profile, Quiz, Skill } from "@rhubarb/core";
import type { SkillRow, Today, SkillDetail, LessonView } from "./api";

const now = Date.now();
const h = 3600_000;
const d = 24 * h;
const iso = (ago: number) => new Date(now - ago).toISOString();

export const profile: Profile = {
  name: "Riley",
  style: "story",
  sessionMinutes: 10,
  learningWindows: "evenings after dinner",
  goals: ["conversational Japanese for daily life in Japan"],
  offLimits: ["family finances"],
  timezone: "Asia/Tokyo",
  onboardedAt: now - 9 * d,
};

const mk = (id: number, name: string, priority: number, status: Skill["status"], brief: string, level = 0, domain: string | null = "Japanese", kind: Skill["kind"] = "skill", origin: Skill["origin"] = "noticed"): Skill => ({
  id,
  name,
  domain,
  competentLooksLike: "",
  terms: "[]",
  status,
  priority,
  brief,
  level,
  kind,
  origin,
  familiarity: null,
  reading: null,
  createdAt: now - 5 * d,
  updatedAt: now - h,
});

export const skills: Skill[] = [
  mk(
    1,
    "Tax-free shopping in Japanese",
    92,
    "active",
    "On Thursday at a shop counter in Namba you got the whole request out in Japanese, then lost the thread when the clerk sent you to 1階(いっかい)の免税(めんぜい)カウンター. You confirmed that in your day review. The opening is already yours; following where they send you is the next ten minutes.",
    1
  ),
  mk(
    2,
    "Phone calls with delivery drivers",
    84,
    "active",
    "Twice this week a driver called about an order and asked where you were. You got your name out fine both times, then lost the call when he asked for a landmark near your building. Saying where you are, 〜の前(まえ) and 〜の隣(となり), is a short list to learn.",
    0
  ),
  mk(
    3,
    "Understanding station announcements",
    71,
    "proposed",
    "On the platform at Hakata you heard 「博多行(はかたゆ)きが到着(とうちゃく)いたします」 and asked what 到着(とうちゃく) meant. Station announcements are a small, fixed set of phrases on repeat, so this is one of the quickest wins on the board."
  ),
  mk(
    4,
    "Checking things with 〜んですけど",
    63,
    "proposed",
    "You started three requests this week with 〜んですけど, which is exactly how people soften a question, and each time the sentence trailed off before the question itself. Finishing the sentence is the whole skill."
  ),
  mk(
    5,
    "Asking for something when you don't know the word",
    58,
    "proposed",
    "In a shop on Thursday you asked for a cloth to polish silver without knowing the word, and got there by describing it. That works. A few set phrases for \"something like…\" make it work every time."
  ),
  mk(
    6,
    "The history of the Ferris wheel, from Chicago to Osaka",
    40,
    "mastered",
    "You asked for this out loud while riding the Tempozan wheel in Osaka. One lesson: where the Ferris wheel came from, and why the one you were on changes colour at night.",
    1,
    "History",
    "topic",
    "asked"
  ),
  mk(
    7,
    "Ordering at a konbini",
    46,
    "proposed",
    "At a konbini the clerk asked 「温(あたた)めますか」 and you said yes before you were sure what you'd agreed to. The register asks the same four questions every time: heat it, a bag, chopsticks, how to pay.",
    0,
    "Japanese",
    "topic"
  ),
];

export const skillRows: SkillRow[] = skills.map((s) => ({
  ...s,
  evidenceCount: [7, 4, 6, 3, 2, 1, 2][s.id - 1],
  ladderLength: [4, 4, 3, 3, 3, 1, 1][s.id - 1],
  lessonReady: s.status === "active",
  lessonId: s.status === "active" ? 1 : null,
}));

export const ladder: LadderLevel[] = [
  { id: 1, skillId: 1, idx: 0, title: "Open the request", outcome: "can say you'd like to buy tax-free as a visitor", status: "done" },
  { id: 2, skillId: 1, idx: 1, title: "Follow where they send you", outcome: "can follow a clerk's directions to the tax-free counter and know what to bring", status: "current" },
  { id: 3, skillId: 1, idx: 2, title: "Get through the counter", outcome: "can answer the counter's questions and confirm the total", status: "locked" },
  { id: 4, skillId: 1, idx: 3, title: "Sort out a problem", outcome: "can say politely that something is wrong and ask again", status: "locked" },
];

const TAX_FREE_PHOTO = "https://upload.wikimedia.org/wikipedia/commons/thumb/7/71/Tax_Free_Shop_Miyabi_in_Kansai_Airport%2C_Osaka.jpg/1280px-Tax_Free_Shop_Miyabi_in_Kansai_Airport%2C_Osaka.jpg";

export const deck: Deck = {
  title: "Where the clerk sent you: 1階(いっかい)の免税(めんぜい)カウンター",
  subtitle: "Tax-free shopping, level two: following where they send you",
  minutes: 10,
  slides: [
    {
      kind: "cover",
      title: "Where the clerk sent you",
      subtitle: "Tax-free shopping, level two",
      hook: "On Thursday you asked perfectly and then the answer went past you. It was eleven words, and by the end of this card set you'll hear every one of them.",
    },
    {
      kind: "example",
      heading: "The moment",
      quote: "1階の方の免税カウンターで聞いてみてください",
      when: "Thursday, 3:40 pm, Namba",
      who: "the clerk",
      explanation:
        "Four pieces: 1階(いっかい) is the first floor, の方(ほう) means over in that direction, 免税(めんぜい)カウンター is the tax-free counter, and 聞(き)いてみてください is please try asking. She wasn't saying no. She was saying: the register can't do it, the counter downstairs can.",
    },
    {
      kind: "text",
      heading: "Most shops don't do tax-free at the till",
      body: "In a big store, tax-free is handled at one desk, often on a single floor. So the usual answer to 免税(めんぜい)できますか isn't yes or no, it's directions. Expect a floor and a place, then 聞(き)いてみてください or お越(こ)しください, please come by.\n\nThat means the useful skill isn't more vocabulary for the request. It's hearing a floor number and a place name at speed.",
      aside: "The clerk's 〜の方(ほう) softens it: \"over toward the first floor\", not a command.",
    },
    {
      kind: "steps",
      heading: "Floors, the way you'll hear them",
      steps: [
        { title: "1階(いっかい)", body: "first floor, the street level" },
        { title: "2階(にかい)", body: "second floor" },
        { title: "3階(さんがい)", body: "third floor: がい, not かい" },
        { title: "地下(ちか)1階(いっかい)", body: "first basement, often written B1" },
      ],
    },
    {
      kind: "diagram",
      heading: "What happens after she sends you",
      mermaid:
        "flowchart LR\n  A[Ask at the register] --> B[Sent to the tax-free counter]\n  B --> C[Show your passport]\n  C --> D[Staff check the items]\n  D --> E[Pay the price without tax]\n  E --> F[Food and cosmetics sealed in a bag]",
      caption: "The passport is the one thing you can't do without. Bring the physical one; a photo of it won't do.",
    },
    {
      kind: "keyidea",
      statement: "〜で聞(き)いてみてください means \"go and ask at…\", not \"ask me\".",
      why: "Once you hear 聞いてみてください as directions, the sentence before it becomes the answer you were waiting for: a floor and a place.",
    },
    {
      kind: "image",
      heading: "What to look for",
      query: "tax free shop Japan",
      url: TAX_FREE_PHOTO,
      alt: "A tax-free shop counter at Kansai International Airport in Osaka",
      caption: "Shops that offer it put up a TAX FREE sign, like this one at Kansai Airport. In a department store, the tax-free counter is usually signposted from the escalators.",
      credit: "Wikimedia Commons, Tax Free Shop Miyabi in Kansai Airport, Osaka",
    },
    {
      kind: "compare",
      heading: "Three things you'll hear at the counter",
      columns: [
        { title: "パスポートお願(ねが)いします", points: ["Your passport, please", "Hand over the physical passport"] },
        { title: "日本(にほん)で開(あ)けないでください", points: ["Don't open it in Japan", "Said about the sealed bag of food or cosmetics"] },
        { title: "こちらにサインお願(ねが)いします", points: ["Please sign here", "Some stores use a screen instead of paper"] },
      ],
    },
    {
      kind: "learnmore",
      links: [{ title: "Japan Tax-free Shop (Japan National Tourism Organization)", url: "https://tax-freeshop.jnto.go.jp/eng/index.php", why: "The official rules and a search for stores that offer it." }],
    },
  ],
};

export const quiz: Quiz = {
  questions: [
    {
      kind: "mcq",
      prompt: "The clerk says 「1階(いっかい)の方(ほう)の免税(めんぜい)カウンターで聞(き)いてみてください」. What does she want you to do?",
      choices: ["Ask her again more slowly", "Go and ask at the tax-free counter on the first floor", "Come back on another day", "Pay at the register first"],
      answer: 1,
      explanation: "で聞いてみてください is \"try asking at…\": she's sending you to the counter, not refusing.",
    },
    {
      kind: "mcq",
      prompt: "How is 3階 read?",
      choices: ["さんかい", "さんがい", "みっかい", "さんばん"],
      answer: 1,
      explanation: "3階 is さんがい: the か softens to が after ん.",
    },
    {
      kind: "mcq",
      prompt: "What do you need to show at the tax-free counter?",
      choices: ["A photo of your passport", "Your physical passport", "Your hotel booking", "Your plane ticket"],
      answer: 1,
      explanation: "The counter needs the passport itself; a photo of it isn't accepted.",
    },
    {
      kind: "short",
      prompt: "In a sentence: what does 〜の方(ほう) add to 「1階の方」?",
      rubric: "It means toward or over in the direction of the first floor; it softens the direction.",
    },
    {
      kind: "mcq",
      prompt: "At the counter they say 「日本(にほん)で開(あ)けないでください」 about your sealed bag. What does it mean?",
      choices: ["Please open it now", "Don't open it while you're in Japan", "It can't be returned", "Keep the receipt in the bag"],
      answer: 1,
      explanation: "Tax-free food and cosmetics are sealed, and opening them before you leave Japan can cost you the tax back.",
    },
  ],
};

export const beats: LessonBeat[] = [
  { kind: "checkin", prompt: "What does 聞(き)いてみてください tell you to do?", rubric: "go and try asking somewhere" },
  { kind: "scenario", prompt: "The clerk says 「地下(ちか)1階(いっかい)の免税(めんぜい)カウンターへどうぞ」. Where do you go, and what do you get out first?", rubric: "the tax-free counter on the first basement floor; take out the physical passport" },
  { kind: "teachback", prompt: "Out loud, in Japanese: ask to buy tax-free, then repeat back where she sends you.", rubric: "免税できますか or 免税お願いします; repeats a floor and カウンター back" },
  { kind: "mission", prompt: "At the next shop, ask 「免税(めんぜい)できますか」 and follow wherever they send you.", rubric: "asked and followed the directions in a real shop" },
];

export const lesson: Lesson = {
  id: 1,
  skillId: 1,
  levelIdx: 1,
  style: "story",
  bodyMd: deck.slides
    .map((s) => ("body" in s ? s.body : "explanation" in s ? s.explanation : "why" in s ? s.why : ""))
    .filter(Boolean)
    .join("\n\n"),
  deck: JSON.stringify(deck),
  quiz: JSON.stringify(quiz),
  beats: JSON.stringify(beats),
  citations: JSON.stringify([{ title: "Japan Tax-free Shop (Japan National Tourism Organization)", url: "https://tax-freeshop.jnto.go.jp/eng/index.php" }]),
  status: "ready",
  createdAt: now - 2 * h,
  completedAt: null,
  review: JSON.stringify({
    checkedAt: now - 2 * d,
    inventedQuotes: [],
    checks: [
      { id: "own-words", ok: true, detail: "Every quote from your week matches something Rhubarb actually heard." },
      { id: "uses-a-moment", ok: true, detail: "It teaches from a moment in your own week." },
      { id: "length", ok: true, detail: "9 cards. A lesson should be 6 to 14." },
      { id: "one-idea-a-card", ok: true, detail: "No card tries to carry more than one idea's worth of text." },
      { id: "quiz", ok: true, detail: "5 questions, each with one answer that can be marked." },
      { id: "sources", ok: true, detail: "1 further-reading link, a real address." },
      { id: "diagram", ok: true, detail: "The diagram is small enough to read at a glance." },
      { id: "accurate", ok: true, detail: "The facts hold up, including that a photo of a passport isn't accepted at the counter." },
      { id: "right-level", ok: true, detail: "It stays on following where you're sent, which is level two, and leaves the counter's own questions for level three." },
    ],
  }),
};

export const evidence: Evidence[] = [
  {
    id: 1, kind: "exposure", text: "えっと、タックスフリーで買いたいんですけど、アメリカ人なのでどうやってやる感じですか",
    context: "you: えっと、タックスフリーで買いたいんですけど、アメリカ人なのでどうやってやる感じですか\nsomeone: 1階の方の免税カウンターで聞いてみてください\nsomeone: パスポートがあれば大丈夫ですね",
    editedAt: null, spokenAt: iso(3 * d), utteranceId: 1, conversationUuid: "c1", speakerLabel: "you", place: "Namba, Osaka", source: "stream", stage: "classified", route: "skill", topic: "tax-free shopping", confidence: 0.9, skillId: 1, createdAt: now,
  },
  {
    id: 2, kind: "struggle", text: "Wait, where did she say to go? Something about the first floor?",
    context: "someone: 1階の方の免税カウンターで聞いてみてください\nyou: Wait, where did she say to go? Something about the first floor?",
    editedAt: null, spokenAt: iso(3 * d), utteranceId: 2, conversationUuid: "c1", speakerLabel: "you", place: "Namba, Osaka", source: "stream", stage: "classified", route: "skill", topic: "tax-free directions", confidence: 0.95, skillId: 1, createdAt: now,
  },
  {
    id: 3, kind: "gap", text: "I think tax-free only works if you spend like ten thousand yen.",
    context: "someone: Is it worth asking for tax-free?\nyou: I think tax-free only works if you spend like ten thousand yen.",
    editedAt: null, spokenAt: iso(2 * d), utteranceId: 3, conversationUuid: "c3", speakerLabel: "you", place: "Umeda, Osaka", source: "stream", stage: "classified", route: "skill", topic: "tax-free rules", confidence: 0.85, skillId: 1, createdAt: now,
  },
  {
    id: 4, kind: "struggle", text: "What does 到着 mean? The announcement keeps saying it.",
    context: "someone: 博多行きが到着いたします\nyou: What does 到着 mean? The announcement keeps saying it.",
    editedAt: null, spokenAt: iso(1 * d), utteranceId: 4, conversationUuid: "c4", speakerLabel: "you", place: "Hakata, Fukuoka", source: "stream", stage: "classified", route: "skill", topic: "station announcements", confidence: 0.9, skillId: 3, createdAt: now,
  },
  {
    id: 5, kind: "struggle", text: "I just said yes, I think she asked if I wanted it heated?",
    context: "someone: 温めますか\nyou: はい\nyou: I just said yes, I think she asked if I wanted it heated?",
    editedAt: null, spokenAt: iso(1 * d), utteranceId: 5, conversationUuid: "c5", speakerLabel: "you", place: "Hakata, Fukuoka", source: "stream", stage: "classified", route: "skill", topic: "konbini register", confidence: 0.85, skillId: 7, createdAt: now,
  },
];

export const practice: Practice[] = [
  { id: 1, skillId: 1, lessonId: 1, cardId: null, kind: "teachback", prompt: "Out loud, in Japanese: ask to buy tax-free.", rubric: null, beeTodoId: 1, marker: "w1a2b", status: "graded", scheduledFor: now - 1 * d, journalId: "j1", answerText: "すみません、免税できますか。パスポートあります。", grade: JSON.stringify({ score: 4, feedback: "Clear and polite, and mentioning the passport up front saves a step. The one thing to add is listening for where they send you: a floor, then カウンター.", missing: ["following the directions"] }), createdAt: now - 1 * d },
];

export const fieldEvidence: FieldEvidence[] = [
  { id: 1, skillId: 1, utteranceId: 9, text: "すみません、免税カウンターは何階ですか", context: null, spokenAt: iso(5 * h), verdict: JSON.stringify({ used: true, correct: true, level: 1, note: "You asked which floor the tax-free counter was on, in Japanese, before anyone sent you there. That's level one done for real." }), credited: true, createdAt: now },
];

export const cards: Array<{ card: Card; item: Item }> = [
  {
    card: { id: 1, itemId: 1, title: "Why does the Tempozan Ferris wheel change colour at night?", answerMd: "Its lights are a weather forecast for the next day. Orange means sunny, green means cloudy and blue means rain, so a glance across Osaka Bay tells you whether to pack an umbrella tomorrow. The wheel opened in 1997 at 112.5 metres, among the biggest in the world at the time, and the forecast lighting is what locals still point at.", citations: "[]", createdAt: now - 4 * d, guess: "Something to do with the seasons?", guessClose: false, guessNote: "Not the seasons: it's tomorrow's weather. Orange for sun, green for cloud, blue for rain." },
    item: { id: 1, kind: "question", sourceText: "Why does the wheel keep changing colour like that?", topic: "Tempozan Ferris wheel lights", status: "researched", confidence: 0.8, utteranceId: 6, conversationUuid: "c6", spokenAt: iso(4 * d), createdAt: now - 4 * d, place: "Minato, Osaka", speakerLabel: "you" },
  },
  {
    card: { id: 2, itemId: 2, title: "Why do Japanese train stations play little tunes?", answerMd: "They're departure melodies, 発車(はっしゃ)メロディ, and they replaced the harsh bells that used to signal doors closing. A short tune tells you the train is about to leave without startling anyone, and many stations pick a song with a local story, so regulars know where they are with their eyes shut. The detail worth keeping: if you hear the melody start, don't run for the doors, the next train is minutes away.", citations: "[]", createdAt: now - 2 * d, guess: null, guessClose: null, guessNote: null },
    item: { id: 2, kind: "question", sourceText: "Why does every station play a different little song?", topic: "station departure melodies", status: "researched", confidence: 0.8, utteranceId: 7, conversationUuid: "c7", spokenAt: iso(2 * d), createdAt: now - 2 * d, place: "Hakata, Fukuoka", speakerLabel: "you" },
  },
];

export const today: Today = {
  profile,
  letter:
    "At the tax-free counter on Thursday you got the request out in Japanese, then lost the thread when the clerk sent you to 1階(いっかい)の免税(めんぜい)カウンター. You confirmed that, and it's exactly level two of the tax-free plan: ten minutes, and the next shop will go differently. The station announcements from Hakata are waiting for a yes on the board; it's the same handful of phrases on repeat, so it's a quick win.",
  letterDate: new Date().toDateString(),
  lesson: { lesson, skill: skills[0], ladderLength: ladder.length },
  duePractice: [],
  dueCards: [{ cardId: 1, dueAt: now - h, card: cards[0].card }],
  proposed: 4,
  active: 2,
  sparks: cards,
  upcoming: [
    { id: 9, skillId: 1, lessonId: 1, cardId: null, kind: "mission", prompt: "At the next shop, ask 「免税(めんぜい)できますか」 and follow wherever they send you.", rubric: null, beeTodoId: 9, marker: "m9", status: "scheduled", scheduledFor: now + 26 * h, journalId: null, answerText: null, grade: null, createdAt: now - h },
    { id: 10, skillId: null, lessonId: null, cardId: 1, kind: "recall", prompt: "What do the Tempozan wheel's colours mean?", rubric: null, beeTodoId: 10, marker: "m10", status: "scheduled", scheduledFor: now + 3 * d, journalId: null, answerText: null, grade: null, createdAt: now - 2 * h },
  ],
  nextSlot: new Date(now + 6 * h).toISOString(),
};

export const skillDetail: SkillDetail = { skill: skills[0], ladder, evidence, lessons: [lesson], practice, fieldEvidence };

export const lessonView: LessonView = { lesson, skill: skills[0], ladder, session: null };

const momentDays = [...new Set(evidence.map((e) => localDay(e.spokenAt)))].sort().reverse();
export const privacy: PrivacyView = {
  summary: { utterances: 1284, moments: 23, voiceNotes: 6, skills: skills.length, lessons: 3, since: new Date(now - 9 * d).toISOString() },
  days: momentDays.map((day, i) => ({ day, utterances: [212, 164, 97][i] ?? 80, moments: evidence.filter((e) => localDay(e.spokenAt) === day).length })),
  moments: [...evidence].sort((a, b) => b.spokenAt.localeCompare(a.spokenAt)),
};

const wk = (weeksAgo: number) => {
  const m = new Date(now - weeksAgo * 7 * d);
  m.setHours(0, 0, 0, 0);
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  return localDay(m.getTime());
};
export const progress: LearningProgress = {
  teachbacks: [2, 2, 3, 3, 2, 4, 3, 4, 4, 5].map((score, i) => ({ at: now - (27 - i * 3) * d, score, skillId: i % 3 === 2 ? 4 : 1 })),
  quizzes: [0.4, 0.6, 0.8, 0.8].map((score, i) => ({ at: now - (24 - i * 7) * d, score, skillId: 1 })),
  recall: { asked: 14, remembered: 11 },
  guesses: { made: 9, close: 4, skipped: 2 },
  field: { heard: 17, credited: 6, byWeek: [{ weekStart: wk(3), credited: 0 }, { weekStart: wk(2), credited: 1 }, { weekStart: wk(1), credited: 2 }, { weekStart: wk(0), credited: 3 }] },
  levels: { passed: 3, mastered: 1, active: 2 },
  transfer: [{ skillId: 1, days: 9 }, { skillId: 5, days: 4 }],
  lessons: { written: 5, finished: 3, reviewed: 5, passedEveryCheck: 4 },
};

export const history: HistoryEntry[] = [
  { at: now - 5 * h, kind: "credit", title: "Used it for real: Tax-free shopping in Japanese", detail: "You asked which floor the tax-free counter was on, in Japanese, before anyone sent you there.", skillId: 1, lessonId: null, score: null },
  { at: now - 1 * d, kind: "answer", title: "Said it out loud: Tax-free shopping in Japanese", detail: "4 of 5. Clear and polite. Next: listen for the floor and カウンター in the answer.", skillId: 1, lessonId: 1, score: 4 },
  { at: now - 1 * d - 2 * h, kind: "lesson", title: "Finished a lesson: The history of the Ferris wheel, from Chicago to Osaka", detail: "The one you asked for on the Tempozan wheel.", skillId: 6, lessonId: null, score: null },
  { at: now - 2 * d, kind: "spark", title: "Wondered: Why do Japanese train stations play little tunes?", detail: "Answered on the Sparks page.", skillId: null, lessonId: null, score: null },
  { at: now - 3 * d, kind: "answer", title: "Took the check: Tax-free shopping in Japanese", detail: "4 of 5", skillId: 1, lessonId: 1, score: 0.8 },
  { at: now - 4 * d, kind: "spark", title: "Wondered: Why does the Tempozan Ferris wheel change colour at night?", detail: "Answered on the Sparks page.", skillId: null, lessonId: null, score: null },
  { at: now - 6 * d, kind: "answer", title: "Said it out loud: Phone calls with delivery drivers", detail: "2 of 5. Your name came through clearly; the landmark didn't. 〜の前(まえ) after a place you can see is all it takes.", skillId: 2, lessonId: null, score: 2 },
];

/** A day review as the server writes one: claims to mark right or wrong, and a few questions. */
export function sampleReview(day: string): import("@rhubarb/core").DayReview {
  return {
    day,
    status: "open",
    createdAt: now - 10 * h,
    doneAt: null,
    findings: [
      { id: 1, claim: "On the platform at Hakata, an announcement said 「博多行(はかたゆ)きが到着(とうちゃく)いたします」 and you asked what 到着(とうちゃく) meant.", momentIds: [4], unsure: null, verdict: null, correction: null },
      { id: 2, claim: "At a konbini the clerk asked 「温(あたた)めますか」 and you said yes before you were sure what it meant.", momentIds: [5], unsure: "You may have understood it and just answered fast.", verdict: null, correction: null },
      { id: 3, claim: "You wondered out loud why every station plays a different little tune.", momentIds: [], unsure: null, verdict: null, correction: null },
    ],
    questions: [
      { id: 1, text: "Will you be taking trains most days, so the station announcements are worth learning?", answer: null },
      { id: 2, text: "At the konbini, is it the register questions you want, or ordering hot food?", answer: null },
    ],
  };
}
