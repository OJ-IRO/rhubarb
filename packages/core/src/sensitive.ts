/**
 * Things Rhubarb hears but must never turn into a lesson, whatever the profile says.
 *
 * A wearable overhears the worst moments of a day along with the best. A learning tool has no
 * business clustering someone's crisis, diagnosis or card number into "skills their life is asking
 * for", or quoting it back to them in a lesson. These lines are dropped before any evidence is
 * written and before any model sees them.
 *
 * The test is whether the line is a PERSONAL disclosure, not whether it touches a topic. A nurse
 * saying "how does metformin work" is learning. "My doctor put me on metformin" is private.
 * This is a floor, not the whole defence: the off-limits list in settings and the classifier's
 * own instructions sit on top of it.
 */

export type SensitiveReason = "crisis" | "health" | "secret" | "legal" | "intimate";

const RULES: Array<{ reason: SensitiveReason; pattern: RegExp }> = [
  // Someone in danger. Rhubarb is not a therapist or an emergency service and must not act like one.
  { reason: "crisis", pattern: /\b(kill(ing)? myself|end(ing)? my life|want(ed)? to die|suicid\w*|self[- ]?harm\w*|hurt(ing)? myself|don'?t want to (be here|live)|better off without me|overdos\w+)\b/i },
  // First-person health disclosures, not health as a subject.
  { reason: "health", pattern: /\b(my|i'?m on|i take|i was|i'?ve been|i got|i have|i had)\b[^.?!]{0,40}\b(diagnos\w+|therap(y|ist)|psychiatrist|antidepressant\w*|medication|meds|prescri\w+|chemo\w*|biopsy|miscarriage|rehab|relapse\w*|panic attack\w*|depress\w+|anxiety disorder|bipolar|hiv|std|sti)\b/i },
  // Credentials and account numbers read out loud.
  { reason: "secret", pattern: /\b(password|passcode|pin( number| code)?|social security( number)?|ssn|routing number|account number|card number|cvv|security code|seed phrase|recovery phrase)\b[^.?!]{0,30}\b(is|are|was)\b/i },
  { reason: "secret", pattern: /\b(?:\d[ -]?){13,19}\b/ },
  { reason: "secret", pattern: /\b\d{3}[- ]\d{2}[- ]\d{4}\b/ },
  // The wearer's own legal trouble.
  { reason: "legal", pattern: /\b(my|i was|i got|i'?m being|i'?ve been)\b[^.?!]{0,30}\b(arrest\w*|lawsuit|sued|restraining order|custody (battle|hearing|case)|probation|parole|dui|indict\w+|deport\w+)\b/i },
  { reason: "intimate", pattern: /\b(my|our|i'?m|we'?re)\b[^.?!]{0,30}\b(sex life|affair|cheat(ed|ing) on|pregnan\w+|divorce)\b/i },
];

/** Why this line must be left alone, or null if it is ordinary speech. */
export function sensitiveReason(text: string): SensitiveReason | null {
  for (const r of RULES) if (r.pattern.test(text)) return r.reason;
  return null;
}
