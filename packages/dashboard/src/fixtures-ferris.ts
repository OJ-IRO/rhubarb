/**
 * The demo's one-lesson topic: the Ferris wheel lesson Rhubarb really wrote after its builder asked
 * for it out loud on the Tempozan wheel. Real cards, real sources, the real second-reader notes.
 */
import type { Deck, LessonBeat, Quiz } from "@rhubarb/core";

export const ferrisDeck: Deck = {
  title: "Why there's a wheel here at all",
  subtitle: "Chicago 1893 to Osaka, and the ride you were on Sunday",
  minutes: 10,
  slides: [
    {
      kind: "cover",
      title: "Why there's a wheel here at all",
      subtitle: "Chicago 1893 to Osaka, and the ride you were on Sunday",
      hook: "Japan's first Ferris wheel was turning in Osaka in the spring of 1906. That same May, the original was blown apart with dynamite outside St. Louis and sold for scrap.",
    },
    {
      kind: "text",
      heading: "It exists because of the Eiffel Tower",
      body: "Ferris wheels were built to win an argument with Paris. The 1889 Paris exposition had the Eiffel Tower, and when Chicago got the 1893 World's Columbian Exposition, its lead architect Daniel Burnham told American engineers he wanted something that would beat it. Matching the tower was pointless; Chicago needed a different trick.\n\nGeorge Washington Gale Ferris Jr., a bridge engineer from Pittsburgh, proposed a wheel 80 metres to the top that would carry passengers around in the air. People thought it was a stunt that would fall over. He paid for the safety studies himself.\n\nIt opened on 21 June 1893 and more than 1.4 million people paid fifty cents to ride it. That is the whole reason big wheels exist: a fair needed a centrepiece, and this one worked.",
    },
    {
      kind: "example",
      heading: "You asked from inside the thing",
      quote: "Hey Bee, I'm currently on the Osaka Ferris wheel.",
      when: "Sunday 27 September, just after three in the afternoon",
      who: "you, somewhere on the way up",
      explanation:
        "You were sitting in a direct descendant of a 133-year-old grudge match between two world's fairs. Even the shape of your ride comes from Chicago: Ferris sold two revolutions for one ticket, the first with stops so cars could load, the second a slow non-stop lap. Osaka's modern wheels run 15 to 18 minutes for the same reason, long enough to feel like an event and short enough to keep the queue moving.",
    },
    {
      kind: "text",
      heading: "A bicycle wheel the size of a building",
      body: "Ferris built it the way a bicycle wheel works. The rim does not sit on the spokes; it hangs from the hub on steel rods in tension, which is why the structure looks far too thin for its size. That instinct came from bridges, where you make things strong by pulling rather than stacking.\n\nEverything turned on one axle: 45.5 feet long, about 70 tons, the largest hollow forging in the world at the time, made in Pittsburgh and hauled to Chicago. Thirty-six cars hung off it, each rated for 60 people, 2,160 riders at once.\n\nThose cars were rooms, not benches. Forty swivel chairs apiece plus twenty standing at the glass, while the wheel took twenty minutes to go round twice.",
    },
    {
      kind: "image",
      heading: "The one that started it",
      query: "Ferris Wheel 1893 World's Columbian Exposition Chicago",
      alt: "The original Ferris Wheel towering over the Midway Plaisance at the 1893 Chicago world's fair",
      caption:
        "Each of the 36 cars held up to 60 people, so the wheel could have 2,160 riders aboard at once, more than the London Eye carries in an hour.",
      url: "https://upload.wikimedia.org/wikipedia/commons/6/6a/Original_Ferris.jpeg?utm_source=en.wikipedia.org&utm_campaign=index&utm_content=original",
      credit: "upload.wikimedia.org",
    },
    {
      kind: "text",
      heading: "Osaka, spring 1906",
      body: 'Japan\'s first Ferris wheel stood in Tennoji Park, at an exposition held to celebrate victory over Russia in the war of 1904–05. It was small and steam-driven: fourteen gondolas, six people each, about five minutes for a full turn, ten sen for two turns when a bread roll cost one sen. A band played beside it to keep the crowd excited.\n\nIt was not called a 観覧車 (kanransha), the word Japan uses now. The newspapers called it a 展望旋回車, roughly "rotating observation car," and that naming quirk is the reason it vanished.',
    },
    {
      kind: "text",
      heading: "Lost for ninety-five years",
      body: "For most of the twentieth century, encyclopedias said Japan's first Ferris wheel was the one at the Tokyo Industrial Exhibition in Ueno in 1907. Sōseki even put that wheel in a novel. Tokyo's papers had covered it; Tokyo's papers had ignored the Osaka fair the year before.\n\nIn 2001 the researcher Yūko Fukui went through microfilm of the Osaka Asahi and Osaka Mainichi at the National Diet Library and found the 1906 wheel sitting there in the coverage, under a name nobody had thought to search for. Researchers now think the Ueno wheel was the Osaka one, dismantled and moved, probably by way of Kobe that summer.\n\nSo the credit had been in the wrong city for nearly a century, and Osaka got it back because someone read old newspapers carefully.",
    },
    {
      kind: "diagram",
      heading: "How the idea travelled",
      mermaid:
        "flowchart LR\n  A[Paris 1889 Eiffel Tower] --> B[Chicago 1893 Ferris Wheel]\n  B --> C[Lincoln Park 1895 to 1903]\n  C --> D[St Louis fair 1904]\n  D --> E[Dynamited May 1906]\n  B --> F[Osaka Tennoji 1906]\n  F --> G[Ueno Tokyo 1907]\n  G --> H[Japan rooftop wheels 1990s]\n  H --> I[Osaka Wheel 2016]",
      caption:
        "The original never found a permanent home: it ran in Chicago, moved to Lincoln Park, moved again to the St. Louis fair, then took 200 pounds of dynamite on 11 May 1906. Its axle was reportedly dug up in Forest Park in 2007.",
    },
    {
      kind: "keyidea",
      statement:
        "A Ferris wheel is a bragging device: fairs built them to sell a city its own skyline, and Osaka has been in that business since 1906.",
      why: "It explains the whole history in one move. Chicago answering Paris, Tennoji Park answering a war, and a 123-metre wheel standing today on the site of Japan's own world expo are all the same idea repeating.",
    },
    {
      kind: "text",
      heading: "Which one were you on",
      body: "Osaka has four big wheels and they are easy to tell apart. If you were over the bay next to the aquarium, that was Tempozan: 112.5 metres, opened July 1997 for the port's hundredth birthday, briefly the tallest in the world, and its night lighting encodes tomorrow's weather forecast. If you were bright red and bolted to the roof of a shopping mall in Umeda, that was HEP Five, 106 metres at the top, boarding from the seventh floor since 1998.\n\nIf the wheel was oval rather than round, you were on Ebisu Tower at the Don Quijote in Dotonbori, 77.4 metres, which its operator calls the world's first oval Ferris wheel with cabins that turn horizontally as they go around.\n\nAnd if you were at Expocity in Suita with a transparent floor under your shoes, that was the Osaka Wheel: 123 metres, Japan's tallest, opened 1 July 2016, which its operator calls the first wheel anywhere built on base isolation, so an earthquake shakes the ground and not the ride. It stands on the grounds of Expo '70, which makes it a world's fair wheel in the most literal sense.",
      aside:
        'The word on every sign: 観覧車, kanransha. 観覧 is "viewing," 車 is "vehicle."',
    },
    {
      kind: "image",
      heading: "Osaka from the bay side",
      query: "Tempozan Ferris Wheel Osaka",
      alt: "The Tempozan Ferris Wheel lit up beside Osaka harbour",
      caption:
        "Tempozan was the world's tallest for two years after 1997, and it was among the first wheels anywhere with gondolas built for wheelchairs.",
      url: "https://upload.wikimedia.org/wikipedia/commons/8/86/Grand_ferris_wheel_of_Tempozan_Harbor_Village_2.jpg?utm_source=en.wikipedia.org&utm_campaign=index&utm_content=original",
      credit: "upload.wikimedia.org",
    },
    {
      kind: "learnmore",
      links: [
        {
          title: "Ferris Wheel (1893) — Wikipedia",
          url: "https://en.wikipedia.org/wiki/Ferris_Wheel_(1893)",
          why: "The hard numbers: the axle, the 36 cars, the ticket price, and the demolition date.",
        },
        {
          title: "Chicago's Ferris wheel story — Chicago Architecture Center",
          url: "https://www.architecture.org/online-resources/stories-of-chicago/chicagos-ferris-wheel-story",
          why: "Short and well told on Burnham's demand for something to beat the Eiffel Tower.",
        },
        {
          title: "観覧車三都物語: 日本初は大阪・天王寺 — 読売新聞",
          url: "https://www.yomiuri.co.jp/national/20240803-OYT1T50098/",
          why: "Fukui's research on the 1906 Osaka wheel and its move to Kobe and Tokyo. Good reading practice too.",
        },
        {
          title: "Ebisu Tower, Dotonbori — Don Quijote",
          url: "https://www.donki.com/kanransha/index_en.php",
          why: "The operator's own spec sheet for the oval wheel: 77.4 m, 32 gondolas, 15 minutes.",
        },
      ],
    },
  ],
};

