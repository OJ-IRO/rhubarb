/**
 * Sample content for preview mode (#/preview/...). Hand-written in the house voice so the
 * UI can be judged without a daemon or a Bee. Never shown as real data: the banner says so.
 */
import type { Card, Deck, Evidence, FieldEvidence, Item, LadderLevel, Lesson, LessonBeat, Practice, Profile, Quiz, Skill } from "@waggle/core";
import type { SkillRow, Today, SkillDetail, LessonView } from "./api";

const now = Date.now();
const h = 3600_000;
const d = 24 * h;
const iso = (ago: number) => new Date(now - ago).toISOString();

export const profile: Profile = {
  name: "Jay",
  style: "story",
  sessionMinutes: 10,
  learningWindows: "weekday evenings after 8, Sunday mornings",
  goals: ["explain our infra to non-engineers", "negotiate better"],
  offLimits: ["family finances"],
  timezone: "America/Los_Angeles",
  onboardedAt: now - 6 * d,
};

const mk = (id: number, name: string, priority: number, status: Skill["status"], brief: string, level = 0, domain: string | null = null): Skill => ({
  id,
  name,
  domain,
  competentLooksLike: "",
  terms: "[]",
  status,
  priority,
  brief,
  level,
  createdAt: now - 5 * d,
  updatedAt: now - h,
});

export const skills: Skill[] = [
  mk(
    1,
    "Kubernetes rolling deployments",
    92,
    "active",
    "Kubernetes came up three times this week, twice in the platform team's standup and once when Maya walked you through Tuesday's rollout. Both times you nodded along and told me later you'd look it up. You have a sync with that team on Thursday. Twenty minutes before then would change how that meeting goes.",
    1,
    "Infrastructure"
  ),
  mk(
    2,
    "Salary negotiation",
    84,
    "proposed",
    "On Monday you told Priya you'd \"probably just take whatever they offer\" and laughed, and on Wednesday you said the same thing to your brother without the laugh. The offer conversation is next week. This is the highest-stakes twenty minutes on your calendar, and it is learnable.",
    0,
    "Career"
  ),
  mk(
    3,
    "Reading a term sheet",
    71,
    "proposed",
    "You asked what a liquidation preference was on Tuesday and got an answer you described afterward as \"a lot of words.\" You mentioned advising your friend's startup twice this month. You don't need to be a lawyer; you need to know the four terms that decide who gets paid.",
    0,
    "Finance"
  ),
  mk(
    4,
    "Conversational Japanese",
    58,
    "active",
    "Your Tokyo trip is in five weeks. You've said \"I really should learn some Japanese before we go\" to three different people, which is how I know you mean it. Ordering food and asking directions is a small, achievable target.",
    0,
    "Language"
  ),
  mk(
    5,
    "Explaining our pricing model",
    46,
    "proposed",
    "Twice in customer calls this week you handed the pricing question to someone else. Nobody minded, but you noticed. It's a ten-minute story once you've told it a few times.",
    0,
    "Work"
  ),
  mk(
    6,
    "How honeybees make honey",
    22,
    "mastered",
    "You wondered about this on a walk, got the short version, and then explained it to Sam on Saturday better than the card did.",
    3,
    "Curiosity"
  ),
  mk(
    7,
    "Sourdough starter maintenance",
    15,
    "proposed",
    "You've mentioned your starter dying twice. Low stakes, but it clearly bothers you.",
    0,
    "Home"
  ),
];

export const skillRows: SkillRow[] = skills.map((s) => ({
  ...s,
  evidenceCount: [7, 4, 3, 6, 2, 1, 2][s.id - 1],
  ladderLength: [4, 4, 3, 5, 3, 3, 3][s.id - 1],
  lessonReady: s.status === "active",
  lessonId: s.status === "active" ? 1 : null,
}));

export const ladder: LadderLevel[] = [
  { id: 1, skillId: 1, idx: 0, title: "Follow the conversation", outcome: "can say what a rolling deployment is and why it's the default", status: "done" },
  { id: 2, skillId: 1, idx: 1, title: "Explain what's happening", outcome: "can narrate a rollout pod by pod, including readiness checks and what stops a bad one", status: "current" },
  { id: 3, skillId: 1, idx: 2, title: "Make the trade-offs", outcome: "can choose surge and unavailability settings for a given service and defend the choice", status: "locked" },
  { id: 4, skillId: 1, idx: 3, title: "Teach it", outcome: "can explain rolling vs blue-green vs canary to a new engineer in five minutes", status: "locked" },
];

