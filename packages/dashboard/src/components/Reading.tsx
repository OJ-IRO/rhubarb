import type { Familiarity, ReadingLevel } from "@rhubarb/core";

export type ScriptLanguage = "japanese" | "korean" | "chinese";

/** Which language a plan is about, from its name, domain and brief: the same rule the server uses. */
export function planLanguage(p: { name: string; domain: string | null; brief: string }): ScriptLanguage | null {
  return languagesIn([p.name, p.domain ?? "", p.brief])[0] ?? null;
}

/** The same rule the server uses: which learned languages have a script of their own. */
export function languagesIn(goals: string[]): ScriptLanguage[] {
  const text = goals.join(" ").toLowerCase();
  const out: ScriptLanguage[] = [];
  if (/japanese|日本語|nihongo/.test(text)) out.push("japanese");
  if (/korean|한국어|hangul/.test(text)) out.push("korean");
  if (/chinese|mandarin|cantonese|中文|汉语|漢語/.test(text)) out.push("chinese");
  return out;
}

const NAME: Record<ScriptLanguage, string> = { japanese: "Japanese", korean: "Korean", chinese: "Chinese" };

const LEVELS: Record<ScriptLanguage, Array<{ id: ReadingLevel; name: string; blurb: string }>> = {
  japanese: [
    { id: "none", name: "Not yet", blurb: "Romaji and English beside every phrase" },
    { id: "basic", name: "Kana", blurb: "Readings over kanji, English for new words" },
    { id: "most", name: "Most kanji", blurb: "Help only with rare kanji" },
    { id: "fluent", name: "Fluent", blurb: "No help needed" },
  ],
  korean: [
    { id: "none", name: "Not yet", blurb: "Romanization and English beside every phrase" },
    { id: "basic", name: "Hangul, slowly", blurb: "English for new words" },
    { id: "most", name: "Most words", blurb: "Help only with tricky words" },
    { id: "fluent", name: "Fluent", blurb: "No help needed" },
  ],
  chinese: [
    { id: "none", name: "Not yet", blurb: "Pinyin and English beside every phrase" },
    { id: "basic", name: "Some characters", blurb: "Pinyin on every word, English for new ones" },
    { id: "most", name: "Most characters", blurb: "Help only with rare characters" },
    { id: "fluent", name: "Fluent", blurb: "No help needed" },
  ],
};

/** How well they read a language: decides how much reading help every lesson, letter and spark gives. */
export function ReadingPicker({ lang, value, onChange, question }: { lang: ScriptLanguage; value: ReadingLevel | null | undefined; onChange: (v: ReadingLevel) => void; question?: string }) {
  const current = value ?? "basic";
  return (
    <div className="reading-pick">
      <p className="reading-q">{question ?? `How well do you read ${NAME[lang]} for this?`}</p>
      <div className="choices row" role="radiogroup" aria-label={`How well you read ${NAME[lang]}`}>
        {LEVELS[lang].map((l) => (
          <button key={l.id} role="radio" aria-checked={current === l.id} className={current === l.id ? "choice on" : "choice"} onClick={() => onChange(l.id)}>
            <strong>{l.name}</strong>
            <span>{l.blurb}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

const STARTS: Array<{ id: Familiarity; name: string }> = [
  { id: "new", name: "New to this" },
  { id: "some", name: "Know some" },
  { id: "comfortable", name: "Comfortable" },
];

/** Where they start: the first lesson is pitched here instead of at the very beginning. */
export function StartingPoint({ value, onChange, label = "How much do you know already?" }: { value: Familiarity | null; onChange: (v: Familiarity) => void; label?: string }) {
  return (
    <div className="starting-point">
      <p className="muted small">{label}</p>
      <div className="chips" role="radiogroup" aria-label={label}>
        {STARTS.map((s) => (
          <button key={s.id} role="radio" aria-checked={value === s.id} className={value === s.id ? "chip on" : "chip"} onClick={() => onChange(s.id)}>
            {s.name}
          </button>
        ))}
      </div>
    </div>
  );
}