export const ferrisQuiz: Quiz = {
  questions: [
    {
      kind: "mcq",
      prompt: "Why did Chicago build the first Ferris wheel in 1893?",
      choices: [
        "To carry fairgoers between distant parts of the fairground",
        "To give the world's fair a centrepiece that would outdo the Eiffel Tower",
        "To test a new kind of steel cable for bridge construction",
        "To celebrate a military victory",
      ],
      answer: 1,
      explanation:
        "Paris had the Eiffel Tower from 1889, and Burnham wanted Chicago's fair to answer it with something no one had seen.",
    },
    {
      kind: "mcq",
      prompt: "What finally happened to the original Chicago wheel?",
      choices: [
        "It still turns in Lincoln Park",
        "It was moved twice, ended up at the 1904 St. Louis fair, and was dynamited in May 1906 for scrap",
        "It collapsed during the 1893 fair and was never rebuilt",
        "It was shipped to Japan for the Tennoji exposition",
      ],
      answer: 1,
      explanation:
        "Chicago, then Lincoln Park from 1895, then St. Louis in 1904, then 200 pounds of dynamite on 11 May 1906.",
    },
    {
      kind: "mcq",
      prompt: "Where and when did Japan's first Ferris wheel run?",
      choices: [
        "Ueno, Tokyo, 1907, at the Industrial Exhibition",
        "Tennoji Park, Osaka, 1906, at a Russo-Japanese war victory exposition",
        "Tempozan, Osaka, 1997, for the port's centenary",
        "The Expo '70 site in Suita",
      ],
      answer: 1,
      explanation:
        "The Tennoji wheel came a year before Ueno's, and researchers think Ueno's was the same machine, taken apart and moved.",
    },
    {
      kind: "mcq",
      prompt:
        "Why did the 1906 Osaka wheel drop out of the history books for almost a century?",
      choices: [
        "It never actually carried passengers",
        "It was called a 展望旋回車 rather than a 観覧車, and Tokyo's papers ignored the Osaka fair",
        "Its records were destroyed in wartime bombing",
        "It was too small to count as a real Ferris wheel",
      ],
      answer: 1,
      explanation:
        "Nobody searching for 観覧車 would find it, so Ueno 1907 kept the credit until Yūko Fukui found the Osaka newspaper coverage in 2001.",
    },
    {
      kind: "mcq",
      prompt:
        "A wheel 123 metres tall, transparent floors, built on base isolation, standing on the old Expo '70 grounds. Which one?",
      choices: [
        "Tempozan",
        "HEP Five",
        "Ebisu Tower",
        "The Osaka Wheel at Expocity",
      ],
      answer: 3,
      explanation:
        "Japan's tallest, opened July 2016, and, by its operator's account, the first wheel anywhere designed so the ground can shake without the wheel doing the same.",
    },
    {
      kind: "short",
      prompt: "In one sentence: what was the first Ferris wheel built for?",
      rubric:
        "Must say it was the centrepiece of Chicago's 1893 world's fair, built to rival or outdo the Eiffel Tower from Paris 1889. Any wording; the fair-plus-rivalry idea is the thing.",
    },
  ],
};