export const deck: Deck = {
  title: "What Maya meant by \"halfway through the pods\"",
  subtitle: "Rolling deployments, level two: narrating a rollout",
  minutes: 10,
  slides: [
    {
      kind: "cover",
      title: "What Maya meant by \"halfway through the pods\"",
      subtitle: "Rolling deployments, level two",
      hook: "On Tuesday the rollout stalled for four minutes and nobody panicked. By the end of this you'll know exactly why they didn't.",
    },
    {
      kind: "example",
      heading: "The moment",
      quote: "We're halfway through the pods, the new ones are passing readiness, should be done in a couple minutes.",
      when: "Tuesday, 2:14 pm",
      who: "Maya",
      explanation:
        "Three things are packed into that sentence: the cluster replaces containers a few at a time, each new one has to prove it's healthy before it gets traffic, and the whole thing has a predictable pace. That is a rolling deployment, and it's the default in Kubernetes for a reason.",
    },
    {
      kind: "text",
      heading: "A few at a time, never all at once",
      body: "When you ship a new version, Kubernetes doesn't turn the old one off and the new one on. It starts one or two new pods, waits for them to report ready, then retires one or two old ones, and repeats until the whole set has turned over. The service never has zero pods, which is why users don't notice.\n\nThe pace is set by two numbers you'll see on Thursday: how many extra pods it's allowed to start above the target (surge), and how many it's allowed to have missing below it (unavailable).",
      aside: "Maya's \"halfway\" was literal: five of ten pods had turned over.",
    },
    {
      kind: "diagram",
      heading: "One turn of the loop",
      mermaid:
        "flowchart LR\n  A[Start a new pod] --> B{Passes readiness?}\n  B -- yes --> C[Send it traffic]\n  C --> D[Retire one old pod]\n  D --> E{All pods new?}\n  E -- no --> A\n  E -- yes --> F[Rollout complete]\n  B -- no, keeps failing --> G[Rollout stalls]",
      caption: "The readiness check is the gate. Nothing gets traffic until it passes, and a version that never passes simply never finishes rolling out.",
    },
    {
      kind: "keyidea",
      statement: "The readiness check is the whole safety story.",
      why: "Without it, Kubernetes would route real users to a container that hasn't finished starting. With it, a broken version can't spread past the first pod. That four-minute stall on Tuesday was the gate doing its job while a pod warmed up.",
    },
    {
      kind: "image",
      heading: "What the dashboard shows mid-rollout",
      query: "kubernetes pods networking diagram",
      url: "https://upload.wikimedia.org/wikipedia/commons/6/63/Pod-networking.png",
      alt: "Diagram of Kubernetes pods and their networking inside a node",
      caption: "Pods are the unit that gets replaced during a rollout. In the real console you'll see two ReplicaSets side by side: the old one shrinking, the new one growing. When the old one hits zero, the rollout is done.",
      credit: "Wikimedia Commons, Pod-networking",
    },
    {
      kind: "steps",
      heading: "How to narrate one on Thursday",
      steps: [
        { title: "Name the two sets", body: "\"Old ReplicaSet at six, new at four, so we're about halfway.\"" },
        { title: "Point at readiness", body: "\"New pods are passing readiness, so they're taking traffic.\"" },
        { title: "Say what would stop it", body: "\"If a new pod kept failing readiness, this would stall rather than break anything.\"" },
      ],
    },
    {
      kind: "compare",
      heading: "Rolling vs the two alternatives you'll hear about",
      columns: [
        { title: "Rolling", points: ["Gradual, a few pods at a time", "Old and new run together briefly", "Cheap: no spare capacity needed"] },
        { title: "Blue-green", points: ["Whole new copy stood up beside the old", "Traffic flips all at once", "Instant rollback, double the cost"] },
        { title: "Canary", points: ["A slice of users gets the new version first", "Watch metrics, then widen", "Best for risky changes, needs routing rules"] },
      ],
    },
    {
      kind: "learnmore",
      links: [
        { title: "Kubernetes docs: Performing a Rolling Update", url: "https://kubernetes.io/docs/tutorials/kubernetes-basics/update/update-intro/", why: "The official walkthrough with the exact commands." },
        { title: "Kubernetes docs: Deployments", url: "https://kubernetes.io/docs/concepts/workloads/controllers/deployment/", why: "Where maxSurge and maxUnavailable are actually defined." },
      ],
    },
  ],
};

export const quiz: Quiz = {
  questions: [
    {
      kind: "mcq",
      prompt: "Midway through a rolling deployment, how many versions of the service are running?",
      choices: ["Only the old one", "Only the new one", "Both, side by side", "None, there's a brief gap"],
      answer: 2,
      explanation: "Old and new pods overlap until the last old one is retired. That overlap is why users never see downtime.",
    },
    {
      kind: "mcq",
      prompt: "A new pod keeps failing its readiness check. What happens to the rollout?",
      choices: ["It completes anyway", "It stalls and stops sending traffic to that pod", "It rolls back automatically", "It restarts from scratch"],
      answer: 1,
      explanation: "The gate holds. Kubernetes won't route traffic to an unready pod and won't retire more old pods while it waits.",
    },
    {
      kind: "mcq",
      prompt: "Which setting controls how many extra pods can exist above the target during a rollout?",
      choices: ["maxUnavailable", "maxSurge", "replicas", "readinessProbe"],
      answer: 1,
      explanation: "maxSurge is the headroom above target; maxUnavailable is how far below target it may dip.",
    },
    {
      kind: "short",
      prompt: "In two sentences, explain why Tuesday's four-minute stall wasn't a problem.",
      rubric: "Mentions that a new pod hadn't passed readiness yet, that traffic was still served by healthy pods, and that a stall is the safe failure mode rather than a broken deploy.",
    },
    {
      kind: "mcq",
      prompt: "Which strategy gives you instant rollback at the cost of running two full copies?",
      choices: ["Rolling", "Blue-green", "Canary", "Recreate"],
      answer: 1,
      explanation: "Blue-green keeps the old copy alive until you're sure, so flipping back is a routing change.",
    },
  ],
};

export const beats: LessonBeat[] = [
  { kind: "checkin", prompt: "What's the one thing a new pod has to do before it gets any traffic?", rubric: "pass its readiness check" },
  { kind: "scenario", prompt: "It's Thursday. Someone says the rollout has been at 7 of 10 for six minutes. What do you look at first, and what do you say?", rubric: "check readiness of the new pods; explain that the gate is holding and no users are affected; ask what the failing pod is logging" },
  { kind: "teachback", prompt: "Explain a rolling deployment out loud the way you'd explain it to Maya.", rubric: "a few at a time; readiness gate; old and new overlap; stall not break" },
  { kind: "mission", prompt: "In Thursday's sync, narrate the state of any rollout that's mentioned using the three sentences from the steps card.", rubric: "used the vocabulary correctly in a real conversation" },
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
  citations: JSON.stringify(deck.slides.find((s) => s.kind === "learnmore")!.kind === "learnmore" ? (deck.slides.find((s) => s.kind === "learnmore") as { links: Array<{ title: string; url: string }> }).links.map((l) => ({ title: l.title, url: l.url })) : []),
  status: "ready",
  createdAt: now - 2 * h,
  completedAt: null,
};

export const evidence: Evidence[] = [
  { id: 1, kind: "struggle", text: "Wait, what does halfway through the pods actually mean?", context: null, spokenAt: iso(3 * d), utteranceId: 1, conversationUuid: "c1", speakerLabel: "you", place: "Office, 4th floor", source: "stream", stage: "classified", route: "skill", topic: "rolling deployments", confidence: 0.9, skillId: 1, createdAt: now },
  { id: 2, kind: "intent", text: "I really need to actually understand how our deploys work before Thursday.", context: null, spokenAt: iso(2 * d), utteranceId: 2, conversationUuid: "c2", speakerLabel: "you", place: "Home", source: "stream", stage: "classified", route: "skill", topic: "kubernetes", confidence: 0.95, skillId: 1, createdAt: now },
  { id: 3, kind: "gap", text: "I think rolling deploys are basically the same as blue-green? Something like that.", context: null, spokenAt: iso(1 * d), utteranceId: 3, conversationUuid: "c3", speakerLabel: "you", place: "Cafe on 3rd", source: "stream", stage: "classified", route: "skill", topic: "deployment strategies", confidence: 0.85, skillId: 1, createdAt: now },
];