export const ferrisBeats: LessonBeat[] = [
  {
    kind: "checkin",
    prompt:
      "Which Osaka wheel were you actually on Sunday: the one by the aquarium, the red one on the mall roof, the oval one at Don Quijote, or the tall one out at Expocity?",
    rubric:
      "Any of the four identified clearly. If they name it, note the matching detail back to them: Tempozan's weather lights, HEP Five's seventh-floor boarding, Ebisu Tower's oval, the Osaka Wheel's glass floor and base isolation.",
  },
  {
    kind: "scenario",
    prompt:
      "Back on the ground, someone in the queue behind you asks whether this is the biggest Ferris wheel in Japan. What do you tell them?",
    rubric:
      "Knows the Osaka Wheel at Expocity is Japan's tallest at 123 m, and can place the others roughly: Tempozan 112.5 m, HEP Five 106 m, Ebisu Tower 77.4 m.",
  },
  {
    kind: "teachback",
    prompt:
      "Into the mic, two sentences: why does a Ferris wheel exist at all? Say it like you're explaining it to the person in the gondola with you.",
    rubric:
      "Must land the 1893 Chicago fair needing a centrepiece to answer the Eiffel Tower. Bonus if they mention that fairs kept doing it, and that Osaka's own first wheel came from a victory exposition in 1906.",
  },
  {
    kind: "mission",
    prompt:
      "Tomorrow, tell someone the Osaka 1906 story: Japan's first wheel was here, not Tokyo, and it was lost for ninety-five years because it was called the wrong word. Then try the Japanese line: 日本で最初の観覧車は大阪にありました.",
    rubric:
      "Told a real person, and got both halves out: Osaka 1906 first, and the naming mix-up that hid it. Attempting the Japanese sentence aloud counts even if the delivery wobbles.",
  },
];

export const ferrisCitations = [
  {
    title: "Ferris Wheel (1893) — Wikipedia",
    url: "https://en.wikipedia.org/wiki/Ferris_Wheel_(1893)",
  },
  {
    title: "Chicago's Ferris wheel story — Chicago Architecture Center",
    url: "https://www.architecture.org/online-resources/stories-of-chicago/chicagos-ferris-wheel-story",
  },
  {
    title: "The Ferris Wheel — Hyde Park Historical Society",
    url: "https://www.hydeparkhistory.org/ferris-wheel",
  },
  {
    title:
      "明治末に人々が心躍らせた「観覧車三都物語」…日本初の大阪・天王寺 — 読売新聞",
    url: "https://www.yomiuri.co.jp/national/20240803-OYT1T50098/",
  },
  {
    title: "日本の観覧車の誕生 — Ferris Wheel Global Project",
    url: "https://www.fwgp.com/column/fwbirthjapan",
  },
  {
    title: "日本初の観覧車 — 探検コム",
    url: "https://tanken.com/kanran.html",
  },
  {
    title: "戦捷記念博覧会 — 乃村工藝社 博覧会資料コレクション",
    url: "https://www.nomurakougei.co.jp/expo/exposition/detail?e_code=1402",
  },
  {
    title: "Tempozan Ferris Wheel — Wikipedia",
    url: "https://en.wikipedia.org/wiki/Tempozan_Ferris_Wheel",
  },
  {
    title: "Redhorse Osaka Wheel — OSAKA-INFO",
    url: "https://osaka-info.jp/experience/en/osaka/spot/418",
  },
  {
    title: 'Dotonbori Ferris Wheel "Ebisu Tower" — Don Quijote',
    url: "https://www.donki.com/kanransha/index_en.php",
  },
  {
    title:
      "Japan's largest Ferris Wheel opens in Osaka's Expocity — Bureau International des Expositions",
    url: "https://www.bie-paris.org/site/en/latest/blog/entry/japan-s-largest-ferris-wheel-opens-in-osaka-s-expocity",
  },
];

export const ferrisReview = {
  checks: [
    {
      id: "own-words",
      ok: true,
      detail:
        "Every quote from your week matches something Rhubarb actually heard.",
    },
    {
      id: "uses-a-moment",
      ok: true,
      detail: "It teaches from a moment in your own week.",
    },
    {
      id: "length",
      ok: true,
      detail: "12 cards. A lesson should be 6 to 14.",
    },
    {
      id: "one-idea-a-card",
      ok: false,
      detail: "2 cards are too long to take in at once.",
    },
    {
      id: "quiz",
      ok: true,
      detail: "6 questions, each with one answer that can be marked.",
    },
    {
      id: "sources",
      ok: true,
      detail: "4 further-reading links, all real addresses.",
    },
    {
      id: "diagram",
      ok: true,
      detail: "The diagram is small enough to read at a glance.",
    },
  ],
  inventedQuotes: [],
  checkedAt: 1790752929139,
};