export const practice: Practice[] = [
  { id: 1, skillId: 1, lessonId: 1, cardId: null, kind: "teachback", prompt: "Explain what a rolling deployment is, out loud.", rubric: null, beeTodoId: 1, marker: "w1a2b", status: "graded", scheduledFor: now - 1 * d, journalId: "j1", answerText: "So it swaps the pods a few at a time instead of all at once, and each new one has to be ready before it gets traffic, so there's never a moment with nothing running.", grade: JSON.stringify({ score: 4, feedback: "You had the core right: a few at a time, readiness first, no gap. What you skipped is what happens when a pod never becomes ready. Say \"it stalls instead of breaking\" and you've got the whole picture.", missing: ["stall behaviour"] }), createdAt: now - 1 * d },
];

export const fieldEvidence: FieldEvidence[] = [
  { id: 1, skillId: 1, utteranceId: 9, text: "It's fine, the new pods just haven't passed readiness yet, nobody's getting routed to them.", context: null, spokenAt: iso(5 * h), verdict: JSON.stringify({ used: true, correct: true, level: 1, note: "That's the readiness gate explained correctly, unprompted, to someone who was worried. Level two is yours." }), credited: true, createdAt: now },
];

export const cards: Array<{ card: Card; item: Item }> = [
  {
    card: { id: 1, itemId: 1, title: "How honeybees turn nectar into honey", answerMd: "Honey starts as nectar, which is mostly water and sucrose, and the bee's job is to strip out the water and split the sugar. A forager carries it home in a second stomach where an enzyme starts breaking sucrose into glucose and fructose, then house bees pass it around and fan it until the water drops from about seventy percent to under twenty. That dryness is the whole trick: nothing can grow in it, which is why sealed jars keep for years. The number worth keeping is the exchange rate, about two million flower visits for one pound.", citations: "[]", createdAt: now - 4 * d },
    item: { id: 1, kind: "question", sourceText: "I wonder how honeybees actually make honey.", topic: "how honeybees make honey", status: "researched", confidence: 0.8, utteranceId: 5, conversationUuid: "c5", spokenAt: iso(4 * d), createdAt: now - 4 * d, place: "Golden Gate Park", speakerLabel: "you" },
  },
  {
    card: { id: 2, itemId: 2, title: "Why airplane windows are round", answerMd: "Square windows concentrate stress at their corners, and on a pressurised fuselage that flexes every flight, those corners are where cracks start. Two de Havilland Comets broke apart in 1954 for roughly this reason, and the investigation changed the rules. Rounded corners spread the load around the opening instead of focusing it on a point. The detail worth keeping: it isn't about aerodynamics at all, it's about metal fatigue.", citations: "[]", createdAt: now - 2 * d },
    item: { id: 2, kind: "question", sourceText: "Man, I wonder why airplane windows are always round.", topic: "why airplane windows are round", status: "researched", confidence: 0.8, utteranceId: 6, conversationUuid: "c6", spokenAt: iso(2 * d), createdAt: now - 2 * d, place: "SFO", speakerLabel: "you" },
  },
];

export const today: Today = {
  profile,
  letter:
    "Jay, your week has mostly been about Thursday. Kubernetes came up again yesterday, and you handled the readiness question with Sam better than you think, so level two is closer than the board suggests. The salary conversation is the other thing on your mind; you've mentioned it three times and decided nothing, which is exactly when a plan helps. Today: ten minutes on the rolling deployment lesson, then leave the rest.",
  letterDate: new Date().toDateString(),
  lesson: { lesson, skill: skills[0] },
  duePractice: [],
  dueCards: [{ cardId: 1, dueAt: now - h, card: cards[0].card }],
  proposed: 4,
  active: 2,
  sparks: cards,
};

export const skillDetail: SkillDetail = { skill: skills[0], ladder, evidence, lessons: [lesson], practice, fieldEvidence };

export const lessonView: LessonView = { lesson, skill: skills[0], ladder, session: null };
